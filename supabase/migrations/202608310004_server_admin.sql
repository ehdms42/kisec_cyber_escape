-- 관리자 쓰기 작업은 브라우저의 authenticated 세션 대신 전용 API 서버의
-- service_role을 통해서만 수행한다.

alter table public.question_documents
  alter column uploaded_by drop not null;

drop policy if exists "admins can manage question documents"
  on public.question_documents;
drop policy if exists "admins can insert questions" on public.questions;
drop policy if exists "admins can update questions" on public.questions;
drop policy if exists "admins can delete questions" on public.questions;

drop policy if exists "admins can read question source files"
  on storage.objects;
drop policy if exists "admins can upload question source files"
  on storage.objects;
drop policy if exists "admins can update question source files"
  on storage.objects;
drop policy if exists "admins can delete question source files"
  on storage.objects;

revoke execute on function public.admin_adjust_attempt(uuid, text, text)
  from authenticated;
revoke execute on function public.admin_get_rankings(uuid)
  from authenticated;
revoke execute on function public.select_campaign_winner(uuid)
  from authenticated;
revoke execute on function public.update_prize_award(uuid, text, text)
  from authenticated;

grant execute on function public.admin_adjust_attempt(uuid, text, text)
  to service_role;
grant execute on function public.admin_get_rankings(uuid)
  to service_role;
grant execute on function public.select_campaign_winner(uuid)
  to service_role;
grant execute on function public.update_prize_award(uuid, text, text)
  to service_role;
