-- 관리자 데이터 변경은 전용 API 서버(service_role)에서만 수행한다.
-- 참여자 기록에는 화면에서 입력한 소속 부서명을 함께 저장한다.

alter table public.participants
  add column if not exists department text not null default '';

alter table public.attempt_adjustments
  drop constraint if exists attempt_adjustments_admin_id_fkey;
alter table public.attempt_adjustments
  alter column admin_id type text using admin_id::text,
  alter column admin_id drop not null;

alter table public.game_attempts
  drop constraint if exists game_attempts_adjusted_by_fkey;
alter table public.game_attempts
  alter column adjusted_by type text using adjusted_by::text;

alter table public.prize_awards
  drop constraint if exists prize_awards_handled_by_fkey;
alter table public.prize_awards
  alter column handled_by type text using handled_by::text,
  alter column handled_by drop not null;

create table if not exists public.admin_session_revocations (
  nonce text primary key,
  expires_at timestamptz not null,
  revoked_by text not null,
  created_at timestamptz not null default now()
);

alter table public.admin_session_revocations enable row level security;
revoke all on public.admin_session_revocations from public, anon, authenticated;
grant select, insert, update, delete on public.admin_session_revocations
  to service_role;

drop policy if exists "admins manage institutions" on public.institutions;
drop policy if exists "admins manage campaigns" on public.campaigns;
drop policy if exists "admins manage participants" on public.participants;
drop policy if exists "admins manage attempts" on public.game_attempts;
drop policy if exists "admins read attempt answers" on public.attempt_answers;
drop policy if exists "admins read attempt adjustments" on public.attempt_adjustments;
drop policy if exists "admins manage prize awards" on public.prize_awards;

revoke all on public.institutions from authenticated;
revoke all on public.campaigns from authenticated;
revoke all on public.participants from authenticated;
revoke all on public.game_attempts from authenticated;
revoke all on public.attempt_answers from authenticated;
revoke all on public.attempt_adjustments from authenticated;
revoke all on public.prize_awards from authenticated;

revoke all on function public.start_or_resume_attempt(text, text, text)
  from public, anon, authenticated;
drop function public.start_or_resume_attempt(text, text, text);

