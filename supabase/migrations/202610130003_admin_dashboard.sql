-- 관리자 대시보드 집계를 단일 함수로 제공한다. 서버(service_role) 전용.

create or replace function public.admin_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception '관리자 서버 권한이 필요합니다.';
  end if;

  select jsonb_build_object(
    'sessions_in_progress', (
      select count(*) from public.campaigns where status = 'in_progress'
    ),
    'sessions_today', (
      select count(*) from public.campaigns
      where starts_at is not null
        and (starts_at at time zone 'Asia/Seoul')::date
          = (now() at time zone 'Asia/Seoul')::date
    ),
    'total_participants', (select count(*) from public.participants),
    'total_attempts', (select count(*) from public.game_attempts),
    'completed_attempts', (
      select count(*) from public.game_attempts where status = 'completed'
    ),
    'completion_rate', (
      select case when count(*) = 0 then 0 else round(
        count(*) filter (where status = 'completed')::numeric
          / count(*) * 100, 1
      ) end
      from public.game_attempts
    ),
    'average_elapsed_seconds', (
      select coalesce(round(avg(
        extract(epoch from (completed_at - started_at))
      )), 0)
      from public.game_attempts
      where status = 'completed' and completed_at is not null
    ),
    'question_accuracy', (
      select coalesce(jsonb_agg(stats order by stats ->> 'ordinal'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'ordinal', q.ordinal,
          'category', q.category,
          'attempts', count(aa.id),
          'correct', count(aa.id) filter (where aa.is_correct),
          'accuracy_rate', case when count(aa.id) = 0 then 0 else round(
            count(aa.id) filter (where aa.is_correct)::numeric
              / count(aa.id) * 100, 1
          ) end
        ) as stats
        from public.questions q
        left join public.attempt_answers aa on aa.question_id = q.id
        where q.status = 'published'
        group by q.id, q.ordinal, q.category
      ) question_stats
    ),
    'hint_usage_total', (select count(*) from public.attempt_hint_usage),
    'current_leaders', (
      select coalesce(jsonb_agg(leader), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'campaign_id', c.id,
          'campaign_title', c.title,
          'institution_name', i.name,
          'nickname', ranked.nickname,
          'verified_score', ranked.verified_score
        ) as leader
        from public.campaigns c
        join public.institutions i on i.id = c.institution_id
        join lateral (
          select e.nickname, e.verified_score
          from public.live_leaderboard_entries e
          where e.campaign_id = c.id and e.status <> 'voided'
          order by e.verified_score desc, e.score_reached_at asc, e.attempt_id asc
          limit 1
        ) ranked on true
        where c.status in ('open', 'in_progress', 'paused')
      ) leaders
    ),
    'recent_completed_sessions', (
      select coalesce(jsonb_agg(sess order by sess ->> 'ended_at' desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'campaign_id', c.id,
          'campaign_title', c.title,
          'institution_name', i.name,
          'ended_at', coalesce(c.finalized_at, c.updated_at)
        ) as sess
        from public.campaigns c
        join public.institutions i on i.id = c.institution_id
        where c.status in ('closed', 'finalized')
        order by coalesce(c.finalized_at, c.updated_at) desc
        limit 5
      ) recent
    ),
    'stalled_attempts', (
      select coalesce(jsonb_agg(stalled), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'attempt_id', a.id,
          'campaign_id', a.campaign_id,
          'nickname', p.nickname,
          'last_seen_at', a.last_seen_at
        ) as stalled
        from public.game_attempts a
        join public.participants p on p.id = a.participant_id
        where a.status = 'in_progress'
          and a.last_seen_at < now() - interval '15 minutes'
        order by a.last_seen_at asc
        limit 20
      ) stalled_list
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_dashboard_summary()
  from public, anon, authenticated;
grant execute on function public.admin_dashboard_summary() to service_role;
