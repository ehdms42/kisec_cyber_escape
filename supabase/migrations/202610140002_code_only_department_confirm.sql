-- 참여 화면에서 부서명을 직접 타이핑하는 대신, 참여 코드만 입력받아 관리자가
-- 사전등록한 부서명을 조회해 확인(팝업)시키는 흐름으로 바꾼다.
-- 이제 참여 코드는 반드시 사전에(관리자 수동등록/CSV) 등록되어 있어야 한다.

create or replace function public.lookup_participant_department(
  p_public_token text,
  p_participant_code text
)
returns text
language plpgsql
stable
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

  normalized_hash := encode(
    extensions.digest(lower(trim(p_participant_code)), 'sha256'),
    'hex'
  );

  select department into result_department
  from public.participants
  where campaign_id = target_campaign_id and identifier_hash = normalized_hash;

  if not found or length(trim(result_department)) = 0 then
    raise exception '등록되지 않은 참여 코드입니다. 담당자에게 문의해 주세요.';
  end if;

  return result_department;
end;
$$;

revoke all on function public.lookup_participant_department(text, text)
  from public;
grant execute on function public.lookup_participant_department(text, text)
  to anon, authenticated;

-- start_or_resume_attempt에서 p_department 입력을 제거한다. 부서명은 더 이상
-- 참가자가 직접 입력하지 않고, 사전등록된 participants.department 값을
-- 그대로 사용한다. 사전등록되지 않은 코드는 거부한다(현장 자율 입장 불가).
drop function if exists public.start_or_resume_attempt(text, text, text, text);

create function public.start_or_resume_attempt(
  p_public_token text,
  p_participant_code text,
  p_nickname text
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

  select * into target_institution
  from public.institutions
  where id = target_campaign.institution_id;

  normalized_hash := encode(
    extensions.digest(lower(trim(p_participant_code)), 'sha256'),
    'hex'
  );

  select * into target_participant
  from public.participants
  where campaign_id = target_campaign.id and identifier_hash = normalized_hash;

  if not found or length(trim(target_participant.department)) = 0 then
    raise exception '등록되지 않은 참여 코드입니다. 담당자에게 문의해 주세요.';
  end if;

  update public.participants
  set nickname = left(trim(p_nickname), 24)
  where id = target_participant.id
  returning * into target_participant;

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

revoke all on function public.start_or_resume_attempt(text, text, text)
  from public;
grant execute on function public.start_or_resume_attempt(text, text, text)
  to anon, authenticated;
