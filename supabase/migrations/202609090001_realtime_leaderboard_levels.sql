-- 참가자 보안 레벨과 공개용 실시간 순위 캐시를 추가한다.
-- 정답/점수는 기존과 동일하게 서버의 정답 원본으로만 계산한다.

alter table public.participants
  add column if not exists security_level text not null default 'beginner';

alter table public.participants
  drop constraint if exists participants_security_level_check;
alter table public.participants
  add constraint participants_security_level_check
  check (security_level in ('beginner', 'intermediate', 'advanced'));

alter table public.game_attempts
  add column if not exists score_reached_at timestamptz;

update public.game_attempts
set score_reached_at = coalesce(last_seen_at, started_at, now())
where score_reached_at is null;

alter table public.game_attempts
  alter column score_reached_at set default now(),
  alter column score_reached_at set not null;

create or replace function public.set_score_reached_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.score_reached_at = coalesce(new.score_reached_at, new.started_at, now());
  elsif new.verified_score is distinct from old.verified_score then
    new.score_reached_at = clock_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists set_game_attempt_score_reached_at
  on public.game_attempts;
create trigger set_game_attempt_score_reached_at
before insert or update of verified_score on public.game_attempts
for each row execute function public.set_score_reached_at();

create table if not exists public.live_leaderboard_entries (
  attempt_id uuid primary key
    references public.game_attempts (id) on delete cascade,
  campaign_id uuid not null
    references public.campaigns (id) on delete cascade,
  nickname text not null,
  security_level text not null
    check (security_level in ('beginner', 'intermediate', 'advanced')),
  verified_score integer not null default 0 check (verified_score >= 0),
  answered_count integer not null default 0 check (answered_count >= 0),
  score_reached_at timestamptz not null,
  last_score_delta integer not null default 0 check (last_score_delta >= 0),
  last_score_changed_at timestamptz,
  status text not null
    check (status in ('in_progress', 'completed', 'voided')),
  updated_at timestamptz not null default now()
);

create index if not exists live_leaderboard_campaign_order_idx
  on public.live_leaderboard_entries
  (campaign_id, verified_score desc, score_reached_at asc, attempt_id asc);

alter table public.live_leaderboard_entries enable row level security;
revoke all on public.live_leaderboard_entries from public, anon, authenticated;
grant select on public.live_leaderboard_entries to anon, authenticated;

create or replace function public.is_public_active_campaign(
  p_campaign_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.campaigns c
    join public.institutions i on i.id = c.institution_id
    where c.id = p_campaign_id
      and c.active
      and i.active
      and (c.starts_at is null or c.starts_at <= now())
      and (c.ends_at is null or c.ends_at > now())
  );
$$;

revoke all on function public.is_public_active_campaign(uuid) from public;
grant execute on function public.is_public_active_campaign(uuid)
  to anon, authenticated;

drop policy if exists "active campaign leaderboards are readable"
  on public.live_leaderboard_entries;
create policy "active campaign leaderboards are readable"
on public.live_leaderboard_entries
for select
to anon, authenticated
using (public.is_public_active_campaign(campaign_id));

create or replace function public.sync_live_leaderboard_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_participant public.participants%rowtype;
  score_delta integer := 0;
begin
  select * into target_participant
  from public.participants
  where id = new.participant_id;

  if tg_op = 'UPDATE' then
    score_delta := greatest(new.verified_score - old.verified_score, 0);
  end if;

  insert into public.live_leaderboard_entries (
    attempt_id,
    campaign_id,
    nickname,
    security_level,
    verified_score,
    answered_count,
    score_reached_at,
    last_score_delta,
    last_score_changed_at,
    status,
    updated_at
  ) values (
    new.id,
    new.campaign_id,
    target_participant.nickname,
    target_participant.security_level,
    new.verified_score,
    new.answered_count,
    new.score_reached_at,
    score_delta,
    case when score_delta > 0 then clock_timestamp() else null end,
    new.status,
    clock_timestamp()
  )
  on conflict (attempt_id) do update
  set nickname = excluded.nickname,
      security_level = excluded.security_level,
      verified_score = excluded.verified_score,
      answered_count = excluded.answered_count,
      score_reached_at = excluded.score_reached_at,
      last_score_delta = excluded.last_score_delta,
      last_score_changed_at = case
        when excluded.last_score_delta > 0
          then excluded.last_score_changed_at
        else live_leaderboard_entries.last_score_changed_at
      end,
      status = excluded.status,
      updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists sync_live_leaderboard_attempt
  on public.game_attempts;
