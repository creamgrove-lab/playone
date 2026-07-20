alter table public.play_one_invites enable row level security;

drop policy if exists "Anyone can create play one invites" on public.play_one_invites;
create policy "Anyone can create play one invites"
on public.play_one_invites
for insert
with check (true);

drop policy if exists "Anyone can update play one invites" on public.play_one_invites;
create policy "Anyone can update play one invites"
on public.play_one_invites
for update
using (true)
with check (true);
