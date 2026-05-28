const STORAGE_KEY = "play-one-invites-v2";

const SUPABASE_URL = "https://gvzqhwnjuxmnoayytytz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Cer_OmdZcW97rJwSXPhs-Q_gXI8woLj";
const SUPABASE_TABLE = "play_one_invites";
const ADMIN_PASSWORD = "playone-admin";

const seedInvites = [
  {
    id: "pastabe-tonight",
    title: "今晚一起 pastabe？",
    host: "阿晴",
    game: "pastabe",
    date: todayIso(),
    slots: ["18:00 - 19:00", "19:00 - 21:00", "22:00 之後"],
    note: "Discord 集合，輕鬆玩。",
    participants: [
      { nickname: "阿晴", slots: ["19:00 - 21:00", "22:00 之後"], message: "我先開房" },
      { nickname: "小夏", slots: ["18:00 - 19:00", "19:00 - 21:00"], message: "" },
      { nickname: "Wayne", slots: ["19:00 - 21:00"], message: "九點前都可以" },
    ],
  },
  {
    id: "ranked-night",
    title: "今晚排位缺兩個",
    host: "Mina",
    game: "英雄聯盟",
    date: todayIso(),
    slots: ["20:00 - 22:00", "22:00 之後"],
    note: "有語音佳，輸了不嘴。",
    participants: [
      { nickname: "Mina", slots: ["20:00 - 22:00"], message: "" },
      { nickname: "阿哲", slots: ["20:00 - 22:00", "22:00 之後"], message: "" },
      { nickname: "Nora", slots: ["22:00 之後"], message: "我晚點上" },
    ],
  },
  {
    id: "weekend-unite",
    title: "週末 Pokemon Unite",
    host: "Leo",
    game: "Pokemon Unite",
    date: addDaysIso(2),
    slots: ["14:00 - 16:00", "16:00 - 18:00"],
    note: "",
    participants: [{ nickname: "Leo", slots: ["14:00 - 16:00"], message: "" }],
  },
];

let toastTimer;
let lobbyRefreshTimer;
let activeLobbyFilter = "upcoming";
let adminMode = sessionStorage.getItem("play-one-admin") === "true";

const remoteEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const store = {
  async list() {
    if (!remoteEnabled) {
      return localList();
    }

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?select=*&order=date.asc`, {
        headers: supabaseHeaders(),
      });
      if (!response.ok) throw new Error("Supabase list failed");
      const rows = await response.json();
      return rows.map(normalizeInvite);
    } catch (error) {
      console.warn(error);
      showToast("雲端讀取失敗，暫時顯示本機資料");
      return localList();
    }
  },

  async create(invite) {
    const invites = localList();
    localSave([...invites, invite]);

    if (!remoteEnabled) {
      return invite;
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}`, {
      method: "POST",
      headers: { ...supabaseHeaders(), Prefer: "return=representation" },
      body: JSON.stringify(invite),
    });
    if (!response.ok) throw new Error("Supabase create failed");
    return normalizeInvite((await response.json())[0]);
  },

  async update(invite) {
    const invites = localList().map((entry) => (entry.id === invite.id ? invite : entry));
    localSave(invites);

    if (!remoteEnabled) {
      return invite;
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=eq.${encodeURIComponent(invite.id)}`, {
      method: "PATCH",
      headers: { ...supabaseHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({
        participants: invite.participants,
        slots: invite.slots,
        title: invite.title,
        host: invite.host,
        game: invite.game,
        date: invite.date,
        note: invite.note,
      }),
    });
    if (!response.ok) throw new Error("Supabase update failed");
    return normalizeInvite((await response.json())[0]);
  },

  async remove(id) {
    localSave(localList().filter((entry) => entry.id !== id));

    if (!remoteEnabled) {
      return;
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: supabaseHeaders(),
    });
    if (!response.ok) throw new Error("Supabase delete failed");
  },
};

function supabaseHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

function localList() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    localSave(seedInvites);
    return clone(seedInvites);
  }
  try {
    return JSON.parse(saved).map(normalizeInvite);
  } catch {
    localSave(seedInvites);
    return clone(seedInvites);
  }
}

function localSave(invites) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(invites));
}

function normalizeInvite(invite) {
  return {
    id: invite.id,
    title: invite.title || "未命名的團",
    host: invite.host || "匿名",
    game: invite.game || "其他遊戲",
    date: invite.date || todayIso(),
    slots: Array.isArray(invite.slots) ? invite.slots : [],
    note: invite.note || "",
    participants: Array.isArray(invite.participants) ? invite.participants : [],
  };
}

async function route() {
  clearInterval(lobbyRefreshTimer);
  const raw = location.hash.replace(/^#\/?/, "");
  const [page, id] = raw.split("/");

  if (page === "new") {
    renderNew();
    return;
  }
  if (page === "invite" && id) {
    await renderDetail(id);
    return;
  }
  await renderLobby();
}

function useTemplate(name) {
  const app = document.querySelector("#app");
  app.replaceChildren(document.querySelector(`#${name}`).content.cloneNode(true));
}

function showToast(text) {
  const toast = document.querySelector("#toast");
  clearTimeout(toastTimer);
  toast.textContent = text;
  toast.classList.add("is-visible");
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2300);
}

