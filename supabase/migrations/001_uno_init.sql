-- applied to project erqrdpwsvpixnxhscucu as migration "uno_init"
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, username text not null, current_room text, created_at timestamptz not null default now());
create unique index profiles_username_lower on public.profiles (lower(username));
create table public.rooms (code text primary key, host text not null, phase text not null default 'lobby',
  rules jsonb not null default '{"stacking":false,"jumpIn":false,"sevenZero":false}', players jsonb not null default '[]',
  state jsonb, events jsonb not null default '[]', seq int not null default 0, version int not null default 0, load_deadline bigint, updated_at timestamptz not null default now());
create table public.hands (room_code text not null references public.rooms(code) on delete cascade, player_id uuid not null, data jsonb not null, primary key (room_code, player_id));
create table public.room_secrets (room_code text primary key references public.rooms(code) on delete cascade, game jsonb);
alter table public.profiles enable row level security; alter table public.rooms enable row level security;
alter table public.hands enable row level security; alter table public.room_secrets enable row level security;
create policy "own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "rooms readable" on public.rooms for select to authenticated using (true);
create policy "own hand" on public.hands for select to authenticated using (player_id = (select auth.uid()));
alter table public.hands replica identity full;
alter publication supabase_realtime add table public.rooms, public.hands;
-- uno_load(code) / uno_commit(code, version, room, game, hands): see migration in Supabase dashboard (service_role only)
