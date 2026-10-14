-- 오답을 그냥 두고 탈출할 수 있던 문제를 고친다: 탈출(완료) 전에 틀린 문항을
-- 전부 다시 풀어서 맞혀야만 완료할 수 있도록 서버에서 강제한다. 다시 맞힌
-- 문항은 정답으로 인정되어 최종 점수/등급에 반영된다.
--
-- 아래 두 함수는 202609090001_realtime_leaderboard_levels.sql과
-- 202609090002_result_security_grade.sql의 최신 버전을 그대로 베이스로 하고,
-- "틀린 문항 재제출 허용"과 "오답이 남아있으면 완료 거부" 두 가지만 추가한다.

-- 1) 틀린 문항만 다시 제출할 수 있도록 허용한다(on conflict do nothing →
--    이미 맞힌 문항은 그대로 두고, 틀린 문항만 덮어쓰기). 재풀이로 맞힌 정답을
--    틀린 답으로 되돌릴 수는 없다.
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

-- 2) 틀린 문항이 남아있으면 완료를 거부한다(클라이언트 흐름을 우회해도 안전).
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
  if exists (
    select 1 from public.attempt_answers
    where attempt_id = p_attempt_id and is_correct = false
  ) then
    raise exception '오답을 모두 맞혀야 탈출할 수 있습니다.';
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

-- 3) 참가자가 자신의 진행 중인 응시에서 현재 틀린 문항 번호 목록을 조회한다.
--    탈출 전 "오답 다시 풀기" 화면에서 사용.
create or replace function public.get_attempt_wrong_ordinals(
  p_attempt_id uuid,
  p_resume_token uuid
)
returns integer[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(q.ordinal order by q.ordinal), array[]::integer[])
  from public.attempt_answers aa
  join public.questions q on q.id = aa.question_id
  join public.game_attempts a on a.id = aa.attempt_id
  where aa.attempt_id = p_attempt_id
    and a.resume_token = p_resume_token
    and a.status = 'in_progress'
    and aa.is_correct = false;
$$;

revoke all on function public.get_attempt_wrong_ordinals(uuid, uuid) from public;
grant execute on function public.get_attempt_wrong_ordinals(uuid, uuid)
  to anon, authenticated;