function setupAdminButton() {
  const button = document.querySelector("#admin-button");
  if (!button) return;

  button.classList.toggle("is-active", adminMode);
  button.addEventListener("click", () => {
    if (adminMode) {
      adminMode = false;
      sessionStorage.removeItem("play-one-admin");
      button.classList.remove("is-active");
      showToast("已離開管理模式");
      route();
      return;
    }

    const password = prompt("請輸入管理密碼");
    if (password === ADMIN_PASSWORD) {
      adminMode = true;
      sessionStorage.setItem("play-one-admin", "true");
      button.classList.add("is-active");
      showToast("已進入管理模式");
      route();
      return;
    }

    if (password !== null) {
      showToast("管理密碼不正確");
    }
  });
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("zh-TW", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function formatDateBadge(value) {
  const date = new Date(`${value}T00:00:00`);
  const parts = new Intl.DateTimeFormat("zh-TW", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  const weekday = parts.find((part) => part.type === "weekday")?.value || "";
  return `${month}/${day}（${weekday}）`;
}

function todayIso() {
  return taiwanDateParts().date;
}

function addDaysIso(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return taiwanDateParts(date).date;
}

function taiwanDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const hour = Number(parts.hour === "24" ? "0" : parts.hour);
  const minute = Number(parts.minute);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + minute,
  };
}

function firstTimeValue(slot) {
  const match = slot.match(/(\d{1,2}):(\d{2})/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]) * 60 + Number(match[2]);
}

function slotWindow(slot) {
  const times = [...slot.matchAll(/(\d{1,2}):(\d{2})/g)].map(
    (match) => Number(match[1]) * 60 + Number(match[2])
  );
  if (!times.length) return { start: Number.MAX_SAFE_INTEGER, end: Number.MAX_SAFE_INTEGER };
  const start = times[0];
  let end = times[1] ?? 24 * 60;
  if (/之後|以後|後/.test(slot) && times.length === 1) end = 24 * 60;
  if (end < start) end += 24 * 60;
  return { start, end };
}

function inviteWindow(invite) {
  const windows = invite.slots.map(slotWindow);
  return {
    start: Math.min(...windows.map(({ start }) => start), Number.MAX_SAFE_INTEGER),
    end: Math.max(...windows.map(({ end }) => end), 0),
  };
}

