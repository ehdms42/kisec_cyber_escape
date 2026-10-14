-- 참여 코드가 이미 등록(관리자 사전등록/CSV 포함)된 상태라면, 입장 시 입력한
-- 부서명이 등록된 부서명과 일치해야 한다. 참여 코드 공유나 오타로 인해 다른
-- 부서명으로 기록이 덮어써지는 것을 막기 위함이다. 닉네임은 기존처럼 자유롭게
-- 갱신 가능하고, 부서명은 최초 1회 기록된 값으로 고정된다.

create or replace function public.start_or_resume_attempt(
  p_public_token text,
  p_participant_code text,
  p_nickname text,
  p_department text
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
  normalized_department text;
  existing_department text;
begin
  if length(trim(p_participant_code)) < 4 then
    raise exception '참여 코드는 4자 이상이어야 합니다.';
  end if;
  if length(trim(p_nickname)) < 2 then
    raise exception '요원명은 2자 이상이어야 합니다.';
  end if;
  if length(trim(p_department)) < 2 then
    raise exception '부서명은 2자 이상이어야 합니다.';
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
  normalized_department := left(trim(p_department), 60);

  -- 같은 참여 코드로 이미 등록된 기록(관리자 사전등록 포함)이 있으면
  -- 입력한 부서명이 일치하는지 확인한다.
  select department into existing_department
  from public.participants
  where campaign_id = target_campaign.id and identifier_hash = normalized_hash;

  if found and length(trim(existing_department)) > 0
     and lower(trim(existing_department)) <> lower(normalized_department) then
    raise exception '입력하신 부서명이 등록된 참여 코드의 부서 정보와 일치하지 않습니다. 담당자에게 문의해 주세요.';
  end if;

  insert into public.participants (
    campaign_id,
    nickname,
    department,
    identifier_hash
  ) values (
    target_campaign.id,
    left(trim(p_nickname), 24),
    normalized_department,
    normalized_hash
  )
  on conflict (campaign_id, identifier_hash)
  do update set
    nickname = excluded.nickname,
    department = case
      when length(trim(public.participants.department)) > 0
        then public.participants.department
      else excluded.department
    end
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

revoke all on function public.start_or_resume_attempt(text, text, text, text)
  from public;
grant execute on function public.start_or_resume_attempt(text, text, text, text)
  to anon, authenticated;
