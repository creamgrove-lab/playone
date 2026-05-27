const STORAGE_KEY = "play-one-invites-v1";
const today = "2026-05-28";

const seedInvites = [
  {
    id: "pastabe-tonight",
    title: "今晚一起玩 pastabe 嗎？",
    host: "阿葉",
    game: "pastabe",
    date: "2026-05-28",
    slots: ["18:00 - 19:00", "19:00 - 21:00", "22:00 之後"],
    note: "輕鬆玩，開 Discord 也可以！",
    participants: [
      { nickname: "小米", slots: ["19:00 - 21:00", "22:00 之後"], message: "吃完飯上線" },
      { nickname: "達達", slots: ["18:00 - 19:00", "19:00 - 21:00"], message: "" },
      { nickname: "阿葉", slots: ["18:00 - 19:00", "19:00 - 21:00", "22:00 之後"], message: "我都可" },
    ],
  },
  {
    id: "ranked-night",
    title: "今晚來打排位！缺兩位",
    host: "小米",
    game: "傳說對決",
    date: "2026-05-28",
    slots: ["20:00 - 22:00", "22:00 之後"],
    note: "希望可以語音，歡樂上分。",
    participants: [
      { nickname: "小米", slots: ["20:00 - 22:00"], message: "" },
      { nickname: "子晴", slots: ["20:00 - 22:00", "22:00 之後"], message: "" },
      { nickname: "Wayne", slots: ["22:00 之後"], message: "" },
      { nickname: "漾", slots: ["20:00 - 22:00"], message: "" },
    ],
  },
  {
    id: "weekend-unite",
    title: "週末午後悠閒場，來抓寶",
    host: "阿達",
    game: "Pokemon Unite",
    date: "2026-05-30",
    slots: ["14:00 - 16:00", "16:00 - 18:00"],
    note: "",
    participants: [{ nickname: "阿達", slots: ["14:00 - 16:00"], message: "" }],
  },
];

let toastTimer;

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function getInvites() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedInvites));
    return clone(seedInvites);
  }
  try {
    return JSON.parse(saved);
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedInvites));
    return clone(seedInvites);
  }
}

function saveInvites(invites) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(invites));
}

function route() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [page, id] = raw.split("/");

  if (page === "new") {
    renderNew();
    return;
  }
  if (page === "invite" && id) {
    renderDetail(id);
    return;
  }
  renderLobby();
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

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("zh-TW", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function countsFor(invite) {
  return invite.slots.map((slot) => ({
    slot,
    count: invite.participants.filter((person) => person.slots.includes(slot)).length,
  }));
}

function bestSlot(invite) {
  return countsFor(invite).sort((a, b) => b.count - a.count)[0] || { slot: "等待回覆", count: 0 };
}

function sortedInvites(filter) {
  return getInvites()
    .filter((invite) => filter === "all" || invite.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function renderLobby() {
  useTemplate("lobby-template");
  renderCards("upcoming");

  document.querySelectorAll(".filter").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      renderCards(button.dataset.filter);
    });
  });
}

function renderCards(filter) {
  const grid = document.querySelector("#invite-grid");
  const invites = sortedInvites(filter);
  if (!invites.length) {
    grid.innerHTML = '<p class="empty">還沒有邀約，成為第一個發起 Play 的人吧！</p>';
    return;
  }

  grid.innerHTML = invites
    .map((invite) => {
      const best = bestSlot(invite);
      return `
        <article class="invite-card">
          <div class="invite-card__top">
            <span class="game-pill">${escapeHtml(invite.game)}</span>
            <span class="date-badge">${formatDate(invite.date)}</span>
          </div>
          <h3>${escapeHtml(invite.title)}</h3>
          <div class="host">
            <span class="host__avatar">${escapeHtml(invite.host.slice(0, 1))}</span>
            <span>${escapeHtml(invite.host)} 發起</span>
          </div>
          <div class="best-slot">
            熱門時段
            <strong>${escapeHtml(best.slot)}</strong>
          </div>
          <div class="invite-card__footer">
            <span>${invite.participants.length} 人可參加</span>
            <a class="join-link" href="#/invite/${encodeURIComponent(invite.id)}">加入 →</a>
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
  date.value = today;
  date.min = today;

  document.querySelector("#add-slot").addEventListener("click", () => {
    const input = document.querySelector("#custom-slot");
    const slot = input.value.trim();
    if (!slot) {
      return;
    }
    const existing = [...form.querySelectorAll('input[name="slots"]')].some(
      (checkbox) => checkbox.value === slot
    );
    if (existing) {
      showToast("這個時段已經加入囉");
      return;
    }
    const label = document.createElement("label");
    label.className = "slot-choice";
    label.innerHTML = `<input type="checkbox" name="slots" checked value="${escapeAttribute(slot)}" /><span>${escapeHtml(slot)}</span>`;
    document.querySelector("#slot-options").append(label);
    input.value = "";
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const selectedSlots = [...form.querySelectorAll('input[name="slots"]:checked')].map(
      (input) => input.value
    );
    const error = document.querySelector("#slot-error");
    if (!selectedSlots.length) {
      error.textContent = "請至少選一個可玩的時間";
      return;
    }
    error.textContent = "";
    const data = new FormData(form);
    const id = `play-${Date.now()}`;
    const invite = {
      id,
      title: data.get("title").trim(),
      host: data.get("host").trim(),
      game: data.get("game").trim(),
      date: data.get("date"),
      slots: selectedSlots,
      note: data.get("note").trim(),
      participants: [
        { nickname: data.get("host").trim(), slots: selectedSlots, message: "發起人" },
      ],
    };
    const invites = getInvites();
    invites.push(invite);
    saveInvites(invites);
    location.hash = `#/invite/${id}`;
    showToast("邀約發布成功！可以分享給朋友了");
  });
}