function inviteStatus(invite) {
  const now = taiwanDateParts();
  const window = inviteWindow(invite);
  if (invite.date < now.date) return { label: "已結束", rank: 4, minutesUntil: Number.MAX_SAFE_INTEGER };
  if (invite.date > now.date) return { label: "即將到來", rank: 3, minutesUntil: Number.MAX_SAFE_INTEGER };
  if (now.minutes >= window.start && now.minutes <= window.end) {
    return { label: "現在可加入", rank: 0, minutesUntil: 0 };
  }
  if (now.minutes < window.start) {
    const minutesUntil = window.start - now.minutes;
    return {
      label: minutesUntil <= 90 ? `${minutesUntil} 分鐘後` : "今晚稍晚",
      rank: minutesUntil <= 90 ? 1 : 2,
      minutesUntil,
    };
  }
  return { label: "今晚已結束", rank: 4, minutesUntil: Number.MAX_SAFE_INTEGER };
}

function countsFor(invite) {
  return invite.slots
    .map((slot) => ({
      slot,
      count: invite.participants.filter((person) => person.slots.includes(slot)).length,
    }))
    .sort((a, b) => b.count - a.count || firstTimeValue(a.slot) - firstTimeValue(b.slot));
}

function bestSlots(invite, limit = 3) {
  return countsFor(invite)
    .filter(({ count }) => count > 0)
    .slice(0, limit);
}

function aggregateSlots(invites, limit = 4) {
  const totals = new Map();
  invites.forEach((invite) => {
    countsFor(invite).forEach(({ slot, count }) => {
      totals.set(slot, (totals.get(slot) || 0) + count);
    });
  });
  return [...totals.entries()]
    .map(([slot, count]) => ({ slot, count }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count || firstTimeValue(a.slot) - firstTimeValue(b.slot))
    .slice(0, limit);
}

function sortedInvites(invites, filter) {
  return invites
    .filter((invite) => {
      if (filter === "all") return true;
      if (filter === "tonight") return invite.date === todayIso();
      return inviteStatus(invite).rank < 4;
    })
    .sort((a, b) => {
      const statusA = inviteStatus(a);
      const statusB = inviteStatus(b);
      return (
        statusA.rank - statusB.rank ||
        statusA.minutesUntil - statusB.minutesUntil ||
        a.date.localeCompare(b.date) ||
        inviteWindow(a).start - inviteWindow(b).start
      );
    });
}

async function renderLobby() {
  useTemplate("lobby-template");
  const invites = await store.list();

  renderTonight(invites);
  renderCards(invites, activeLobbyFilter);

  document.querySelectorAll(".filter").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === activeLobbyFilter);
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      activeLobbyFilter = button.dataset.filter;
      renderCards(invites, activeLobbyFilter);
    });
  });

  clearInterval(lobbyRefreshTimer);
  lobbyRefreshTimer = setInterval(async () => {
    if (!location.hash || location.hash === "#/" || location.hash === "#") {
      const freshInvites = await store.list();
      renderTonight(freshInvites);
      renderCards(freshInvites, activeLobbyFilter);
    }
  }, 60 * 1000);
}

function renderTonight(invites) {
  const tonightInvites = sortedInvites(invites, "tonight");
  const list = document.querySelector("#tonight-list");
  const heroTitle = document.querySelector("#hero-tonight-title");
  const heroSlot = document.querySelector("#hero-best-slot");
  const heroAvatars = document.querySelector("#hero-avatars");
  const topSlots = aggregateSlots(tonightInvites);

  if (!tonightInvites.length) {
    list.innerHTML = '<p class="empty empty--compact">今晚還沒有團。開第一團，朋友就有地方報名了。</p>';
    heroTitle.textContent = "今晚還沒有團";
    heroSlot.textContent = "開團後自動統計";
    heroAvatars.innerHTML = '<span>?</span>';
    return;
  }

  heroTitle.textContent = `${tonightInvites.length} 團正在等人`;
  heroSlot.textContent = topSlots[0] ? `${topSlots[0].slot} (${topSlots[0].count} 人)` : "尚未有人填時段";
  heroAvatars.innerHTML = tonightInvites
    .flatMap((invite) => invite.participants)
    .slice(0, 4)
    .map((person) => `<span>${escapeHtml(person.nickname.slice(0, 1))}</span>`)
    .join("");

  list.innerHTML = `
    <div class="tonight-summary">
      <span>熱門時段</span>
      <div class="slot-rank">
        ${topSlots.map(({ slot, count }) => `<b>${escapeHtml(slot)} <small>${count} 人</small></b>`).join("")}
      </div>
    </div>
    ${tonightInvites
      .map((invite) => {
        const best = bestSlots(invite, 2);
        return `
          <a class="tonight-item" href="#/invite/${encodeURIComponent(invite.id)}">
            <span class="game-pill">${escapeHtml(invite.game)}</span>
            <strong>${escapeHtml(invite.title)}</strong>
            <small>${best.map(({ slot, count }) => `${escapeHtml(slot)} / ${count} 人`).join("、") || "等朋友填時間"}</small>
          </a>
        `;
      })
      .join("")}
  `;
}

