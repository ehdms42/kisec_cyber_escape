-- 배포(세션)마다 재응시 허용 여부를 정한다.
-- 허용된 세션에서는 이미 완료한 참가자가 다시 들어오면 같은 응시 기록을
-- 초기화해 처음부터 다시 풀게 한다. 리더보드·결과에는 마지막 완료 기록이 남는다.
-- 경품이 지정된 응시 기록은 초기화하지 않는다.

alter table public.campaigns
  add column if not exists allow_retake boolean not null default false;

drop function if exists public.get_campaign_public(text);

create function public.get_campaign_public(p_public_token text)
returns table (
  campaign_id uuid,
  campaign_title text,
  institution_name text,
  required_question_count integer,
  leaderboard_visible boolean,
  allow_retake boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select c.id, c.title, i.name, c.required_question_count, c.leaderboard_visible,
    c.allow_retake
  from public.campaigns c
  join public.institutions i on i.id = c.institution_id
  where c.public_token = trim(p_public_token)
    and c.active
    and i.active
    and (c.starts_at is null or c.starts_at <= now())
    and (c.ends_at is null or c.ends_at > now());
$$;
revoke all on function public.get_campaign_public(text) from public;
grant execute on function public.get_campaign_public(text) to anon, authenticated;

create or replace function public.start_or_resume_attempt(
  p_public_token text,
  p_participant_code text,
  p_nickname text,
  p_device_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_campaign public.campaigns%rowtype;
  target_institution public.institutions%rowtype;
  target_participant public.participants%rowtype;
  target_attempt public.game_attempts%rowtype;
  target_code public.campaign_department_codes%rowtype;
  normalized_hash text;
  reset_attempt_id uuid;
begin
  if length(trim(p_participant_code)) < 4 then
    raise exception '참여 코드는 4자 이상이어야 합니다.';
  end if;
  if length(trim(p_nickname)) < 2 then
    raise exception '요원명은 2자 이상이어야 합니다.';
  end if;

  select c.* into target_campaign
  from public.campaigns c
  join public.institutions i on i.id = c.institution_id
  where c.public_token = trim(p_public_token)
    and c.active
    and i.active
    and (c.starts_at is null or c.starts_at <= now())
    and (c.ends_at is null or c.ends_at > now());
  if not found then
    raise exception '유효하지 않거나 종료된 배포 링크입니다.';
  end if;

  if public.participant_code_blocked(target_campaign.id) then
    raise exception '참여 코드 확인에 여러 번 실패했습니다. 10분 후 다시 시도해 주세요.';
  end if;

  select * into target_institution
  from public.institutions
  where id = target_campaign.institution_id;

  select * into target_code
  from public.campaign_department_codes
  where campaign_id = target_campaign.id
    and code_key = lower(btrim(p_participant_code));

  if found then
    -- 부서 코드: 기기(브라우저)마다 참가자 한 명, 응시 한 번.
    if p_device_id is null or p_device_id !~ '^[A-Za-z0-9-]{16,64}$' then
      raise exception '브라우저 정보를 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.';
    end if;
    normalized_hash := encode(
      extensions.digest('device:' || p_device_id, 'sha256'),
      'hex'
    );

    select * into target_participant
    from public.participants
    where campaign_id = target_campaign.id
      and identifier_hash = normalized_hash;

    if not found then
      insert into public.participants (
        campaign_id, nickname, identifier_hash, department, registered_by
      )
      values (
        target_campaign.id,
        left(trim(p_nickname), 24),
        normalized_hash,
        target_code.department,
        'self'
      )
      on conflict (campaign_id, identifier_hash) do nothing
      returning * into target_participant;

      if target_participant.id is null then
        select * into target_participant
        from public.participants
        where campaign_id = target_campaign.id
          and identifier_hash = normalized_hash;
      end if;
    end if;
    -- 이미 응시한 기기는 처음 정한 요원명·부서를 그대로 쓴다.
  else
    -- 개인별 참여 코드(사전등록).
    normalized_hash := encode(
      extensions.digest(lower(trim(p_participant_code)), 'sha256'),
      'hex'
    );

    select * into target_participant
    from public.participants
    where campaign_id = target_campaign.id
      and identifier_hash = normalized_hash;

    if not found then
      perform public.register_participant_code_failure(target_campaign.id);
      return jsonb_build_object(
        'error', '등록되지 않은 참여 코드입니다. 담당자에게 문의해 주세요.'
      );
    end if;

    update public.participants
    set nickname = left(trim(p_nickname), 24)
    where id = target_participant.id
    returning * into target_participant;
  end if;

  -- 재응시 허용 세션: 완료한 기록을 초기화해 새로 시작한다.
  if target_campaign.allow_retake then
    update public.game_attempts a
    set status = 'in_progress',
        resume_token = gen_random_uuid(),
        state = '{}'::jsonb,
        verified_score = 0,
        answered_count = 0,
        hint_penalty_total = 0,
        started_at = now(),
        last_seen_at = now(),
        completed_at = null,
        adjusted_by = null,
        adjusted_by_login_id = null,
        adjustment_reason = null
    where a.participant_id = target_participant.id
      and a.campaign_id = target_campaign.id
      and a.status = 'completed'
      and not exists (
        select 1 from public.prize_awards p where p.attempt_id = a.id
      )
    returning a.id into reset_attempt_id;

    if reset_attempt_id is not null then
      delete from public.attempt_answers where attempt_id = reset_attempt_id;
      delete from public.attempt_hint_usage where attempt_id = reset_attempt_id;
    end if;
  end if;

  insert into public.game_attempts (participant_id, campaign_id)
  values (target_participant.id, target_campaign.id)
  on conflict (participant_id, campaign_id)
  do update set last_seen_at = case
    when game_attempts.status = 'in_progress' then now()
    else game_attempts.last_seen_at
  end
  returning * into target_attempt;

  return jsonb_build_object(
    'attempt_id', target_attempt.id,
    'resume_token', case when target_attempt.status = 'in_progress'
      then target_attempt.resume_token else null end,
    'status', target_attempt.status,
    'nickname', target_participant.nickname,
    'department', target_participant.department,
    'security_level', target_participant.security_level,
    'institution_name', target_institution.name,
    'campaign_title', target_campaign.title,
    'required_question_count', target_campaign.required_question_count,
    'state', target_attempt.state,
    'verified_score', target_attempt.verified_score,
    'answered_count', target_attempt.answered_count,
    'started_at', target_attempt.started_at,
    'completed_at', target_attempt.completed_at
  );
end;
$$;

revoke all on function public.start_or_resume_attempt(text, text, text, text)
  from public;
grant execute on function public.start_or_resume_attempt(text, text, text, text)
  to anon, authenticated;