function renderDetail(id) {
  const invites = getInvites();
  const invite = invites.find((entry) => entry.id === decodeURIComponent(id));
  if (!invite) {
    location.hash = "#/";
    showToast("找不到這則邀約");
    return;
  }

  useTemplate("detail-template");
  drawInvitation(invite);
  drawJoinOptions(invite);

  document.querySelector("#share-button").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      showToast("分享連結已複製！");
    } catch {
      showToast("網址就在瀏覽器上方，可直接複製分享");
    }
  });

  document.querySelector("#join-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const slots = [...form.querySelectorAll('input[name="join-slots"]:checked')].map(
      (input) => input.value
    );
    const error = document.querySelector("#join-error");
    if (!slots.length) {
      error.textContent = "請選擇至少一個你可以的時間";
      return;
    }
    error.textContent = "";
    const data = new FormData(form);
    invite.participants.push({
      nickname: data.get("nickname").trim(),
      slots,
      message: data.get("message").trim(),
    });
    saveInvites(invites);
    drawInvitation(invite);
    form.reset();
    showToast("已送出！看看大家最適合什麼時間");
  });
}

function drawInvitation(invite) {
  const article = document.querySelector("#invitation");
  const counts = countsFor(invite);
  const max = Math.max(...counts.map(({ count }) => count), 1);
  const people = invite.participants
    .map(
      (person) => `
        <div class="person">
          <strong>${escapeHtml(person.nickname)}</strong>
          <span>${escapeHtml(person.slots.join("、"))}${person.message ? ` / ${escapeHtml(person.message)}` : ""}</span>
        </div>`
    )
    .join("");

  article.innerHTML = `
    <div class="invitation__top">
      <div>
        <span class="game-pill">${escapeHtml(invite.game)}</span>
        <h1>${escapeHtml(invite.title)}</h1>
        <div class="invitation__meta">${formatDate(invite.date)} ・ ${escapeHtml(invite.host)} 發起</div>
      </div>
      <button type="button" class="button button--small share" id="share-button">分享連結</button>
    </div>
    ${invite.note ? `<p class="note">${escapeHtml(invite.note)}</p>` : ""}
    <section class="availability">
      <h2>大家可以的時間</h2>
      ${counts
        .map(
          ({ slot, count }) => `
            <div class="availability-row">
              <div class="availability-row__top"><span>${escapeHtml(slot)}</span><strong>${count} 人</strong></div>
              <div class="bar"><span style="width:${Math.max((count / max) * 100, 4)}%"></span></div>
            </div>`
        )
        .join("")}
    </section>
    <section class="people">
      <h2>已回覆的人 (${invite.participants.length})</h2>
      ${people}
    </section>
  `;
}

function drawJoinOptions(invite) {
  document.querySelector("#join-options").innerHTML = invite.slots
    .map(
      (slot) =>
        `<label class="slot-choice"><input type="checkbox" name="join-slots" value="${escapeAttribute(slot)}" /><span>${escapeHtml(slot)}</span></label>`
    )
    .join("");
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
window.addEventListener("DOMContentLoaded", route);
