const STORAGE_KEY = "play-one-invites-v2";

const SUPABASE_URL = "https://gvzqhwnjuxmnoayytytz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Cer_OmdZcW97rJwSXPhs-Q_gXI8woLj";
const SUPABASE_TABLE = "play_one_invites";
const SETTINGS_KEY = "play-one-site-copy-v1";
const SETTINGS_TABLE = "website_settings";
const ADMIN_PASSWORD = "0000";

const defaultCopy = {
  brandIcon: "P1",
  logoImage: "",
  brandName: "Play One?!",
  navLobby: "點我到大廳",
  newButton: "+ 開新團",
  heroTitle: "今天玩什麼???",
  heroText: "大家時間都不一定，所以有了這個小平台，來幫忙彙整時間！希望大家都有愉快的遊戲時光～",
  heroPrimary: "開一個新團",
  heroSecondary: "看目前揪團",
  heroCardLabel: "今晚熱門時段",
  heroCardSmall: "最多人可加入",
  tonightTitle: "今晚開的團",
  lobbyTitle: "揪團大廳",
  adminNote: "管理員小嘮叨：這個網頁是我自己和 AI 摸索做的，如果哪裡有 bug 請隨時跟我說～我再改！",
  footerSlogan: "友善玩樂，心平氣和",
};

const gameGroups = [
  {
    label: "手機",
    options: [
      "Pastale (追殺蠟筆)",
      "Family Style (合作煮飯)",
      "WePlay-動次打次拳",
      "WePlay-誰是臥底",
      "WePlay-你話我猜",
    ],
  },
  {
    label: "電腦",
    options: ["Steam-猛獸派對", "Steam-PICO PARK (貓咪合作吵架)", "Steam-煙雲十六聲", "Steam-煮過頭"],
  },
  {
    label: "Switch",
    options: ["Switch-煮過頭"],
  },
];

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
let siteCopy = clone(defaultCopy);
let draftCopy = clone(defaultCopy);
let copyHistory = [];
let copyFuture = [];
let hasUnsavedCopy = false;

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
    if (!remoteEnabled) {
      const invites = localList();
      localSave([...invites, invite]);
      return invite;
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}`, {
      method: "POST",
      headers: { ...supabaseHeaders(), Prefer: "return=representation" },
      body: JSON.stringify(invite),
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Supabase create failed (${response.status}): ${responseText}`);
    }
    const rows = responseText ? JSON.parse(responseText) : [];
    const savedInvite = normalizeInvite(rows[0] || invite);
    const invites = localList().filter((entry) => entry.id !== savedInvite.id);
    localSave([...invites, savedInvite]);
    return savedInvite;
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
    if (!remoteEnabled) {
      localSave(localList().filter((entry) => entry.id !== id));
      return;
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: supabaseHeaders(),
    });
    if (!response.ok) throw new Error("Supabase delete failed");
    localSave(localList().filter((entry) => entry.id !== id));
  },
};

const settingsStore = {
  async load() {
    const local = localStorage.getItem(SETTINGS_KEY);
    if (local) {
      try {
        siteCopy = normalizeSiteCopy({ ...defaultCopy, ...JSON.parse(local) });
        draftCopy = clone(siteCopy);
      } catch {
        siteCopy = clone(defaultCopy);
        draftCopy = clone(siteCopy);
      }
    }

    if (!remoteEnabled) return siteCopy;

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${SETTINGS_TABLE}?id=eq.1&select=data`, {
        headers: supabaseHeaders(),
      });
      if (!response.ok) throw new Error("Settings load failed");
      const rows = await response.json();
      const remoteCopy = rows[0]?.data?.playOneCopy;
      if (remoteCopy) {
        siteCopy = normalizeSiteCopy({ ...defaultCopy, ...remoteCopy });
        draftCopy = clone(siteCopy);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(siteCopy));
      }
    } catch (error) {
      console.warn(error);
    }
    return siteCopy;
  },

  async save(nextCopy) {
    siteCopy = normalizeSiteCopy({ ...defaultCopy, ...nextCopy });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(siteCopy));

    if (!remoteEnabled) return;

    try {
      const currentResponse = await fetch(`${SUPABASE_URL}/rest/v1/${SETTINGS_TABLE}?id=eq.1&select=data`, {
        headers: supabaseHeaders(),
      });
      if (!currentResponse.ok) throw new Error("Settings read before save failed");
      const rows = await currentResponse.json();
      const data = { ...(rows[0]?.data || {}), playOneCopy: siteCopy };
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${SETTINGS_TABLE}?id=eq.1`, {
        method: "PATCH",
        headers: { ...supabaseHeaders(), Prefer: "return=minimal" },
        body: JSON.stringify({ data }),
      });
      if (!response.ok) throw new Error("Settings save failed");
    } catch (error) {
      console.warn(error);
      showToast("文字已存在本機，雲端同步失敗");
    }
  },
};

