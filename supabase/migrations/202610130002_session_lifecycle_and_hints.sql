-- 세션(캠페인) 운영 상태 머신, 참가자 사전등록 구분, 문제 힌트를 추가한다.

alter table public.campaigns
  add column if not exists status text not null default 'draft',
  add column if not exists leaderboard_visible boolean not null default true,
  add column if not exists finalized_at timestamptz;

update public.campaigns
set status = case when active then 'open' else 'closed' end;

alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check
  check (status in (
    'draft', 'open', 'in_progress', 'paused', 'closed', 'finalized', 'cancelled'
  ));

alter table public.participants
  add column if not exists registered_by text not null default 'self',
  add column if not exists contact text not null default '';

alter table public.participants
  drop constraint if exists participants_registered_by_check;
alter table public.participants add constraint participants_registered_by_check
  check (registered_by in ('self', 'admin', 'csv'));

alter table public.questions
  add column if not exists hints jsonb not null default '[]'::jsonb;

alter table public.questions drop constraint if exists questions_hints_is_array;
alter table public.questions add constraint questions_hints_is_array
  check (jsonb_typeof(hints) = 'array');

alter table public.game_attempts
  add column if not exists hint_penalty_total integer not null default 0;

alter table public.game_attempts
  drop constraint if exists game_attempts_hint_penalty_total_check;
alter table public.game_attempts add constraint game_attempts_hint_penalty_total_check
  check (hint_penalty_total >= 0);

create table if not exists public.attempt_hint_usage (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.game_attempts (id) on delete cascade,
  question_id uuid not null references public.questions (id),
  hint_index integer not null check (hint_index >= 0),
  penalty integer not null default 0 check (penalty >= 0),
  used_at timestamptz not null default now(),
  unique (attempt_id, question_id, hint_index)
);

alter table public.attempt_hint_usage enable row level security;
revoke all on public.attempt_hint_usage from public, anon, authenticated;
grant select, insert on public.attempt_hint_usage to service_role;

create or replace function public.reveal_attempt_hint(
  p_attempt_id uuid,
  p_resume_token uuid,
  p_question_ordinal integer,
  p_hint_index integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_question public.questions%rowtype;
  hint_record jsonb;
  hint_text text;
  hint_penalty integer;
  already_used boolean := false;
  applied_penalty integer := 0;
  hint_penalty_total_after integer := 0;
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

  if p_hint_index < 0
     or p_hint_index >= jsonb_array_length(target_question.hints) then
    raise exception '유효하지 않은 힌트입니다.';
  end if;

  hint_record := target_question.hints -> p_hint_index;
  hint_text := coalesce(hint_record ->> 'text', '');
  hint_penalty := greatest(0, coalesce((hint_record ->> 'penalty')::integer, 0));

  insert into public.attempt_hint_usage (attempt_id, question_id, hint_index, penalty)
  values (p_attempt_id, target_question.id, p_hint_index, hint_penalty)
  on conflict (attempt_id, question_id, hint_index) do nothing;
  already_used := not found;

  -- verified_score는 "정답 수" 그대로 유지한다 (보안 등급 산정, 리더보드 정렬,
  -- 결과 화면의 정답률 계산이 모두 이 값을 정답 개수로 가정하기 때문).
  -- 힌트 감점은 hint_penalty_total에만 누적해 참고 지표로만 노출한다.
  if not already_used then
    applied_penalty := hint_penalty;
    update public.game_attempts
    set hint_penalty_total = hint_penalty_total + hint_penalty,
        last_seen_at = now()
    where id = p_attempt_id
    returning hint_penalty_total into hint_penalty_total_after;
  else
    select hint_penalty_total into hint_penalty_total_after
    from public.game_attempts where id = p_attempt_id;
  end if;

  return jsonb_build_object(
    'hint_text', hint_text,
    'penalty_applied', applied_penalty,
    'already_revealed', already_used,
    'hint_penalty_total', hint_penalty_total_after
  );
end;
$$;

revoke all on function public.reveal_attempt_hint(uuid, uuid, integer, integer)
  from public;
grant execute on function public.reveal_attempt_hint(uuid, uuid, integer, integer)
  to anon, authenticated;

-- 참가자 화면이 힌트 목록도 함께 받을 수 있도록 반환 컬럼을 확장한다.
-- 정답(correct_answer)과 감점(penalty)은 그대로 포함되므로 참가자에게는
-- 힌트 "텍스트"만 쓰고 penalty는 UI에서 확인용으로만 노출해야 한다.
drop function if exists public.get_published_questions(integer);

create function public.get_published_questions(
  p_limit integer default 30
)
returns table (
  ordinal integer,
  category text,
  prompt text,
  options jsonb,
  explanation text,
  source_reference text,
  hints jsonb
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
    q.source_reference,
    q.hints
  from public.questions q
  where q.status = 'published'
  order by q.ordinal
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke all on function public.get_published_questions(integer) from public;
grant execute on function public.get_published_questions(integer)
  to anon, authenticated;