create function public.start_or_resume_attempt(
  p_public_token text,
  p_participant_code text,
  p_nickname text,
  p_department text
)
returns jsonb
language plpgsql
security definer
set search_path = public
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
    and c.active and i.active
    and (c.starts_at is null or c.starts_at <= now())
    and (c.ends_at is null or c.ends_at > now());
  if not found then
    raise exception '유효하지 않거나 종료된 배포 링크입니다.';
  end if;

  select * into target_institution
  from public.institutions where id = target_campaign.institution_id;

  normalized_hash := encode(
    extensions.digest(lower(trim(p_participant_code)), 'sha256'),
    'hex'
  );

  insert into public.participants
    (campaign_id, nickname, department, identifier_hash)
  values (
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

revoke all on function public.admin_adjust_attempt(uuid, text, text)
  from public, anon, authenticated;
drop function public.admin_adjust_attempt(uuid, text, text);

create function public.admin_adjust_attempt(
  p_attempt_id uuid,
  p_action text,
  p_reason text,
  p_admin_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_attempt public.game_attempts%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception '관리자 서버 권한이 필요합니다.';
  end if;
  if p_action not in ('resume', 'void', 'reset') then
    raise exception '잘못된 조정입니다.';
  end if;
  if length(trim(p_reason)) < 3 then
    raise exception '조정 사유를 입력해 주세요.';
  end if;

  select * into target_attempt
  from public.game_attempts
  where id = p_attempt_id
  for update;
  if not found then
    raise exception '응시 기록을 찾을 수 없습니다.';
  end if;

  insert into public.attempt_adjustments
    (attempt_id, admin_id, action, reason, previous_status)
  values (
    target_attempt.id,
    p_admin_id,
    p_action,
    trim(p_reason),
    target_attempt.status
  );

  if p_action = 'reset' then
    delete from public.attempt_answers where attempt_id = p_attempt_id;
    update public.game_attempts
    set status = 'in_progress',
        state = '{}'::jsonb,
        verified_score = 0,
        answered_count = 0,
        started_at = now(),
        last_seen_at = now(),
        completed_at = null,
        resume_token = gen_random_uuid(),
        adjusted_by = p_admin_id,
        adjustment_reason = trim(p_reason)
    where id = p_attempt_id;
  elsif p_action = 'resume' then
    update public.game_attempts
    set status = 'in_progress',
        completed_at = null,
        last_seen_at = now(),
        adjusted_by = p_admin_id,
        adjustment_reason = trim(p_reason)
    where id = p_attempt_id;
  else
    update public.game_attempts
    set status = 'voided',
        adjusted_by = p_admin_id,
        adjustment_reason = trim(p_reason)
    where id = p_attempt_id;
  end if;
end;
$$;

revoke all on function public.admin_adjust_attempt(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_adjust_attempt(uuid, text, text, text)
  to service_role;

drop function if exists public.admin_get_rankings(uuid);

create or replace view public.campaign_rankings
with (security_invoker = true)
as
select
  row_number() over (
    partition by a.campaign_id
    order by
      a.verified_score desc,
      extract(epoch from (a.completed_at - a.started_at)) asc,
      a.completed_at asc,
      a.id asc
  )::integer as rank,
  a.id as attempt_id,
  a.campaign_id,
  c.title as campaign_title,
  i.name as institution_name,
  p.nickname,
  a.verified_score,
  a.answered_count,
  greatest(
    0,
    floor(extract(epoch from (a.completed_at - a.started_at)))
  )::integer as elapsed_seconds,
  a.started_at,
  a.completed_at,
  p.department
from public.game_attempts a
join public.participants p on p.id = a.participant_id
join public.campaigns c on c.id = a.campaign_id
join public.institutions i on i.id = c.institution_id
where a.status = 'completed' and a.completed_at is not null;

create function public.admin_get_rankings(p_campaign_id uuid default null)
returns table (
  rank integer,
  attempt_id uuid,
  campaign_id uuid,
  campaign_title text,
  institution_name text,
  nickname text,
  department text,
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
grant execute on function public.admin_get_rankings(uuid) to service_role;

revoke all on function public.select_campaign_winner(uuid)
  from public, anon, authenticated;
drop function public.select_campaign_winner(uuid);

create function public.select_campaign_winner(
  p_campaign_id uuid,
  p_admin_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  winner_attempt_id uuid;
  award_id uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception '관리자 서버 권한이 필요합니다.';
  end if;
  select attempt_id into winner_attempt_id
  from public.campaign_rankings
  where campaign_id = p_campaign_id and rank = 1;
  if winner_attempt_id is null then
    raise exception '완료한 참여자가 없어 1위를 선정할 수 없습니다.';
  end if;

  insert into public.prize_awards
    (campaign_id, attempt_id, status, selected_at, delivered_at, handled_by)
  values (p_campaign_id, winner_attempt_id, 'selected', now(), null, p_admin_id)
  on conflict (campaign_id) do update
  set attempt_id = excluded.attempt_id,
      status = 'selected',
      selected_at = now(),
      delivered_at = null,
      handled_by = p_admin_id
  returning id into award_id;
  return award_id;
end;
$$;

revoke all on function public.update_prize_award(uuid, text, text)
  from public, anon, authenticated;
drop function public.update_prize_award(uuid, text, text);

create function public.update_prize_award(
  p_campaign_id uuid,
  p_status text,
  p_admin_id text,
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception '관리자 서버 권한이 필요합니다.';
  end if;
  if p_status not in ('selected', 'notified', 'delivered') then
    raise exception '잘못된 상품 지급 상태입니다.';
  end if;
  update public.prize_awards
  set status = p_status,
      note = coalesce(p_note, ''),
      delivered_at = case when p_status = 'delivered' then now() else null end,
      handled_by = p_admin_id
  where campaign_id = p_campaign_id;
  if not found then
    raise exception '먼저 1위를 선정해 주세요.';
  end if;
end;
$$;

revoke all on function public.select_campaign_winner(uuid, text)
  from public, anon, authenticated;
revoke all on function public.update_prize_award(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.select_campaign_winner(uuid, text)
  to service_role;
grant execute on function public.update_prize_award(uuid, text, text, text)
  to service_role;