function normalizeSiteCopy(copy) {
  const next = { ...copy };
  if (next.navLobby === "大廳") next.navLobby = defaultCopy.navLobby;
  if (next.heroTitle === "今天玩什麼，") next.heroTitle = defaultCopy.heroTitle;
  if (next.heroAccent === "一眼就知道。") next.heroAccent = "";
  if (next.heroText === "開團、選時段、收朋友回覆。大廳會依台灣時間把現在可加入、快開始、今晚稍晚的團排好。") {
    next.heroText = defaultCopy.heroText;
  }
  return next;
}

function gameOptionsHtml(selected = "") {
  return gameGroups
    .map(
      (group) => `
        <optgroup label="${escapeAttribute(group.label)}">
          ${group.options
            .map(
              (option) =>
                `<option value="${escapeAttribute(option)}" ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>`
            )
            .join("")}
        </optgroup>`
    )
    .join("");
}

function isKnownGame(value) {
  return gameGroups.some((group) => group.options.includes(value));
}

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
  applySiteCopy();
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
  const label = document.querySelector("#admin-mode-label");
  const logoUpload = document.querySelector("#logo-upload-button");
  if (!button) return;

  button.classList.toggle("is-active", adminMode);
  label?.classList.toggle("is-visible", adminMode);
  logoUpload?.classList.toggle("is-visible", adminMode);
  button.addEventListener("click", () => {
    if (adminMode) {
      if (hasUnsavedCopy && !confirm("還有未儲存的文字修改，要離開編輯模式嗎？")) {
        return;
      }
      adminMode = false;
      sessionStorage.removeItem("play-one-admin");
      draftCopy = clone(siteCopy);
      copyHistory = [];
      copyFuture = [];
      hasUnsavedCopy = false;
      button.classList.remove("is-active");
      label?.classList.remove("is-visible");
      logoUpload?.classList.remove("is-visible");
      disableInlineCopyEditing();
      applySiteCopy();
      showToast("已離開管理模式");
      route();
      return;
    }

    const password = prompt("請輸入管理密碼");
    if (password === ADMIN_PASSWORD) {
      adminMode = true;
      draftCopy = clone(siteCopy);
      copyHistory = [];
      copyFuture = [];
      hasUnsavedCopy = false;
      sessionStorage.setItem("play-one-admin", "true");
      button.classList.add("is-active");
      label?.classList.add("is-visible");
      logoUpload?.classList.add("is-visible");
      showToast("已進入管理模式");
      route();
      return;
    }

    if (password !== null) {
      showToast("管理密碼不正確");
    }
  });
}

function setupLogoUpload() {
  const button = document.querySelector("#logo-upload-button");
  const input = document.querySelector("#logo-upload-input");
  if (!button || !input) return;

  button.classList.toggle("is-visible", adminMode);
  button.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("請選擇圖片檔");
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", async () => {
      await settingsStore.save({ ...siteCopy, logoImage: reader.result });
      draftCopy = clone(siteCopy);
      hasUnsavedCopy = false;
      applySiteCopy();
      showToast("Logo 已更新");
      input.value = "";
    });
    reader.readAsDataURL(file);
  });
}

function applySiteCopy() {
  document.querySelectorAll("[data-copy]").forEach((node) => {
    const key = node.dataset.copy;
    const source = adminMode ? draftCopy : siteCopy;
    if (key && source[key] !== undefined) {
      if (key === "brandIcon" && source.logoImage) {
        node.innerHTML = `<img src="${escapeAttribute(source.logoImage)}" alt="" />`;
      } else {
        node.textContent = source[key];
      }
    }
  });
  document.querySelector("#admin-mode-label")?.classList.toggle("is-visible", adminMode);
  document.querySelector("#logo-upload-button")?.classList.toggle("is-visible", adminMode);
  updateEditToolbar();
  updateFavicon();
}

function updateFavicon() {
  const favicon = document.querySelector('link[rel="icon"]');
  if (!favicon) return;
  favicon.setAttribute("href", (adminMode ? draftCopy.logoImage : siteCopy.logoImage) || "favicon.svg");
}

function setDraftCopy(nextDraft, { pushHistory = true } = {}) {
  if (pushHistory) {
    copyHistory.push(clone(draftCopy));
    copyFuture = [];
  }
  draftCopy = normalizeSiteCopy({ ...defaultCopy, ...nextDraft });
  hasUnsavedCopy = JSON.stringify(draftCopy) !== JSON.stringify(siteCopy);
  applySiteCopy();
}

