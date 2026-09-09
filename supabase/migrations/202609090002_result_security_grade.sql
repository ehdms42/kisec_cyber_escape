-- 정보보안 등급은 사전 입력값이 아니라 탈출 완료 시 서버 검증 정답률로 확정한다.
-- 60% 미만: 초급, 60% 이상: 중급, 80% 이상: 고급

alter table public.participants
  drop constraint if exists participants_security_level_check;
alter table public.participants
  alter column security_level drop default,
  alter column security_level drop not null;
alter table public.participants
  add constraint participants_security_level_check
  check (
    security_level is null
    or security_level in ('beginner', 'intermediate', 'advanced')
  );

alter table public.live_leaderboard_entries
  drop constraint if exists live_leaderboard_entries_security_level_check;
alter table public.live_leaderboard_entries
  alter column security_level drop not null;
alter table public.live_leaderboard_entries
  add constraint live_leaderboard_entries_security_level_check
  check (
    security_level is null
    or security_level in ('beginner', 'intermediate', 'advanced')
  );

-- 기존 완료 기록도 같은 기준으로 다시 계산한다.
update public.participants p
set security_level = case
  when a.verified_score * 100 >= c.required_question_count * 80
    then 'advanced'
  when a.verified_score * 100 >= c.required_question_count * 60
    then 'intermediate'
  else 'beginner'
end
from public.game_attempts a
join public.campaigns c on c.id = a.campaign_id
where a.participant_id = p.id
  and a.status = 'completed';

update public.participants p
set security_level = null
from public.game_attempts a
where a.participant_id = p.id
  and a.status <> 'completed';

update public.live_leaderboard_entries e
set security_level = p.security_level,
    updated_at = clock_timestamp()
from public.game_attempts a
join public.participants p on p.id = a.participant_id
where e.attempt_id = a.id;

drop function if exists public.start_or_resume_attempt(text, text, text, text, text);

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

  insert into public.participants (
    campaign_id,
    nickname,
    department,
    identifier_hash
  ) values (
    target_campaign.id,
    left(trim(p_nickname), 24),
    left(trim(p_department), 60),
    normalized_hash
  )
  on conflict (campaign_id, identifier_hash)
  do update set
    nickname = excluded.nickname,
    department = excluded.department
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

create or replace function public.complete_attempt(
  p_attempt_id uuid,
  p_resume_token uuid,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_attempt public.game_attempts%rowtype;
  required_count integer;
  result_security_level text;
  sanitized_state jsonb;
begin
  if p_state is not null and jsonb_typeof(p_state) <> 'object' then
    raise exception '진행 상황 형식이 올바르지 않습니다.';
  end if;
  if p_state is not null and pg_column_size(p_state) > 65536 then
    raise exception '진행 상황 데이터가 너무 큽니다.';
  end if;

  select a.* into target_attempt
  from public.game_attempts a
  where a.id = p_attempt_id
    and a.resume_token = p_resume_token
  for update of a;
  if not found or target_attempt.status <> 'in_progress' then
    raise exception '완료할 수 있는 응시 기록이 없습니다.';
  end if;

  select required_question_count into required_count
  from public.campaigns
  where id = target_attempt.campaign_id;
  if target_attempt.answered_count < required_count then
    raise exception '필수 문항 응답이 모두 기록되지 않았습니다.';
  end if;

  result_security_level := case
    when target_attempt.verified_score * 100 >= required_count * 80
      then 'advanced'
    when target_attempt.verified_score * 100 >= required_count * 60
      then 'intermediate'
    else 'beginner'
  end;

  sanitized_state := (
      coalesce(p_state, target_attempt.state, '{}'::jsonb)
      - 'score'
      - 'answeredCount'
    ) || jsonb_build_object(
      'score', target_attempt.verified_score,
      'answeredCount', target_attempt.answered_count
    );

  update public.game_attempts
  set status = 'completed',
      state = sanitized_state,
      completed_at = now(),
      last_seen_at = now()
  where id = p_attempt_id
  returning * into target_attempt;

  update public.participants
  set security_level = result_security_level
  where id = target_attempt.participant_id;

  return jsonb_build_object(
    'verified_score', target_attempt.verified_score,
    'answered_count', target_attempt.answered_count,
    'security_level', result_security_level,
    'completed_at', target_attempt.completed_at
  );
end;
$$;

revoke all on function public.complete_attempt(uuid, uuid, jsonb)
  from public;
grant execute on function public.complete_attempt(uuid, uuid, jsonb)
  to anon, authenticated;

drop function if exists public.admin_get_rankings(uuid);

create function public.admin_get_rankings(p_campaign_id uuid default null)
returns table (
  rank integer,
  attempt_id uuid,
  campaign_id uuid,
  campaign_title text,
  institution_name text,
  nickname text,
  department text,
  security_level text,
  verified_score integer,
  answered_count integer,
  elapsed_seconds integer,
  started_at timestamptz,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception '관리자 서버 권한이 필요합니다.';
  end if;
  return query
  select r.rank,
         r.attempt_id,
         r.campaign_id,
         r.campaign_title,
         r.institution_name,
         r.nickname,
         r.department,
         r.security_level,
         r.verified_score,
         r.answered_count,
         r.elapsed_seconds,
         r.started_at,
         r.completed_at
  from public.campaign_rankings r
  where p_campaign_id is null or r.campaign_id = p_campaign_id
  order by r.campaign_title, r.rank;
end;
$$;

revoke all on function public.admin_get_rankings(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_get_rankings(uuid)
  to service_role;
