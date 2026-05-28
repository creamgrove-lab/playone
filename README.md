# Play One?!

朋友揪團用的小網頁，可以開團、選時段、收回覆，並在大廳整理今晚開的團與熱門時段。手遊、羽球、桌遊這類活動都可以放在同一套流程裡。

## 目前功能

- 揪團大廳：依台灣時間顯示現在可以加入、今晚開的團、全部揪團。
- 即時排序：大廳每分鐘刷新一次，正在可加入與即將開始的團會排在前面。
- 今晚開的團：快速看到今天有哪些團，以及跨團統計的熱門時段。
- 多個推薦時段：每張團卡會列出最多人可加入的前幾個時間，不只顯示一個。
- 開團表單：包含遊戲選單、日期、時段、備註。
- 加入揪團：朋友可以填暱稱、可加入時段與留言。
- 資料儲存：預設存在本機瀏覽器，也預留 Supabase 雲端同步設定。

## 本機預覽

```powershell
python -m http.server 4173
```

接著打開 `http://localhost:4173`。

## Supabase 設定

若要讓不同設備看到同一份資料，需要使用 Supabase 或其他雲端資料庫。GitHub Pages 適合放靜態網頁，但不適合直接當成多人即時資料庫。

這個專案預設使用獨立資料表 `play_one_invites`，不會碰你 Supabase 裡原本存其他資料的表。

在 Supabase SQL Editor 建表，可以直接貼上 `supabase-setup.sql`，或使用下面這段：

```sql
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
```

接著到 `app.js` 填入：

```js
const SUPABASE_URL = "你的 Project URL";
const SUPABASE_ANON_KEY = "你的 anon public key";
```

不要把 `service_role` key 放到前端網頁。

## 管理模式

右上角齒輪可以進入管理模式，預設密碼在 `app.js` 的 `ADMIN_PASSWORD`。這是方便私人小圈圈使用的前台管理，不是嚴格資安用途。

若要在前台刪除整團，請在 Supabase SQL Editor 跑一次 `supabase-delete-policy.sql`。
