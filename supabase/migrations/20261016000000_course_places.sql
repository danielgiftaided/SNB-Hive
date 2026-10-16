-- Existing workshops also use this field; do not constrain or rewrite them.
alter table public.bookings add column if not exists num_people integer;
comment on column public.bookings.num_people is 'Places in this purchase; NULL on historical single-place class bookings.';
notify pgrst, 'reload schema';
