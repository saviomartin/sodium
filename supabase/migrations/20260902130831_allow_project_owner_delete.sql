grant delete on table public.projects to authenticated;

create policy "projects_delete_owner" on public.projects
  for delete to authenticated
  using ((select auth.uid()) is not null and owner_id = (select auth.uid()));
