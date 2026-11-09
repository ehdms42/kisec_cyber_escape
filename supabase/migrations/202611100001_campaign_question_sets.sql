-- 기관 세션(캠페인)마다 출제할 문항을 고정한다.
-- 문항 구성이 있는 세션은 그 문항만 순서대로 출제하고, 답안도 그 문항만 받는다.
-- 문항 구성이 없는 세션은 기존처럼 공개 문항을 번호순으로 출제한다.

create table if not exists public.campaign_questions (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete restrict,
  sort_order integer not null check (sort_order > 0),
  created_at timestamptz not null default now(),
  primary key (campaign_id, question_id),
  unique (campaign_id, sort_order)
);

create index if not exists campaign_questions_question_idx
  on public.campaign_questions (question_id);

alter table public.campaign_questions enable row level security;

-- 참가자 화면에서 세션 문항을 불러온다. 정답은 포함하지 않는다.
create or replace function public.get_campaign_questions(p_public_token text)
returns table (
  ordinal integer,
  category text,
  prompt text,
  options jsonb,
  explanation text,
  source_reference text,
  hints jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_campaign_id uuid;
begin
  select c.id into target_campaign_id
  from public.campaigns c
  join public.institutions i on i.id = c.institution_id
  where c.public_token = trim(p_public_token)
    and c.active
    and i.active
    and (c.starts_at is null or c.starts_at <= now())
    and (c.ends_at is null or c.ends_at > now());
  if target_campaign_id is null then
    return;
  end if;

  if exists (
    select 1
    from public.campaign_questions cq
    join public.questions q on q.id = cq.question_id
    where cq.campaign_id = target_campaign_id
      and q.status <> 'published'
  ) then
    raise exception '세션 문항 중 공개되지 않은 문항이 있습니다. 관리자에게 문의해 주세요.';
  end if;

  return query
  select
    q.ordinal,
    q.category,
    q.prompt,
    q.options,
    q.explanation,
    q.source_reference,
    q.hints
  from public.campaign_questions cq
  join public.questions q on q.id = cq.question_id
  where cq.campaign_id = target_campaign_id
  order by cq.sort_order;
end;
$$;

revoke all on function public.get_campaign_questions(text) from public;
grant execute on function public.get_campaign_questions(text)
  to anon, authenticated;

-- 202610140005_wrong_answer_retry.sql의 record_attempt_answer를 그대로 두고,
-- 문항 구성이 있는 세션에서는 구성에 없는 문항의 답안을 거부하는 검사만 추가한다.
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
  previously_correct boolean;
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
  if exists (
    select 1 from public.campaign_questions
    where campaign_id = target_attempt.campaign_id
  ) and not exists (
    select 1 from public.campaign_questions
    where campaign_id = target_attempt.campaign_id
      and question_id = target_question.id
  ) then
    raise exception '이 세션에서 출제되지 않은 문제입니다.';
  end if;
  if p_selected_answer is null
     or p_selected_answer < 0
     or p_selected_answer >= jsonb_array_length(target_question.options) then
    raise exception '유효하지 않은 답안입니다.';
  end if;

  select aa.is_correct into previously_correct
  from public.attempt_answers aa
  where aa.attempt_id = p_attempt_id and aa.question_id = target_question.id;

  if previously_correct is true then
    inserted := false;
  else
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
    on conflict (attempt_id, question_id)
    do update set
      selected_answer = excluded.selected_answer,
      is_correct = excluded.is_correct,
      answered_at = now();
    inserted := true;
  end if;

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

-- 관리자 API 서버(service_role)만 호출한다. 문항 구성을 한 번에 바꾸고
-- 세션의 필수 문항 수를 구성 개수에 맞춘다. 구성을 비우면 기본 30문항으로 돌아간다.
create or replace function public.set_campaign_questions(
  p_campaign_id uuid,
  p_question_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  question_count integer := coalesce(array_length(p_question_ids, 1), 0);
begin
  perform 1 from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception '세션을 찾을 수 없습니다.';
  end if;
  if exists (
    select 1 from public.game_attempts where campaign_id = p_campaign_id
  ) then
    raise exception '응시 기록이 있는 세션은 문항 구성을 바꿀 수 없습니다.';
  end if;
  if question_count > 100 then
    raise exception '세션 문항은 100개 이하로 구성해 주세요.';
  end if;
  if question_count <> (
    select count(distinct id) from unnest(p_question_ids) as ids(id)
  ) then
    raise exception '같은 문항이 중복으로 선택되었습니다.';
  end if;
  if question_count <> (
    select count(*) from public.questions
    where id = any(p_question_ids) and status = 'published'
  ) then
    raise exception '공개된 문항만 세션에 넣을 수 있습니다.';
  end if;

  delete from public.campaign_questions where campaign_id = p_campaign_id;
  insert into public.campaign_questions (campaign_id, question_id, sort_order)
  select p_campaign_id, ids.id, ids.sort_order::integer
  from unnest(p_question_ids) with ordinality as ids(id, sort_order);

  update public.campaigns
  set required_question_count = case when question_count > 0
    then question_count else 30 end
  where id = p_campaign_id;

  return question_count;
end;
$$;

revoke all on function public.set_campaign_questions(uuid, uuid[]) from public;
revoke all on function public.set_campaign_questions(uuid, uuid[])
  from anon, authenticated;
grant execute on function public.set_campaign_questions(uuid, uuid[])
  to service_role;
