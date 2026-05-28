create table if not exists public.play_one_invites (
  id text primary key,
  title text not null,
  host text not null,
  game text not null,
  date date not null,
  slots jsonb not null default '[]'::jsonb,
  note text not null default '',
  participants jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.play_one_invites enable row level security;

create policy "Anyone can read play one invites"
on public.play_one_invites
for select
using (true);

create policy "Anyone can create play one invites"
on public.play_one_invites
for insert
with check (true);

create policy "Anyone can update play one invites"
on public.play_one_invites
for update
using (true)
with check (true);

create policy "Anyone can delete play one invites"
on public.play_one_invites
for delete
using (true);
