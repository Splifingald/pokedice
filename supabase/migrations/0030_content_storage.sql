-- Published content as one file in Supabase Storage (docs/11-SCALING-COST-PLAN.md §6.1).
--
-- Admin → Publish bumps configVersion, and every returning player then downloads the new content once. Until now that
-- meant reading every content table through the API (~1.3 MB, database egress). Publish now also uploads the whole
-- bundle as `content/v<configVersion>.json` to this public bucket, and players fetch that one file from the Storage CDN
-- instead (cached egress, a separate quota). A version without its file (published before this migration, or an
-- upload that failed) is still read from the tables.
--
-- Run once. Safe to run again.

insert into storage.buckets (id, name, public)
values ('content', 'content', true)
on conflict (id) do update set public = true;

-- Anyone can read a public bucket's files through its public URL; only the admin writes them. Uploading over an
-- existing file (`upsert`) needs select and update as well as insert.
drop policy if exists content_admin_select on storage.objects;
drop policy if exists content_admin_insert on storage.objects;
drop policy if exists content_admin_update on storage.objects;
drop policy if exists content_admin_delete on storage.objects;
create policy content_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'content' and (select is_admin()));
create policy content_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'content' and (select is_admin()));
create policy content_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'content' and (select is_admin()))
  with check (bucket_id = 'content' and (select is_admin()));
create policy content_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'content' and (select is_admin()));
