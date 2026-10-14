-- 운영 로그가 계속 쌓이면 관리하기 어려워지므로, 관리자(super)가 개별 로그를
-- 삭제하거나 기준일 이전 로그를 일괄 삭제할 수 있도록 한다. 지금까지는
-- select, insert만 허용돼 있어 삭제가 막혀 있었다.

grant delete on public.admin_audit_logs to service_role;