function setupEditToolbar() {
  document.querySelector("#undo-copy")?.addEventListener("click", () => {
    if (!copyHistory.length) return;
    copyFuture.push(clone(draftCopy));
    draftCopy = copyHistory.pop();
    hasUnsavedCopy = JSON.stringify(draftCopy) !== JSON.stringify(siteCopy);
    applySiteCopy();
  });

  document.querySelector("#redo-copy")?.addEventListener("click", () => {
    if (!copyFuture.length) return;
    copyHistory.push(clone(draftCopy));
    draftCopy = copyFuture.pop();
    hasUnsavedCopy = JSON.stringify(draftCopy) !== JSON.stringify(siteCopy);
    applySiteCopy();
  });

  document.querySelector("#save-copy")?.addEventListener("click", async () => {
    if (!hasUnsavedCopy) return;
    await settingsStore.save(draftCopy);
    draftCopy = clone(siteCopy);
    copyHistory = [];
    copyFuture = [];
    hasUnsavedCopy = false;
    applySiteCopy();
    showToast("已儲存編輯");
  });
}

function updateEditToolbar() {
  const undo = document.querySelector("#undo-copy");
  const redo = document.querySelector("#redo-copy");
  const save = document.querySelector("#save-copy");
  [undo, redo, save].forEach((button) => button?.classList.toggle("is-visible", adminMode));
  if (undo) undo.disabled = !adminMode || !copyHistory.length;
  if (redo) redo.disabled = !adminMode || !copyFuture.length;
  if (save) {
    save.disabled = !adminMode || !hasUnsavedCopy;
    save.textContent = hasUnsavedCopy ? "儲存*" : "儲存";
  }
}

function enableInlineCopyEditing() {
  document.querySelectorAll("[data-copy]").forEach((node) => {
    const key = node.dataset.copy;
    if (!key || node.dataset.inlineReady === "true") return;
    if (key === "brandIcon" && siteCopy.logoImage) return;

    node.dataset.inlineReady = "true";
    node.classList.add("inline-editable");
    node.setAttribute("contenteditable", "true");
    node.setAttribute("spellcheck", "false");
    node.setAttribute("title", "點一下直接改文字，離開後自動儲存");

    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        node.blur();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        node.textContent = draftCopy[key];
        node.blur();
      }
    });

    node.addEventListener("blur", async () => {
      const value = node.textContent.trim() || defaultCopy[key];
      if (value === draftCopy[key]) return;
      setDraftCopy({ ...draftCopy, [key]: value });
      showToast("已暫存，記得按儲存");
    });
  });
}

function disableInlineCopyEditing() {
  document.querySelectorAll("[data-copy]").forEach((node) => {
    node.classList.remove("inline-editable");
    node.removeAttribute("contenteditable");
    node.removeAttribute("spellcheck");
    node.removeAttribute("title");
    delete node.dataset.inlineReady;
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
  if (invite.date < now.date) return { label: "已過期", rank: 4, minutesUntil: Number.MAX_SAFE_INTEGER };
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
  return { label: "已過期", rank: 4, minutesUntil: Number.MAX_SAFE_INTEGER };
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
      const status = inviteStatus(invite);
      if (filter === "expired") return status.rank >= 4;
      if (filter === "tonight") return invite.date === todayIso() && status.rank < 4;
      return status.rank <= 1;
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

  renderCopyEditor();
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

function renderCopyEditor() {
  if (!adminMode) return;
  enableInlineCopyEditing();
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
            <small>${best.map(({ slot, count }) => `${escapeHtml(slot)} / ${count} 人`).join("、") || "等朋友填時間"}${adminMode ? " / 編輯" : ""}</small>
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
    const emptyText =
      filter === "upcoming"
        ? "現在沒有正在進行或快開始的團。可以切到今晚開的團看看。"
        : filter === "expired"
        ? "目前沒有已過期的團。"
        : "目前沒有符合條件的團，開一個新的吧。";
    grid.innerHTML = `<p class="empty">${emptyText}</p>`;
    return;
  }

  grid.innerHTML = filteredInvites
    .map((invite) => {
      const best = bestSlots(invite);
      const status = inviteStatus(invite);
      return `
        <article class="invite-card ${status.rank >= 4 ? "invite-card--expired" : ""}">
          <div class="invite-card__top">
            <span class="status-badge status-badge--rank-${status.rank}">${escapeHtml(status.label)}</span>
            ${
              adminMode
                ? `<button class="card-delete" type="button" data-delete-invite="${escapeAttribute(invite.id)}" aria-label="刪除 ${escapeAttribute(invite.title)}">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 7h16" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                      <path d="M6 7l1 14h10l1-14" />
                      <path d="M9 7V4h6v3" />
                    </svg>
                  </button>`
                : ""
            }
          </div>
          <div class="date-badge">${formatDate(invite.date)}</div>
          <div class="card-game-name">${escapeHtml(invite.game)}</div>
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
            <span class="card-actions">
              ${adminMode ? `<a class="edit-link" href="#/invite/${encodeURIComponent(invite.id)}">編輯</a>` : ""}
              <a class="join-link" href="#/invite/${encodeURIComponent(invite.id)}">${status.rank >= 4 ? "查看紀錄" : "加入這團"}</a>
            </span>
          </div>
        </article>
      `;
    })
    .join("");
  bindLobbyDeleteButtons(invites);
}

function bindLobbyDeleteButtons(invites) {
  if (!adminMode) return;

  document.querySelectorAll("[data-delete-invite]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.deleteInvite;
      const invite = invites.find((entry) => entry.id === id);
      if (!invite || !confirm(`確定要刪除「${invite.title}」嗎？`)) return;

      button.disabled = true;
      try {
        await store.remove(invite.id);
        const nextInvites = invites.filter((entry) => entry.id !== invite.id);
        renderTonight(nextInvites);
        renderCards(nextInvites, activeLobbyFilter);
        showToast("揪團已刪除");
      } catch (error) {
        console.error(error);
        button.disabled = false;
        showToast("刪除失敗，請確認 Supabase 刪除權限已開啟");
      }
    });
  });
}

