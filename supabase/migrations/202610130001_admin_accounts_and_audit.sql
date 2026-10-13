-- 다중 관리자 계정(RBAC)과 운영 감사 로그를 추가한다.
-- 두 테이블 모두 관리자 전용 API 서버(service_role)에서만 접근한다.

create table if not exists public.admin_accounts (
  id uuid primary key default gen_random_uuid(),
  login_id text not null unique,
  display_name text not null,
  password_hash text not null,
  roles text[] not null default array['viewer']::text[],
  active boolean not null default true,
  created_by_login_id text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_accounts_roles_valid check (
    cardinality(roles) > 0
    and roles <@ array['super', 'content', 'operations', 'viewer']::text[]
  )
);

drop trigger if exists set_admin_accounts_updated_at on public.admin_accounts;
create trigger set_admin_accounts_updated_at
before update on public.admin_accounts
for each row execute function public.set_updated_at();

alter table public.admin_accounts enable row level security;
revoke all on public.admin_accounts from public, anon, authenticated;
grant select, insert, update, delete on public.admin_accounts to service_role;

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_login_id text not null,
  admin_display_name text not null default '',
  roles_snapshot text[] not null default array[]::text[],
  action text not null,
  target_type text not null,
  target_id text,
  reason text,
  before jsonb,
  after jsonb,
  ip text
);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_logs_target_idx
  on public.admin_audit_logs (target_type, target_id);

alter table public.admin_audit_logs enable row level security;
revoke all on public.admin_audit_logs from public, anon, authenticated;
grant select, insert on public.admin_audit_logs to service_role;
