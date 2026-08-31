create table if not exists public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete restrict,
  title text not null,
  public_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  required_question_count integer not null default 30 check (required_question_count > 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete restrict,
  nickname text not null,
  identifier_hash text not null,
  created_at timestamptz not null default now(),
  unique (campaign_id, identifier_hash)
);

create table if not exists public.game_attempts (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete restrict,
  resume_token uuid not null default gen_random_uuid(),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'voided')),
  state jsonb not null default '{}'::jsonb,
  verified_score integer not null default 0 check (verified_score >= 0),
  answered_count integer not null default 0 check (answered_count >= 0),
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  completed_at timestamptz,
  adjusted_by uuid references auth.users (id),
  adjustment_reason text,
  unique (participant_id, campaign_id)
);

create table if not exists public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.game_attempts (id) on delete cascade,
  question_id uuid not null references public.questions (id),
  selected_answer integer not null check (selected_answer >= 0),
  is_correct boolean not null,
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create table if not exists public.attempt_adjustments (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.game_attempts (id) on delete cascade,
  admin_id uuid not null references auth.users (id),
  action text not null check (action in ('resume', 'void', 'reset')),
  reason text not null,
  previous_status text not null,
  created_at timestamptz not null default now()
);

create index if not exists campaigns_public_token_idx on public.campaigns (public_token);
create index if not exists attempts_campaign_status_idx
  on public.game_attempts (campaign_id, status, completed_at);
create index if not exists attempts_last_seen_idx on public.game_attempts (last_seen_at desc);

drop trigger if exists set_institutions_updated_at on public.institutions;
create trigger set_institutions_updated_at
before update on public.institutions
for each row execute function public.set_updated_at();

drop trigger if exists set_campaigns_updated_at on public.campaigns;
create trigger set_campaigns_updated_at
before update on public.campaigns
for each row execute function public.set_updated_at();

alter table public.institutions enable row level security;
alter table public.campaigns enable row level security;
alter table public.participants enable row level security;
alter table public.game_attempts enable row level security;
alter table public.attempt_answers enable row level security;
alter table public.attempt_adjustments enable row level security;

create policy "admins manage institutions" on public.institutions
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage campaigns" on public.campaigns
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage participants" on public.participants
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage attempts" on public.game_attempts
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins read attempt answers" on public.attempt_answers
for select to authenticated using (public.is_admin());
create policy "admins read attempt adjustments" on public.attempt_adjustments
for select to authenticated using (public.is_admin());

