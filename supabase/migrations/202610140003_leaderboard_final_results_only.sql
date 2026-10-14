-- 참가자에게는 더 이상 게임 중 실시간 순위를 노출하지 않고, 결과(완료) 화면에서만
-- 노출한다. get_campaign_public()이 leaderboard_visible 값을 함께 내려줘야
-- 프런트에서 결과 화면 진입 시 순위 패널을 보여줄지 판단할 수 있다.
--
-- 반환 테이블 구조가 바뀌므로 create or replace로는 적용되지 않는다(열 추가는
-- replace로 되지 않음) — drop 후 재생성한다.

drop function if exists public.get_campaign_public(text);

create function public.get_campaign_public(p_public_token text)
returns table (
  campaign_id uuid,
  campaign_title text,
  institution_name text,
  required_question_count integer,
  leaderboard_visible boolean
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select c.id, c.title, i.name, c.required_question_count, c.leaderboard_visible
  from public.campaigns c
  join public.institutions i on i.id = c.institution_id
  where c.public_token = trim(p_public_token)
    and c.active
    and i.active
    and (c.starts_at is null or c.starts_at <= now())
    and (c.ends_at is null or c.ends_at > now());
$$;

revoke all on function public.get_campaign_public(text) from public;
grant execute on function public.get_campaign_public(text) to anon, authenticated;