function renderCards(invites, filter) {
  const grid = document.querySelector("#invite-grid");
  const filteredInvites = sortedInvites(invites, filter);
  if (!filteredInvites.length) {
    grid.innerHTML = '<p class="empty">目前沒有符合條件的團，開一個新的吧。</p>';
    return;
  }

  grid.innerHTML = filteredInvites
    .map((invite) => {
      const best = bestSlots(invite);
      const status = inviteStatus(invite);
      return `
        <article class="invite-card">
          <div class="invite-card__top">
            <span class="game-pill">${escapeHtml(invite.game)}</span>
            <span class="status-badge status-badge--rank-${status.rank}">${escapeHtml(status.label)}</span>
          </div>
          <div class="date-badge">${formatDate(invite.date)}</div>
          <h3>${escapeHtml(invite.title)}</h3>
          <div class="host">
            <span class="host__avatar">${escapeHtml(invite.host.slice(0, 1))}</span>
            <span>${escapeHtml(invite.host)} 開團</span>
          </div>
          <div class="best-slot">
            最多人可加入
            <div class="best-slot__list">
              ${
                best.length
                  ? best.map(({ slot, count }) => `<strong>${escapeHtml(slot)} <small>${count} 人</small></strong>`).join("")
                  : "<strong>等朋友填時間</strong>"
              }
            </div>
          </div>
          <div class="invite-card__footer">
            <span>${invite.participants.length} 人已回覆</span>
            <a class="join-link" href="#/invite/${encodeURIComponent(invite.id)}">加入這團</a>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderNew() {
  useTemplate("new-template");
  const form = document.querySelector("#create-form");
  const date = document.querySelector("#event-date");

  date.value = todayIso();
  date.min = todayIso();

  document.querySelector("#add-slot").addEventListener("click", () => {
    const input = document.querySelector("#custom-slot");
    const slot = input.value.trim();
    if (!slot) return;

    const existing = [...form.querySelectorAll('input[name="slots"]')].some(
      (checkbox) => checkbox.value === slot
    );
    if (existing) {
      showToast("這個時段已經在清單裡了");
      return;
    }

    const label = document.createElement("label");
    label.className = "slot-choice";
    label.innerHTML = `<input type="checkbox" name="slots" checked value="${escapeAttribute(slot)}" /><span>${escapeHtml(slot)}</span>`;
    document.querySelector("#slot-options").append(label);
    input.value = "";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selectedSlots = [...form.querySelectorAll('input[name="slots"]:checked')].map(
      (input) => input.value
    );
    const error = document.querySelector("#slot-error");
    if (!selectedSlots.length) {
      error.textContent = "請至少選一個可以玩的時段";
      return;
    }

    error.textContent = "";
    const data = new FormData(form);
    const game = data.get("customGame").trim() || data.get("game");
    if (!game) {
      error.textContent = "請選一款遊戲 / 活動，或直接輸入名稱";
      return;
    }

    const id = `play-${Date.now()}`;
    const invite = {
      id,
      title: data.get("title").trim(),
      host: data.get("host").trim(),
      game,
      date: data.get("date"),
      slots: selectedSlots,
      note: data.get("note").trim(),
      participants: [{ nickname: data.get("host").trim(), slots: selectedSlots, message: "團主大人" }],
    };

    try {
      await store.create(invite);
      location.hash = `#/invite/${id}`;
      showToast(remoteEnabled ? "已同步到雲端" : "已存在這台裝置");
    } catch (error) {
      console.error(error);
      showToast("送出失敗，請稍後再試");
    }
  });
}