create or replace function public.get_campaign_public(p_public_token text)
returns table (
  campaign_id uuid,
  campaign_title text,
  institution_name text,
  required_question_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.title, i.name, c.required_question_count
  from public.campaigns c
  join public.institutions i on i.id = c.institution_id
  where c.public_token = trim(p_public_token)
    and c.active
    and i.active
    and (c.starts_at is null or c.starts_at <= now())
    and (c.ends_at is null or c.ends_at > now());
$$;

create or replace function public.start_or_resume_attempt(
  p_public_token text,
  p_participant_code text,
  p_nickname text
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
    raise exception '닉네임은 2자 이상이어야 합니다.';
  end if;

  select c.* into target_campaign
  from public.campaigns c
  join public.institutions i on i.id = c.institution_id
  where c.public_token = trim(p_public_token)
    and c.active and i.active
    and (c.starts_at is null or c.starts_at <= now())
    and (c.ends_at is null or c.ends_at > now());
  if not found then raise exception '유효하지 않거나 종료된 배포 링크입니다.'; end if;

  select * into target_institution
  from public.institutions where id = target_campaign.institution_id;
  normalized_hash := encode(digest(lower(trim(p_participant_code)), 'sha256'), 'hex');

  insert into public.participants (campaign_id, nickname, identifier_hash)
  values (target_campaign.id, left(trim(p_nickname), 24), normalized_hash)
  on conflict (campaign_id, identifier_hash)
  do update set nickname = excluded.nickname
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
  update public.game_attempts
  set state = coalesce(p_state, '{}'::jsonb), last_seen_at = now()
  where id = p_attempt_id and resume_token = p_resume_token and status = 'in_progress';
  if not found then raise exception '진행 중인 응시 기록을 찾을 수 없습니다.'; end if;
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
  inserted boolean := false;
  answer_correct boolean;
begin
  if not exists (
    select 1 from public.game_attempts
    where id = p_attempt_id and resume_token = p_resume_token and status = 'in_progress'
  ) then raise exception '진행 중인 응시 기록을 찾을 수 없습니다.'; end if;

  select * into target_question from public.questions
  where ordinal = p_question_ordinal and status = 'published';
  if not found then raise exception '공개된 문제를 찾을 수 없습니다.'; end if;
  if p_selected_answer < 0 or p_selected_answer >= jsonb_array_length(target_question.options) then
    raise exception '유효하지 않은 답안입니다.';
  end if;

  answer_correct := p_selected_answer = target_question.correct_answer;
  insert into public.attempt_answers (attempt_id, question_id, selected_answer, is_correct)
  values (p_attempt_id, target_question.id, p_selected_answer, answer_correct)
  on conflict (attempt_id, question_id) do nothing;
  inserted := found;

  update public.game_attempts a
  set answered_count = totals.answered_count,
      verified_score = totals.verified_score,
      last_seen_at = now()
  from (
    select count(*)::integer as answered_count,
           count(*) filter (where is_correct)::integer as verified_score
    from public.attempt_answers where attempt_id = p_attempt_id
  ) totals
  where a.id = p_attempt_id;

  return jsonb_build_object('accepted', inserted, 'correct', answer_correct);
end;
$$;

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
begin
  select a.* into target_attempt
  from public.game_attempts a
  where a.id = p_attempt_id and a.resume_token = p_resume_token
  for update of a;
  if not found or target_attempt.status <> 'in_progress' then
    raise exception '완료할 수 있는 응시 기록이 없습니다.';
  end if;
  select required_question_count into required_count
  from public.campaigns where id = target_attempt.campaign_id;
  if target_attempt.answered_count < required_count then
    raise exception '필수 문항 응답이 모두 기록되지 않았습니다.';
  end if;

  update public.game_attempts
  set status = 'completed', state = coalesce(p_state, state), completed_at = now(),
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

create or replace function public.admin_adjust_attempt(
  p_attempt_id uuid,
  p_action text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_attempt public.game_attempts%rowtype;
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  if p_action not in ('resume', 'void', 'reset') then raise exception '잘못된 조정입니다.'; end if;
  if length(trim(p_reason)) < 3 then raise exception '조정 사유를 입력해 주세요.'; end if;

  select * into target_attempt from public.game_attempts
  where id = p_attempt_id for update;
  if not found then raise exception '응시 기록을 찾을 수 없습니다.'; end if;

  insert into public.attempt_adjustments
    (attempt_id, admin_id, action, reason, previous_status)
  values (target_attempt.id, auth.uid(), p_action, trim(p_reason), target_attempt.status);

  if p_action = 'reset' then
    delete from public.attempt_answers where attempt_id = p_attempt_id;
    update public.game_attempts
    set status = 'in_progress', state = '{}'::jsonb, verified_score = 0,
        answered_count = 0, started_at = now(), last_seen_at = now(),
        completed_at = null, resume_token = gen_random_uuid(), adjusted_by = auth.uid(),
        adjustment_reason = trim(p_reason)
    where id = p_attempt_id;
  elsif p_action = 'resume' then
    update public.game_attempts
    set status = 'in_progress', completed_at = null, last_seen_at = now(),
        adjusted_by = auth.uid(), adjustment_reason = trim(p_reason)
    where id = p_attempt_id;
  else
    update public.game_attempts
    set status = 'voided', adjusted_by = auth.uid(), adjustment_reason = trim(p_reason)
    where id = p_attempt_id;
  end if;
end;
$$;

revoke all on function public.get_campaign_public(text) from public;
revoke all on function public.start_or_resume_attempt(text, text, text) from public;
revoke all on function public.save_attempt_progress(uuid, uuid, jsonb) from public;
revoke all on function public.record_attempt_answer(uuid, uuid, integer, integer) from public;
revoke all on function public.complete_attempt(uuid, uuid, jsonb) from public;
revoke all on function public.admin_adjust_attempt(uuid, text, text) from public;

grant execute on function public.get_campaign_public(text) to anon, authenticated;
grant execute on function public.start_or_resume_attempt(text, text, text) to anon, authenticated;
grant execute on function public.save_attempt_progress(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.record_attempt_answer(uuid, uuid, integer, integer) to anon, authenticated;
grant execute on function public.complete_attempt(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.admin_adjust_attempt(uuid, text, text) to authenticated;
