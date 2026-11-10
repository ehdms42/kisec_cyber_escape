-- 부서별 공용 참여 코드.
-- 관리자는 배포마다 "부서명 + 참여 코드"만 등록하고, 참가자는 부서 코드를 입력한 뒤
-- 요원명을 자유롭게 정해 입장한다. 같은 코드를 여러 사람이 쓰므로 응시자는
-- 브라우저마다 만든 기기 ID로 구분하고, 기기(브라우저)당 한 번만 응시할 수 있다.
-- 기존 개인별 참여 코드(participants 사전등록)도 계속 동작한다.
-- 202611100002_participant_code_throttle.sql을 먼저 적용해야 한다.

create table if not exists public.campaign_department_codes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  department text not null
    check (length(btrim(department)) between 1 and 60),
  code text not null check (length(btrim(code)) between 6 and 40),
  code_key text generated always as (lower(btrim(code))) stored,
  created_at timestamptz not null default now(),
  unique (campaign_id, code_key),
  unique (campaign_id, department)
);

alter table public.campaign_department_codes enable row level security;
revoke all on table public.campaign_department_codes from anon, authenticated;
grant select, insert, update, delete on table public.campaign_department_codes
  to service_role;

create or replace function public.lookup_participant_department(
  p_public_token text,
  p_participant_code text
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_campaign_id uuid;
  normalized_hash text;
  result_department text;
begin
  if length(trim(p_participant_code)) < 4 then
    raise exception '참여 코드는 4자 이상이어야 합니다.';
  end if;

  select c.id into target_campaign_id
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

  if public.participant_code_blocked(target_campaign_id) then
    raise exception '참여 코드 확인에 여러 번 실패했습니다. 10분 후 다시 시도해 주세요.';
  end if;

  select department into result_department
  from public.campaign_department_codes
  where campaign_id = target_campaign_id
    and code_key = lower(btrim(p_participant_code));
  if found then
    return result_department;
  end if;

  normalized_hash := encode(
    extensions.digest(lower(trim(p_participant_code)), 'sha256'),
    'hex'
  );

  select department into result_department
  from public.participants
  where campaign_id = target_campaign_id and identifier_hash = normalized_hash;

  if not found then
    perform public.register_participant_code_failure(target_campaign_id);
    return null;
  end if;

  return coalesce(nullif(trim(result_department), ''), '부서 미지정');
end;
$$;

revoke all on function public.lookup_participant_department(text, text)
  from public;
grant execute on function public.lookup_participant_department(text, text)
  to anon, authenticated;

-- 기기 ID 인자를 추가한다. 기존 3개 인자 호출도 기본값으로 계속 동작한다.
drop function if exists public.start_or_resume_attempt(text, text, text);

create function public.start_or_resume_attempt(
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