function renderNew() {
  useTemplate("new-template");
  const form = document.querySelector("#create-form");
  const date = document.querySelector("#event-date");
  const gameSelect = document.querySelector("#game-select");
  gameSelect.innerHTML = gameOptionsHtml();
  if (!gameSelect.value) {
    gameSelect.value = gameGroups[0].options[0];
  }

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
    const title = String(data.get("title") || "").trim();
    const host = String(data.get("host") || "").trim();
    const customGame = String(data.get("customGame") || "").trim();
    const selectedGame = String(data.get("game") || "").trim();
    const game = customGame || selectedGame;
    const note = String(data.get("note") || "").trim();
    const eventDate = String(data.get("date") || "").trim();
    if (!title || !host || !eventDate) {
      error.textContent = "請把團名、團主大人和日期填好";
      return;
    }
    if (!game) {
      error.textContent = "請選一款遊戲 / 活動，或直接輸入名稱";
      return;
    }

    const id = `play-${Date.now()}`;
    const invite = {
      id,
      title,
      host,
      game,
      date: eventDate,
      slots: selectedSlots,
      note,
      participants: [{ nickname: host, slots: selectedSlots, message: "團主大人" }],
    };

    try {
      await store.create(invite);
      location.hash = `#/invite/${id}`;
      showToast(remoteEnabled ? "已同步到雲端" : "已存在這台裝置");
    } catch (error) {
      console.error(error);
      document.querySelector("#slot-error").textContent = "建立失敗，雲端沒有寫入。請確認 Supabase 權限或稍後再試。";
      showToast("建立失敗，雲端沒有寫入");
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
  const replyEntries = invite.participants
    .map((person, index) => ({ person, index }))
    .filter(({ person }) => !(person.nickname === invite.host || person.message === "團主大人"));
  const people = replyEntries
    .map(
      ({ person, index }) => {
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
        <h1 class="detail-game-name">${escapeHtml(invite.game)}</h1>
        <div class="detail-title">${escapeHtml(invite.title)}</div>
        <div class="invite-meta">
          <span class="date-chip"><b>揪團日期</b>${formatDateBadge(invite.date)}</span>
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
      <h2>已回覆的人 (${replyEntries.length})</h2>
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
          <span class="select-wrap">
            <select name="game">
              ${gameOptionsHtml(isKnownGame(invite.game) ? invite.game : "")}
            </select>
          </span>
        </label>
        <label class="field">
          <span>清單沒有才填</span>
          <input name="customGame" maxlength="40" value="${isKnownGame(invite.game) ? "" : escapeAttribute(invite.game)}" placeholder="例如羽球、桌遊、唱歌" />
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
      game: data.get("customGame").trim() || data.get("game").trim(),
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
    if (!confirm(`確定要刪除「${invite.title}」整個揪團嗎？`)) return;

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
window.addEventListener("DOMContentLoaded", async () => {
  await settingsStore.load();
  applySiteCopy();
  setupLogoUpload();
  setupEditToolbar();
  setupAdminButton();
  route();
});