async function renderDetail(id) {
  const invites = await store.list();
  const invite = invites.find((entry) => entry.id === decodeURIComponent(id));
  if (!invite) {
    location.hash = "#/";
    showToast("找不到這個揪團");
    return;
  }

  useTemplate("detail-template");
  const redraw = () => {
    drawInvitation(invite);
    bindAdminTools(invites, invite);
    bindShareButton();
  };
  redraw();
  drawJoinOptions(invite);

  function bindShareButton() {
    document.querySelector("#share-button")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        showToast("連結已複製");
      } catch {
        showToast("複製失敗，請直接複製網址列");
      }
    });
  }

  document.querySelector("#join-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const slots = [...form.querySelectorAll('input[name="join-slots"]:checked')].map(
      (input) => input.value
    );
    const error = document.querySelector("#join-error");
    if (!slots.length) {
      error.textContent = "請至少選一個你可以的時段";
      return;
    }

    error.textContent = "";
    const data = new FormData(form);
    invite.participants.push({
      nickname: data.get("nickname").trim(),
      slots,
      message: data.get("message").trim(),
    });

    try {
      await store.update(invite);
      redraw();
      form.reset();
      showToast(remoteEnabled ? "已同步你的時間" : "已記下你的時間");
    } catch (error) {
      console.error(error);
      showToast("更新失敗，請稍後再試");
    }
  });
}

function drawInvitation(invite) {
  const article = document.querySelector("#invitation");
  const counts = countsFor(invite);
  const max = Math.max(...counts.map(({ count }) => count), 1);
  const people = invite.participants
    .map(
      (person, index) => {
        const isHost = person.nickname === invite.host || person.message === "團主大人";
        const visibleMessage = ["團主大人", "開團的人"].includes(person.message) ? "" : person.message;
        return `
        <div class="person ${isHost ? "person--host" : ""}">
          <div class="person__main">
            ${isHost ? '<span class="host-badge">團主大人</span>' : ""}
            <strong>${escapeHtml(person.nickname)}</strong>
            ${adminMode ? `<button class="person__delete" type="button" data-remove-person="${index}">刪除</button>` : ""}
          </div>
          <span>${escapeHtml(person.slots.join("、"))}${visibleMessage ? ` / ${escapeHtml(visibleMessage)}` : ""}</span>
        </div>`;
      }
    )
    .join("");

  article.innerHTML = `
    <div class="invitation__top">
      <div>
        <span class="game-pill game-pill--large">${escapeHtml(invite.game)}</span>
        <h1>${escapeHtml(invite.title)}</h1>
        <div class="invite-meta">
          <span class="date-chip">${formatDateBadge(invite.date)}</span>
          <span class="host-chip"><b>團主大人</b>${escapeHtml(invite.host)}</span>
        </div>
      </div>
      <button type="button" class="button button--small share" id="share-button">分享連結</button>
    </div>
    ${invite.note ? `<p class="note">${escapeHtml(invite.note)}</p>` : ""}
    <section class="availability">
      <h2>大家可以的時段</h2>
      ${counts
        .map(
          ({ slot, count }, index) => `
            <div class="availability-row ${index < 3 ? "availability-row--highlight" : ""}">
              <div class="availability-row__top"><span>${escapeHtml(slot)}</span><strong>${count} 人</strong></div>
              <div class="bar"><span style="width:${Math.max((count / max) * 100, 4)}%"></span></div>
            </div>`
        )
        .join("")}
    </section>
    <section class="people">
      <h2>已回覆的人 (${invite.participants.length})</h2>
      ${people || '<p class="empty empty--compact">還沒有人回覆。</p>'}
    </section>
    ${adminMode ? renderAdminPanel(invite) : ""}
  `;
}

