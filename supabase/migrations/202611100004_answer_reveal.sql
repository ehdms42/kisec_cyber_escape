-- 답안을 제출하면 그 문제의 정답 번호도 함께 돌려준다.
-- 참가자 화면이 오답일 때 정답 보기를 파란색으로 표시하는 데 쓴다.
-- 답을 내기 전에는 정답을 받을 방법이 없으며, 나머지 동작은 202611100001과 같다.

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
    'answered_count', total_answered,
    -- 답을 제출한 문제에 한해서만 정답 번호를 알려 준다(오답이면 정답 보기를 표시).
    'correct_answer', target_question.correct_answer
  );
end;
$$;

revoke all on function public.record_attempt_answer(uuid, uuid, integer, integer)
  from public;
grant execute on function public.record_attempt_answer(uuid, uuid, integer, integer)
  to anon, authenticated;
