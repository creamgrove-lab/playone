create policy "Anyone can delete play one invites"
on public.play_one_invites
for delete
using (true);