function renderAdminPanel(invite) {
  return `
    <section class="admin-panel">
      <div class="admin-panel__head">
        <h2>管理編輯</h2>
        <button class="admin-delete" id="delete-invite" type="button">刪除整團</button>
      </div>
      <form class="admin-form" id="admin-edit-form">
        <label class="field">
          <span>團名</span>
          <input name="title" required maxlength="50" value="${escapeAttribute(invite.title)}" />
        </label>
        <label class="field">
          <span>團主大人</span>
          <input name="host" required maxlength="18" value="${escapeAttribute(invite.host)}" />
        </label>
        <label class="field">
          <span>遊戲 / 活動</span>
          <input name="game" required maxlength="40" value="${escapeAttribute(invite.game)}" />
        </label>
        <label class="field">
          <span>日期</span>
          <input name="date" type="date" required value="${escapeAttribute(invite.date)}" />
        </label>
        <label class="field field--full">
          <span>時段</span>
          <textarea name="slots" rows="3" required>${escapeHtml(invite.slots.join("\n"))}</textarea>
          <small class="field-hint">一行一個時段，例如 19:00 - 21:00</small>
        </label>
        <label class="field field--full">
          <span>備註</span>
          <textarea name="note" rows="3" maxlength="160">${escapeHtml(invite.note)}</textarea>
        </label>
        <button class="button button--primary button--wide" type="submit">儲存修改</button>
      </form>
    </section>
  `;
}

function bindAdminTools(invites, invite) {
  if (!adminMode) return;

  document.querySelector("#admin-edit-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextSlots = data
      .get("slots")
      .split(/\r?\n/)
      .map((slot) => slot.trim())
      .filter(Boolean);

    if (!nextSlots.length) {
      showToast("請至少保留一個時段");
      return;
    }

    Object.assign(invite, {
      title: data.get("title").trim(),
      host: data.get("host").trim(),
      game: data.get("game").trim(),
      date: data.get("date"),
      slots: nextSlots,
      note: data.get("note").trim(),
    });

    invite.participants = invite.participants.map((person) => ({
      ...person,
      slots: person.slots.filter((slot) => nextSlots.includes(slot)),
    }));

    try {
      await store.update(invite);
      showToast("揪團已更新");
      await renderDetail(invite.id);
    } catch (error) {
      console.error(error);
      showToast("更新失敗，請稍後再試");
    }
  });

  document.querySelector("#delete-invite")?.addEventListener("click", async () => {
    if (!confirm("確定要刪除整個揪團嗎？這個動作不能復原。")) return;

    try {
      await store.remove(invite.id);
      showToast("揪團已刪除");
      location.hash = "#/";
    } catch (error) {
      console.error(error);
      showToast("刪除失敗，請確認 Supabase 已允許刪除");
    }
  });

  document.querySelectorAll("[data-remove-person]").forEach((button) => {
    button.addEventListener("click", async () => {
      const index = Number(button.dataset.removePerson);
      const person = invite.participants[index];
      if (!person || !confirm(`確定要刪除 ${person.nickname} 的回覆嗎？`)) return;

      invite.participants.splice(index, 1);
      try {
        await store.update(invite);
        showToast("回覆已刪除");
        await renderDetail(invite.id);
      } catch (error) {
        console.error(error);
        showToast("刪除回覆失敗，請稍後再試");
      }
    });
  });
}

function drawJoinOptions(invite) {
  document.querySelector("#join-options").innerHTML = invite.slots
    .map(
      (slot) =>
        `<label class="slot-choice"><input type="checkbox" name="join-slots" value="${escapeAttribute(slot)}" /><span>${escapeHtml(slot)}</span></label>`
    )
    .join("");
}

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", () => {
  setupAdminButton();
  route();
});