create trigger sync_live_leaderboard_attempt
after insert or update of verified_score, answered_count, status, score_reached_at
on public.game_attempts
for each row execute function public.sync_live_leaderboard_attempt();

create or replace function public.sync_live_leaderboard_participant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.live_leaderboard_entries e
  set nickname = new.nickname,
      security_level = new.security_level,
      updated_at = clock_timestamp()
  from public.game_attempts a
  where a.participant_id = new.id
    and e.attempt_id = a.id;
  return new;
end;
$$;

drop trigger if exists sync_live_leaderboard_participant
  on public.participants;
create trigger sync_live_leaderboard_participant
after update of nickname, security_level on public.participants
for each row execute function public.sync_live_leaderboard_participant();

insert into public.live_leaderboard_entries (
  attempt_id,
  campaign_id,
  nickname,
  security_level,
  verified_score,
  answered_count,
  score_reached_at,
  last_score_delta,
  status,
  updated_at
)
select
  a.id,
  a.campaign_id,
  p.nickname,
  p.security_level,
  a.verified_score,
  a.answered_count,
  a.score_reached_at,
  0,
  a.status,
  now()
from public.game_attempts a
join public.participants p on p.id = a.participant_id
on conflict (attempt_id) do update
set nickname = excluded.nickname,
    security_level = excluded.security_level,
    verified_score = excluded.verified_score,
    answered_count = excluded.answered_count,
    score_reached_at = excluded.score_reached_at,
    status = excluded.status,
    updated_at = excluded.updated_at;

create or replace view public.campaign_rankings
with (security_invoker = true)
as
select
  row_number() over (
    partition by a.campaign_id
    order by
      a.verified_score desc,
      a.score_reached_at asc,
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
  p.department,
  p.security_level
from public.game_attempts a
join public.participants p on p.id = a.participant_id
join public.campaigns c on c.id = a.campaign_id
join public.institutions i on i.id = c.institution_id
where a.status = 'completed' and a.completed_at is not null;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_leaderboard_entries'
  ) then
    alter publication supabase_realtime
      add table public.live_leaderboard_entries;
  end if;
end;
$$;

