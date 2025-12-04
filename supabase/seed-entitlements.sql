-- Seed entitlements for two users
insert into entitlements (user_id, book_id, active)
values
  ('704e5c59-7cdc-4547-872a-9e7177d4baec', 'a_novel_divorce', true),
  ('8b4c3f14-a3a8-4ed0-bcbd-1869e63a3cf9', 'a_novel_divorce', true)
on conflict (user_id, book_id) do update
  set active = excluded.active,
      updated_at = now();
