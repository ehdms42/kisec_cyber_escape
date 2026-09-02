-- 기존 배포 환경에도 리뷰 보완 사항을 안전하게 적용한다.

alter table public.campaigns
  alter column public_token
  set default encode(extensions.gen_random_bytes(12), 'hex');

alter function public.start_or_resume_attempt(text, text, text, text)
  set search_path = public, extensions;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.game_attempts'::regclass
      and conname = 'game_attempts_id_campaign_unique'
  ) then
    alter table public.game_attempts
      add constraint game_attempts_id_campaign_unique
      unique (id, campaign_id);
  end if;
end;
$$;

create table if not exists public.admin_revoked_sessions (
  nonce text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists admin_revoked_sessions_expiry_idx
  on public.admin_revoked_sessions (expires_at);

alter table public.admin_revoked_sessions enable row level security;
revoke all on public.admin_revoked_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.admin_revoked_sessions
  to service_role;

drop policy if exists "published questions are readable" on public.questions;
revoke select on public.questions from public, anon, authenticated;

create or replace function public.get_published_questions(
  p_limit integer default 30
)
returns table (
  ordinal integer,
  category text,
  prompt text,
  options jsonb,
  explanation text,
  source_reference text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    q.ordinal,
    q.category,
    q.prompt,
    q.options,
    q.explanation,
    q.source_reference
  from public.questions q
  where q.status = 'published'
  order by q.ordinal
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke all on function public.get_published_questions(integer) from public;
grant execute on function public.get_published_questions(integer)
  to anon, authenticated;

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
  inserted boolean := false;
  answer_correct boolean;
begin
  if not exists (
    select 1 from public.game_attempts
    where id = p_attempt_id
      and resume_token = p_resume_token
      and status = 'in_progress'
  ) then
    raise exception '진행 중인 응시 기록을 찾을 수 없습니다.';
  end if;

  select * into target_question
  from public.questions
  where ordinal = p_question_ordinal and status = 'published';
  if not found then
    raise exception '공개된 문제를 찾을 수 없습니다.';
  end if;
  if p_selected_answer < 0
     or p_selected_answer >= jsonb_array_length(target_question.options) then
    raise exception '유효하지 않은 답안입니다.';
  end if;

  answer_correct := p_selected_answer = target_question.correct_answer;
  insert into public.attempt_answers
    (attempt_id, question_id, selected_answer, is_correct)
  values (
    p_attempt_id, target_question.id, p_selected_answer, answer_correct
  )
  on conflict (attempt_id, question_id) do nothing;
  inserted := found;

  if not inserted then
    select aa.is_correct into answer_correct
    from public.attempt_answers aa
    where aa.attempt_id = p_attempt_id
      and aa.question_id = target_question.id;
  end if;

  update public.game_attempts a
  set answered_count = totals.answered_count,
      verified_score = totals.verified_score,
      last_seen_at = now()
  from (
    select count(*)::integer as answered_count,
           count(*) filter (where is_correct)::integer as verified_score
    from public.attempt_answers
    where attempt_id = p_attempt_id
  ) totals
  where a.id = p_attempt_id;

  return jsonb_build_object('accepted', inserted, 'correct', answer_correct);
end;
$$;

revoke all on function public.record_attempt_answer(uuid, uuid, integer, integer)
  from public;
grant execute on function public.record_attempt_answer(uuid, uuid, integer, integer)
  to anon, authenticated;

create or replace function public.get_campaign_leaderboard(
  p_public_token text,
  p_limit integer default 20
)
returns table (
  rank integer,
  nickname text,
  verified_score integer,
  elapsed_seconds integer,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.rank, r.nickname, r.verified_score, r.elapsed_seconds, r.completed_at
  from public.campaign_rankings r
  join public.campaigns c on c.id = r.campaign_id
  join public.institutions i on i.id = c.institution_id
  where c.public_token = trim(p_public_token)
    and c.active
    and i.active
    and (c.starts_at is null or c.starts_at <= now())
    and (c.ends_at is null or c.ends_at > now())
  order by r.rank
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

alter table public.attempt_adjustments
  add column if not exists actor_login_id text;

alter table public.game_attempts
  add column if not exists adjusted_by_login_id text;

alter table public.prize_awards
  add column if not exists handled_by_login_id text;

create table if not exists public.prize_award_events (
  id uuid primary key default gen_random_uuid(),
  prize_award_id uuid not null
    references public.prize_awards (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  status text not null check (status in ('selected', 'notified', 'delivered')),
  note text not null default '',
  actor_login_id text not null,
  created_at timestamptz not null default now()
);

alter table public.prize_award_events enable row level security;
revoke all on public.prize_award_events from public, anon, authenticated;
grant select, insert on public.prize_award_events to service_role;

drop function if exists public.admin_adjust_attempt(uuid, text, text);
drop function if exists public.admin_adjust_attempt(uuid, text, text, text);

create function public.admin_adjust_attempt(
  p_attempt_id uuid,
  p_action text,
  p_reason text,
  p_actor_id text
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
  if length(trim(p_actor_id)) < 1 then
    raise exception '관리자 식별자가 필요합니다.';
  end if;

  select * into target_attempt
  from public.game_attempts
  where id = p_attempt_id
  for update;
  if not found then
    raise exception '응시 기록을 찾을 수 없습니다.';
  end if;

  insert into public.attempt_adjustments
    (attempt_id, admin_id, actor_login_id, action, reason, previous_status)
  values (
    target_attempt.id, null, trim(p_actor_id), p_action, trim(p_reason),
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
        adjusted_by = null,
        adjusted_by_login_id = trim(p_actor_id),
        adjustment_reason = trim(p_reason)
    where id = p_attempt_id;
  elsif p_action = 'resume' then
    update public.game_attempts
    set status = 'in_progress',
        completed_at = null,
        last_seen_at = now(),
        adjusted_by = null,
        adjusted_by_login_id = trim(p_actor_id),
        adjustment_reason = trim(p_reason)
    where id = p_attempt_id;
  else
    update public.game_attempts
    set status = 'voided',
        adjusted_by = null,
        adjusted_by_login_id = trim(p_actor_id),
        adjustment_reason = trim(p_reason)
    where id = p_attempt_id;
  end if;
end;
$$;

revoke all on function public.admin_adjust_attempt(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_adjust_attempt(uuid, text, text, text)
  to service_role;

drop function if exists public.select_campaign_winner(uuid);
drop function if exists public.select_campaign_winner(uuid, text);

create function public.select_campaign_winner(
  p_campaign_id uuid,
  p_actor_id text
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
  if length(trim(p_actor_id)) < 1 then
    raise exception '관리자 식별자가 필요합니다.';
  end if;
  select attempt_id into winner_attempt_id
  from public.campaign_rankings
  where campaign_id = p_campaign_id and rank = 1;
  if winner_attempt_id is null then
    raise exception '완료한 참여자가 없어 1위를 선정할 수 없습니다.';
  end if;

  insert into public.prize_awards
    (campaign_id, attempt_id, status, selected_at, delivered_at, handled_by,
     handled_by_login_id)
  values (
    p_campaign_id, winner_attempt_id, 'selected', now(), null, null,
    trim(p_actor_id)
  )
  on conflict (campaign_id) do update
  set attempt_id = excluded.attempt_id,
      status = 'selected',
      selected_at = now(),
      delivered_at = null,
      handled_by = null,
      handled_by_login_id = trim(p_actor_id)
  returning id into award_id;

  insert into public.prize_award_events
    (prize_award_id, campaign_id, status, note, actor_login_id)
  values (award_id, p_campaign_id, 'selected', '', trim(p_actor_id));
  return award_id;
end;
$$;

revoke all on function public.select_campaign_winner(uuid, text)
  from public, anon, authenticated;
grant execute on function public.select_campaign_winner(uuid, text)
  to service_role;

drop function if exists public.update_prize_award(uuid, text, text);
drop function if exists public.update_prize_award(uuid, text, text, text);

create function public.update_prize_award(
  p_campaign_id uuid,
  p_status text,
  p_note text,
  p_actor_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  award_id uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception '관리자 서버 권한이 필요합니다.';
  end if;
  if p_status not in ('selected', 'notified', 'delivered') then
    raise exception '잘못된 상품 지급 상태입니다.';
  end if;
  if length(trim(p_actor_id)) < 1 then
    raise exception '관리자 식별자가 필요합니다.';
  end if;

  update public.prize_awards
  set status = p_status,
      note = coalesce(p_note, ''),
      delivered_at = case when p_status = 'delivered' then now() else null end,
      handled_by = null,
      handled_by_login_id = trim(p_actor_id)
  where campaign_id = p_campaign_id
  returning id into award_id;
  if not found then
    raise exception '먼저 1위를 선정해 주세요.';
  end if;

  insert into public.prize_award_events
    (prize_award_id, campaign_id, status, note, actor_login_id)
  values (
    award_id, p_campaign_id, p_status, coalesce(p_note, ''), trim(p_actor_id)
  );
end;
$$;

revoke all on function public.update_prize_award(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.update_prize_award(uuid, text, text, text)
  to service_role;