create or replace function public.get_live_campaign_leaderboard(
  p_public_token text,
  p_security_level text default null,
  p_limit integer default 100
)
returns table (
  rank integer,
  attempt_id uuid,
  nickname text,
  security_level text,
  verified_score integer,
  answered_count integer,
  score_reached_at timestamptz,
  last_score_delta integer,
  last_score_changed_at timestamptz,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  with target_campaign as (
    select c.id
    from public.campaigns c
    join public.institutions i on i.id = c.institution_id
    where c.public_token = trim(p_public_token)
      and c.active
      and i.active
      and (c.starts_at is null or c.starts_at <= now())
      and (c.ends_at is null or c.ends_at > now())
  ), ranked as (
    select
      row_number() over (
        order by e.verified_score desc,
                 e.score_reached_at asc,
                 e.attempt_id asc
      )::integer as rank,
      e.*
    from public.live_leaderboard_entries e
    join target_campaign c on c.id = e.campaign_id
    where e.status <> 'voided'
      and (
        p_security_level is null
        or p_security_level = ''
        or e.security_level = p_security_level
      )
  )
  select
    r.rank,
    r.attempt_id,
    r.nickname,
    r.security_level,
    r.verified_score,
    r.answered_count,
    r.score_reached_at,
    r.last_score_delta,
    r.last_score_changed_at,
    r.status
  from ranked r
  order by r.rank
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

revoke all on function public.get_live_campaign_leaderboard(text, text, integer)
  from public;
grant execute on function public.get_live_campaign_leaderboard(text, text, integer)
  to anon, authenticated;

create or replace function public.start_or_resume_attempt(
  p_public_token text,
  p_participant_code text,
  p_nickname text,
  p_department text,
  p_security_level text
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
  if p_security_level is null
     or p_security_level not in ('beginner', 'intermediate', 'advanced') then
    raise exception '유효한 정보보안 레벨을 선택해 주세요.';
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
    security_level,
    identifier_hash
  ) values (
    target_campaign.id,
    left(trim(p_nickname), 24),
    left(trim(p_department), 60),
    p_security_level,
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

revoke all on function public.start_or_resume_attempt(text, text, text, text, text)
  from public;
grant execute on function public.start_or_resume_attempt(text, text, text, text, text)
  to anon, authenticated;

create or replace function public.save_attempt_progress(
  p_attempt_id uuid,
  p_resume_token uuid,
  p_state jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_state is not null and jsonb_typeof(p_state) <> 'object' then
    raise exception '진행 상황 형식이 올바르지 않습니다.';
  end if;
  if p_state is not null and pg_column_size(p_state) > 65536 then
    raise exception '진행 상황 데이터가 너무 큽니다.';
  end if;

  update public.game_attempts
  set state = (
        coalesce(p_state, '{}'::jsonb) - 'score' - 'answeredCount'
      ) || jsonb_build_object(
        'score', verified_score,
        'answeredCount', answered_count
      ),
      last_seen_at = now()
  where id = p_attempt_id
    and resume_token = p_resume_token
    and status = 'in_progress';
  if not found then
    raise exception '진행 중인 응시 기록을 찾을 수 없습니다.';
  end if;
end;
$$;

create or replace function public.record_attempt_answer(
  p_attempt_id uuid,
  p_resume_token uuid,
  p_question_ordinal integer,
  p_selected_answer integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_question public.questions%rowtype;
  target_attempt public.game_attempts%rowtype;
  inserted boolean := false;
  stored_selected_answer integer;
  answer_correct boolean;
  total_answered integer;
  total_score integer;
begin
  select * into target_attempt
  from public.game_attempts
  where id = p_attempt_id
    and resume_token = p_resume_token
    and status = 'in_progress'
  for update;
  if not found then
    raise exception '진행 중인 응시 기록을 찾을 수 없습니다.';
  end if;

  select * into target_question
  from public.questions
  where ordinal = p_question_ordinal
    and status = 'published';
  if not found then
    raise exception '공개된 문제를 찾을 수 없습니다.';
  end if;
  if p_selected_answer is null
     or p_selected_answer < 0
     or p_selected_answer >= jsonb_array_length(target_question.options) then
    raise exception '유효하지 않은 답안입니다.';
  end if;

  answer_correct := p_selected_answer = target_question.correct_answer;
  insert into public.attempt_answers (
    attempt_id,
    question_id,
    selected_answer,
    is_correct
  ) values (
    p_attempt_id,
    target_question.id,
    p_selected_answer,
    answer_correct
  )
  on conflict (attempt_id, question_id) do nothing;
  inserted := found;

  select aa.selected_answer, aa.is_correct
    into stored_selected_answer, answer_correct
  from public.attempt_answers aa
  where aa.attempt_id = p_attempt_id
    and aa.question_id = target_question.id;

  select
    count(*)::integer,
    count(*) filter (where is_correct)::integer
  into total_answered, total_score
  from public.attempt_answers
  where attempt_id = p_attempt_id;

  update public.game_attempts
  set answered_count = total_answered,
      verified_score = total_score,
      last_seen_at = now()
  where id = p_attempt_id;

  return jsonb_build_object(
    'accepted', inserted,
    'correct', answer_correct,
    'selected_answer', stored_selected_answer,
    'verified_score', total_score,
    'answered_count', total_answered
  );
end;
$$;

revoke all on function public.record_attempt_answer(uuid, uuid, integer, integer)
  from public;
grant execute on function public.record_attempt_answer(uuid, uuid, integer, integer)
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

  return jsonb_build_object(
    'verified_score', target_attempt.verified_score,
    'answered_count', target_attempt.answered_count,
    'completed_at', target_attempt.completed_at
  );
end;
$$;

revoke all on function public.save_attempt_progress(uuid, uuid, jsonb)
  from public;
revoke all on function public.complete_attempt(uuid, uuid, jsonb)
  from public;
grant execute on function public.save_attempt_progress(uuid, uuid, jsonb)
  to anon, authenticated;
grant execute on function public.complete_attempt(uuid, uuid, jsonb)
  to anon, authenticated;
