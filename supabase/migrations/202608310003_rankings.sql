do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.game_attempts'::regclass
      and conname = 'game_attempts_id_campaign_unique'
  ) then
    alter table public.game_attempts
      add constraint game_attempts_id_campaign_unique unique (id, campaign_id);
  end if;
end;
$$;

create table if not exists public.prize_awards (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.campaigns (id) on delete restrict,
  attempt_id uuid not null unique references public.game_attempts (id) on delete restrict,
  status text not null default 'selected'
    check (status in ('selected', 'notified', 'delivered')),
  note text not null default '',
  selected_at timestamptz not null default now(),
  delivered_at timestamptz,
  handled_by uuid not null references auth.users (id),
  updated_at timestamptz not null default now(),
  foreign key (attempt_id, campaign_id)
    references public.game_attempts (id, campaign_id) on delete restrict
);

drop trigger if exists set_prize_awards_updated_at on public.prize_awards;
create trigger set_prize_awards_updated_at
before update on public.prize_awards
for each row execute function public.set_updated_at();

alter table public.prize_awards enable row level security;
create policy "admins manage prize awards" on public.prize_awards
for all to authenticated using (public.is_admin()) with check (public.is_admin());

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
  greatest(0, floor(extract(epoch from (a.completed_at - a.started_at))))::integer
    as elapsed_seconds,
  a.started_at,
  a.completed_at
from public.game_attempts a
join public.participants p on p.id = a.participant_id
join public.campaigns c on c.id = a.campaign_id
join public.institutions i on i.id = c.institution_id
where a.status = 'completed' and a.completed_at is not null;

create or replace function public.admin_get_rankings(p_campaign_id uuid default null)
returns table (
  rank integer,
  attempt_id uuid,
  campaign_id uuid,
  campaign_title text,
  institution_name text,
  nickname text,
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
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  return query
  select r.rank, r.attempt_id, r.campaign_id, r.campaign_title,
         r.institution_name, r.nickname, r.verified_score, r.answered_count,
         r.elapsed_seconds, r.started_at, r.completed_at
  from public.campaign_rankings r
  where p_campaign_id is null or r.campaign_id = p_campaign_id
  order by r.campaign_title, r.rank;
end;
$$;

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

create or replace function public.select_campaign_winner(p_campaign_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  winner_attempt_id uuid;
  award_id uuid;
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  select attempt_id into winner_attempt_id
  from public.campaign_rankings
  where campaign_id = p_campaign_id and rank = 1;
  if winner_attempt_id is null then
    raise exception '완료한 참여자가 없어 1위를 선정할 수 없습니다.';
  end if;

  insert into public.prize_awards
    (campaign_id, attempt_id, status, selected_at, delivered_at, handled_by)
  values (p_campaign_id, winner_attempt_id, 'selected', now(), null, auth.uid())
  on conflict (campaign_id) do update
  set attempt_id = excluded.attempt_id,
      status = 'selected',
      selected_at = now(),
      delivered_at = null,
      handled_by = auth.uid()
  returning id into award_id;
  return award_id;
end;
$$;

create or replace function public.update_prize_award(
  p_campaign_id uuid,
  p_status text,
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  if p_status not in ('selected', 'notified', 'delivered') then
    raise exception '잘못된 상품 지급 상태입니다.';
  end if;
  update public.prize_awards
  set status = p_status,
      note = coalesce(p_note, ''),
      delivered_at = case when p_status = 'delivered' then now() else null end,
      handled_by = auth.uid()
  where campaign_id = p_campaign_id;
  if not found then raise exception '먼저 1위를 선정해 주세요.'; end if;
end;
$$;

revoke all on function public.admin_get_rankings(uuid) from public;
revoke all on function public.get_campaign_leaderboard(text, integer) from public;
revoke all on function public.select_campaign_winner(uuid) from public;
revoke all on function public.update_prize_award(uuid, text, text) from public;

grant execute on function public.admin_get_rankings(uuid) to authenticated;
grant execute on function public.get_campaign_leaderboard(text, integer) to anon, authenticated;
grant execute on function public.select_campaign_winner(uuid) to authenticated;
grant execute on function public.update_prize_award(uuid, text, text) to authenticated;
