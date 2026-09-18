-- Admin cheats: the admin may read and edit any player's cloud save (Analytics → player → Cheats).
drop policy if exists admin_saves on saves;
create policy admin_saves on saves for all using (is_admin()) with check (is_admin());
