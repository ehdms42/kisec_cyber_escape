-- 참여 코드 무차별 대입 방지.
-- 익명 사용자가 RPC를 반복 호출해 다른 참가자의 참여 코드를 추측하지 못하도록
-- 배포·접속 IP별로 실패 횟수를 세고, 10분 안에 10번 틀리면 잠시 막는다.
-- 예외를 던지면 실패 기록까지 롤백되므로, 등록되지 않은 코드는 예외 대신
-- 결과값(null 또는 error 필드)으로 알린다.

create table if not exists public.participant_code_failures (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  client_key text not null,
  failed_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  primary key (campaign_id, client_key)
);

alter table public.participant_code_failures enable row level security;
revoke all on table public.participant_code_failures from anon, authenticated;

-- Supabase 앞단(Cloudflare)이 넣는 접속 IP. 클라이언트가 위조할 수 없는
-- cf-connecting-ip를 먼저 쓰고, 없으면 x-real-ip를 쓴다.
create or replace function public.participant_client_key()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif(trim(headers ->> 'cf-connecting-ip'), ''),
    nullif(trim(headers ->> 'x-real-ip'), ''),
    'unknown'
  )
  from (
    select coalesce(
      nullif(current_setting('request.headers', true), '')::json,
      '{}'::json
    ) as headers
  ) request;
$$;

create or replace function public.participant_code_blocked(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.participant_code_failures
    where campaign_id = p_campaign_id
      and client_key = public.participant_client_key()
      and failed_count >= 10
      and window_started_at > now() - interval '10 minutes'
  );
$$;

create or replace function public.register_participant_code_failure(
  p_campaign_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.participant_code_failures (
    campaign_id, client_key, failed_count, window_started_at
  )
  values (p_campaign_id, public.participant_client_key(), 1, now())
  on conflict (campaign_id, client_key) do update set
    failed_count = case
      when participant_code_failures.window_started_at
        <= now() - interval '10 minutes' then 1
      else participant_code_failures.failed_count + 1
    end,
    window_started_at = case
      when participant_code_failures.window_started_at
        <= now() - interval '10 minutes' then now()
      else participant_code_failures.window_started_at
    end;
$$;

revoke all on function public.participant_client_key() from public, anon, authenticated;
revoke all on function public.participant_code_blocked(uuid) from public, anon, authenticated;
revoke all on function public.register_participant_code_failure(uuid) from public, anon, authenticated;

-- 실패 기록을 남겨야 하므로 stable이 아닌 volatile로 바꾼다.
drop function if exists public.lookup_participant_department(text, text);

create function public.lookup_participant_department(
  p_public_token text,
  p_participant_code text
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_campaign_id uuid;
  normalized_hash text;
  result_department text;
begin
  if length(trim(p_participant_code)) < 4 then
    raise exception '참여 코드는 4자 이상이어야 합니다.';
  end if;

  select c.id into target_campaign_id
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

  if public.participant_code_blocked(target_campaign_id) then
    raise exception '참여 코드 확인에 여러 번 실패했습니다. 10분 후 다시 시도해 주세요.';
  end if;

  normalized_hash := encode(
    extensions.digest(lower(trim(p_participant_code)), 'sha256'),
    'hex'
  );

  select department into result_department
  from public.participants
  where campaign_id = target_campaign_id and identifier_hash = normalized_hash;

  if not found then
    perform public.register_participant_code_failure(target_campaign_id);
    return null;
  end if;

  -- 부서 없이 등록된 참가자도 입장할 수 있게 한다.
  return coalesce(nullif(trim(result_department), ''), '부서 미지정');
end;
$$;

revoke all on function public.lookup_participant_department(text, text)
  from public;
grant execute on function public.lookup_participant_department(text, text)
  to anon, authenticated;

create or replace function public.start_or_resume_attempt(
  p_public_token text,
  p_participant_code text,
  p_nickname text
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

  if public.participant_code_blocked(target_campaign.id) then
    raise exception '참여 코드 확인에 여러 번 실패했습니다. 10분 후 다시 시도해 주세요.';
  end if;

  select * into target_institution
  from public.institutions
  where id = target_campaign.institution_id;

  normalized_hash := encode(
    extensions.digest(lower(trim(p_participant_code)), 'sha256'),
    'hex'
  );

  select * into target_participant
  from public.participants
  where campaign_id = target_campaign.id and identifier_hash = normalized_hash;

  if not found then
    perform public.register_participant_code_failure(target_campaign.id);
    return jsonb_build_object(
      'error', '등록되지 않은 참여 코드입니다. 담당자에게 문의해 주세요.'
    );
  end if;

  update public.participants
  set nickname = left(trim(p_nickname), 24)
  where id = target_participant.id
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

revoke all on function public.start_or_resume_attempt(text, text, text)
  from public;
grant execute on function public.start_or_resume_attempt(text, text, text)
  to anon, authenticated;
