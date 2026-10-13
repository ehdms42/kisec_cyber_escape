-- 단일 시나리오("게임 설정") 메타데이터를 보관하는 싱글턴 테이블을 추가한다.

create table if not exists public.game_settings (
  id boolean primary key default true check (id),
  title text not null default 'CYBER QUEST: 보안 탈출 게임',
  description text not null default '',
  cover_image_url text not null default '',
  education_topic text not null default '',
  difficulty text not null default 'normal',
  estimated_minutes integer not null default 30 check (estimated_minutes > 0),
  default_time_limit_minutes integer not null default 30
    check (default_time_limit_minutes > 0),
  public boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by_login_id text
);

alter table public.game_settings drop constraint if exists game_settings_difficulty_check;
alter table public.game_settings add constraint game_settings_difficulty_check
  check (difficulty in ('easy', 'normal', 'hard'));

insert into public.game_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists set_game_settings_updated_at on public.game_settings;
create trigger set_game_settings_updated_at
before update on public.game_settings
for each row execute function public.set_updated_at();

alter table public.game_settings enable row level security;
revoke all on public.game_settings from public, anon, authenticated;
grant select, update on public.game_settings to service_role;
