/**
 * ui.js — navegación entre pantallas + componentes reutilizables.
 */

const UI = {
  root: null,
  navEls: [],

  init() {
    this.root = document.getElementById("screen-root");
    this.connBadge = document.getElementById("conn-badge");
    // Delegación de eventos: así funciona también con botones [data-nav]
    // que se crean después dinámicamente (p.ej. los del dashboard).
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-nav]");
      if (btn) this.go(btn.dataset.nav);
    });
  },

  setActiveNav(screen) {
    document.querySelectorAll("[data-nav]").forEach(b => b.classList.toggle("active", b.dataset.nav === screen));
  },

  go(screen, params = {}) {
    this.setActiveNav(screen);
    Screens[screen] ? Screens[screen](params) : console.warn("Pantalla no encontrada:", screen);
  },

  setConnection(state) {
    if (!this.connBadge) return;
    const map = {
      connected: ["🟢 Conectado", "conn-ok"],
      syncing: ["🟡 Sincronizando", "conn-warn"],
      offline: ["🔴 Sin conexión", "conn-bad"]
    };
    const [text, cls] = map[state] || map.offline;
    this.connBadge.textContent = text;
    this.connBadge.className = "conn-badge " + cls;
  },

  toast(message, type = "info", ms = 3200) {
    const holder = document.getElementById("toast-holder");
    const t = document.createElement("div");
    t.className = `toast toast-${type}`;
    t.textContent = message;
    holder.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 250); }, ms);
  },

  rankBadgeHTML(rank, size = "md") {
    return `<div class="rank-badge rank-${size}" data-rarity="${rank.rarity}" style="--rank-color:${rank.color}">
      ${rank.badgeSVG}
    </div>`;
  },

  expBar(pct, label) {
    return `<div class="exp-bar"><div class="exp-fill" style="width:${Math.round(pct * 100)}%"></div></div>
      ${label ? `<div class="exp-label">${label}</div>` : ""}`;
  }
};

const Screens = {

  dashboard() {
    const p = Player.current;
    const rp = rankProgress(p.exp);
    const lvlNeed = Player.levelExpNeeded(p.level);
    UI.root.innerHTML = `
    <section class="dash">
      <div class="dash-top card glass">
        <div class="dash-identity">
          <div class="avatar">${p.avatar}</div>
          <div>
            <div class="username">${escapeHTML(p.username)} ${p.title ? `<span class="title-tag">${escapeHTML(p.title)}</span>` : ""}</div>
            <div class="pid">${p.playerId}</div>
          </div>
          ${UI.rankBadgeHTML(getRankById(p.rankId), "sm")}
        </div>
        <div class="dash-progress">
          <div class="progress-row">
            <span>Nivel ${p.level}</span>
            <span>${p.levelExp} / ${lvlNeed} EXP</span>
          </div>
          ${UI.expBar(p.levelExp / lvlNeed)}
          <div class="progress-row">
            <span>${getRankById(p.rankId).name}</span>
            <span>${rp.next ? `${p.exp} / ${rp.next.requiredExp}` : "RANGO MÁXIMO"}</span>
          </div>
          ${UI.expBar(rp.pct)}
        </div>
      </div>

      <div class="stat-grid">
        ${statCard("🏆", "Victorias", p.stats.wins)}
        ${statCard("⚔️", "Partidas", p.stats.gamesPlayed)}
        ${statCard("🔥", "Racha", p.stats.currentStreak)}
        ${statCard("⭐", "EXP total", p.exp)}
        ${statCard("🎯", "Mejor puntaje", p.stats.bestScore)}
        ${statCard("🥇", "Mejor racha", p.stats.bestStreak)}
      </div>

      <div class="big-actions">
        <button class="btn-primary big" id="btn-play-now">⚡ JUGAR AHORA</button>
        <div class="big-secondary">
          <button class="btn-secondary" data-nav="rooms-create">🏠 CREAR SALA</button>
          <button class="btn-secondary" data-nav="rooms-list">👥 SALAS</button>
          <button class="btn-secondary" data-nav="profile">👤 PERFIL</button>
          <button class="btn-secondary" data-nav="ranking">🏆 RANKING</button>
        </div>
      </div>

      <div class="card glass">
        <h3>🔥 Actividad reciente</h3>
        <div id="activity-feed" class="activity-feed"><span class="muted">Cargando…</span></div>
      </div>

      <div class="card glass">
        <h3>🎮 Minijuegos</h3>
        <div class="games-mini-grid">
          ${MINI_GAMES.map(g => `<div class="mini-chip" data-practice="${g.id}"><span>${g.icon}</span>${g.name}</div>`).join("")}
        </div>
      </div>
    </section>`;

    document.getElementById("btn-play-now").addEventListener("click", () => UI.go("matchmaking"));
    UI.root.querySelectorAll("[data-practice]").forEach(elm =>
      elm.addEventListener("click", () => App.startPractice(elm.dataset.practice)));

    loadActivityFeed();
  },

  matchmaking() {
    UI.root.innerHTML = `
    <section class="mm-screen card glass">
      <div class="mm-radar"><div class="radar-ring"></div><div class="radar-ring r2"></div><div class="radar-dot">🔎</div></div>
      <h2>Buscando oponente…</h2>
      <div class="mm-rank">${UI.rankBadgeHTML(getRankById(Player.current.rankId), "sm")} <span>${getRankById(Player.current.rankId).name}</span></div>
      <p class="muted" id="mm-status">Buscando jugadores con habilidad similar.</p>
      <button class="btn-secondary" id="mm-cancel">CANCELAR</button>
    </section>`;
    document.getElementById("mm-cancel").addEventListener("click", async () => {
      await Matchmaking.cancel();
      UI.go("dashboard");
    });
    App.startMatchmaking();
  },

  "rooms-create"() {
    UI.root.innerHTML = `
    <section class="card glass form-card">
      <h2>Crear partida</h2>
      <label>Nombre de la sala</label>
      <input id="room-name" maxlength="24" placeholder="Mi sala"/>
      <label>Tipo</label>
      <div class="pill-select" id="room-type">
        <button class="pill active" data-val="public">🌎 Pública</button>
        <button class="pill" data-val="private">🔒 Privada</button>
      </div>
      <label>Jugadores</label>
      <div class="pill-select" id="room-max">
        ${[2,3,4,6,8].map((n,i) => `<button class="pill ${i===0?"active":""}" data-val="${n}">${n}</button>`).join("")}
      </div>
      <label>Rondas</label>
      <div class="pill-select" id="room-rounds">
        ${[3,5,7].map((n,i) => `<button class="pill ${i===1?"active":""}" data-val="${n}">${n}</button>`).join("")}
      </div>
      <label>Selección de minijuegos</label>
      <div class="pill-select" id="room-mode">
        <button class="pill active" data-val="all">🎲 Todos</button>
        <button class="pill" data-val="selected">🎯 Seleccionados</button>
        <button class="pill" data-val="rotation">🎮 Rotación</button>
      </div>
      <div class="game-checklist">
        ${MINI_GAMES.map(g => `<label class="check-chip"><input type="checkbox" value="${g.id}" checked/> ${g.icon} ${g.name}</label>`).join("")}
      </div>
      <button class="btn-primary" id="room-create-btn">CREAR SALA</button>
    </section>`;

    bindPillSelect("room-type"); bindPillSelect("room-max"); bindPillSelect("room-rounds"); bindPillSelect("room-mode");

    document.getElementById("room-create-btn").addEventListener("click", async () => {
      const type = UI.root.querySelector("#room-type .active").dataset.val;
      const maxPlayers = parseInt(UI.root.querySelector("#room-max .active").dataset.val, 10);
      const rounds = parseInt(UI.root.querySelector("#room-rounds .active").dataset.val, 10);
      const selectionMode = UI.root.querySelector("#room-mode .active").dataset.val;
      const selectedGames = Array.from(UI.root.querySelectorAll(".game-checklist input:checked")).map(i => i.value);
      if (!selectedGames.length) { UI.toast("Selecciona al menos un minijuego.", "warn"); return; }
      try {
        const room = await Rooms.create({
          name: document.getElementById("room-name").value,
          type, maxPlayers, selectionMode, selectedGames, rounds
        });
        UI.go("room-wait", { roomId: room.roomId });
      } catch (e) { UI.toast("No se pudo crear la sala: " + e.message, "error"); }
    });
  },

  "rooms-list"() {
    UI.root.innerHTML = `
    <section class="card glass">
      <h2>🌎 Salas públicas</h2>
      <div class="join-row">
        <input id="join-code" placeholder="Código de sala (privada)" maxlength="6"/>
        <button class="btn-secondary" id="join-btn">UNIRME</button>
      </div>
      <div id="public-rooms-list" class="room-list"><span class="muted">Buscando salas…</span></div>
    </section>`;

    document.getElementById("join-btn").addEventListener("click", async () => {
      const code = document.getElementById("join-code").value.trim().toUpperCase();
      if (!code) return;
      try { await Rooms.join(code); UI.go("room-wait", { roomId: code }); }
      catch (e) { UI.toast(e.message, "error"); }
    });

    if (App._stopPublicList) App._stopPublicList();
    App._stopPublicList = Rooms.watchPublicList((rooms) => {
      const box = document.getElementById("public-rooms-list");
      if (!box) return;
      if (!rooms.length) { box.innerHTML = `<span class="muted">No hay salas públicas activas. ¡Crea una!</span>`; return; }
      box.innerHTML = rooms.map(r => `
        <div class="room-card">
          <div>
            <div class="room-name">${escapeHTML(r.name)}</div>
            <div class="muted">👥 ${Object.keys(r.players||{}).length} / ${r.maxPlayers} · 🎮 ${(r.selectedGames||[]).length} juegos</div>
          </div>
          <button class="btn-secondary" data-join="${r.roomId}">UNIRSE</button>
        </div>`).join("");
      box.querySelectorAll("[data-join]").forEach(b => b.addEventListener("click", async () => {
        try { await Rooms.join(b.dataset.join); UI.go("room-wait", { roomId: b.dataset.join }); }
        catch (e) { UI.toast(e.message, "error"); }
      }));
    });
  },

  "room-wait"({ roomId }) {
    UI.root.innerHTML = `
    <section class="card glass room-wait">
      <div class="room-header">
        <h2 id="room-title">Sala</h2>
        <div id="room-code-box"></div>
      </div>
      <div id="room-players" class="room-players-list"></div>
      <div id="room-games-panel" class="room-games-panel"></div>
      <div class="room-actions">
        <button class="btn-secondary" id="room-ready-btn">✓ LISTO</button>
        <button class="btn-primary" id="room-start-btn" style="display:none">▶ COMENZAR</button>
        <button class="btn-danger" id="room-leave-btn">SALIR</button>
      </div>
      <div class="room-chat">
        <div id="room-chat-log" class="chat-log"></div>
        <div class="chat-input-row">
          <input id="room-chat-input" maxlength="80" placeholder="Escribe algo… (GG, Buena, JAJA)"/>
          <button id="room-chat-send">➤</button>
        </div>
      </div>
    </section>`;

    App.enterRoomWait(roomId);

    document.getElementById("room-ready-btn").addEventListener("click", () => App.toggleReady(roomId));
    document.getElementById("room-leave-btn").addEventListener("click", () => App.leaveRoom(roomId));
    document.getElementById("room-chat-send").addEventListener("click", () => App.sendRoomChat(roomId));
    document.getElementById("room-chat-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") App.sendRoomChat(roomId);
    });
  },

  match({ gameId, roomType }) {
    UI.root.innerHTML = `
    <section class="match-screen">
      <div class="match-header">
        <div class="mh-player" id="mh-me"></div>
        <div class="mh-vs">VS</div>
        <div class="mh-player" id="mh-opp"></div>
      </div>
      <div class="match-meta">
        <span id="match-round">Ronda 1</span>
        <span id="match-game"></span>
      </div>
      <div id="game-container" class="game-container">
        <div class="countdown-overlay" id="countdown">3</div>
      </div>
    </section>`;
    App.runMatch(gameId, roomType);
  },

  "match-result"({ result, game }) {
    const outcomeLabel = { win: "🏆 VICTORIA", loss: "💥 DERROTA", draw: "🤝 EMPATE" }[result.outcome];
    UI.root.innerHTML = `
    <section class="card glass result-screen result-${result.outcome}">
      <div class="result-title">${outcomeLabel}</div>
      <div class="result-score">${result.myScore} pts</div>
      <div class="result-exp">+${result.applied.expGain} EXP</div>
      ${result.applied.rankUp ? `
        <div class="rankup-box">
          ✨ ¡NUEVO RANGO! ✨
          ${UI.rankBadgeHTML(result.applied.rankUp.to, "lg")}
          <div>${result.applied.rankUp.from.name} → <b>${result.applied.rankUp.to.name}</b></div>
        </div>` : ""}
      <div class="result-actions">
        <button class="btn-primary" id="result-rematch">⚔️ REVANCHA</button>
        <button class="btn-secondary" data-nav="dashboard">🏠 VOLVER AL MENÚ</button>
      </div>
    </section>`;
    document.getElementById("result-rematch").addEventListener("click", () => {
      UI.toast("Pide la revancha desde el perfil de tu rival o crea una sala privada.", "info");
      UI.go("dashboard");
    });
  },

  profile() {
    const p = Player.current;
    UI.root.innerHTML = `
    <section class="card glass">
      <div class="profile-head">
        ${UI.rankBadgeHTML(getRankById(p.rankId), "lg")}
        <h2>${escapeHTML(p.username)}</h2>
        <div class="muted">${p.playerId} · Nivel ${p.level}</div>
      </div>
      <h3>📊 Estadísticas generales</h3>
      <div class="stat-grid">
        ${statCard("⚔️", "Partidas", p.stats.gamesPlayed)}
        ${statCard("🏆", "Victorias", p.stats.wins)}
        ${statCard("💥", "Derrotas", p.stats.losses)}
        ${statCard("🤝", "Empates", p.stats.draws)}
        ${statCard("🔥", "Racha actual", p.stats.currentStreak)}
        ${statCard("🥇", "Mejor racha", p.stats.bestStreak)}
        ${statCard("⭐", "EXP total", p.exp)}
        ${statCard("🎯", "Mejor puntaje", p.stats.bestScore)}
        ${statCard("✨", "Victorias perfectas", p.stats.perfectWins)}
      </div>
      <h3>🎮 Por minijuego</h3>
      <div class="stat-grid">
        ${Object.entries(p.stats.byGame).map(([id, g]) => statCard(getGameMeta(id)?.icon || "🎮", getGameMeta(id)?.name || id, `${g.wins}/${g.played}`)).join("")}
      </div>
    </section>`;
  },

  ranking() {
    UI.root.innerHTML = `
    <section class="card glass">
      <h2>🏆 Ranking global</h2>
      <div id="ranking-list"><span class="muted">Cargando…</span></div>
    </section>`;
    loadRanking();
  }
};

function statCard(icon, label, value) {
  return `<div class="stat-card"><div class="stat-icon">${icon}</div><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
}

function bindPillSelect(id) {
  const wrap = document.getElementById(id);
  wrap.querySelectorAll(".pill").forEach(btn => btn.addEventListener("click", () => {
    wrap.querySelectorAll(".pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  }));
}

function escapeHTML(str) {
  return String(str || "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

async function loadActivityFeed() {
  try {
    const data = await FB.get("activity");
    const box = document.getElementById("activity-feed");
    if (!box) return;
    const items = Object.values(data || {}).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 8);
    box.innerHTML = items.length ? items.map(i => `<div class="activity-item">${escapeHTML(i.text)}</div>`).join("")
      : `<span class="muted">Aún no hay actividad. ¡Sé el primero en jugar!</span>`;
  } catch { /* silencioso: la pantalla sigue usable sin el feed */ }
}

async function loadRanking() {
  try {
    const all = await FB.get("players");
    const list = Object.values(all || {}).sort((a, b) => (b.exp || 0) - (a.exp || 0)).slice(0, 50);
    const box = document.getElementById("ranking-list");
    if (!box) return;
    box.innerHTML = list.map((p, i) => `
      <div class="rank-row ${p.playerId === Player.current.playerId ? "me" : ""}">
        <span class="rank-pos">${["🥇","🥈","🥉"][i] || (i+1)}</span>
        ${UI.rankBadgeHTML(getRankById(p.rankId), "xs")}
        <span class="rank-name">${escapeHTML(p.username)}</span>
        <span class="muted">Nv.${p.level}</span>
        <span class="rank-exp">${p.exp} EXP</span>
      </div>`).join("");
  } catch (e) {
    const box = document.getElementById("ranking-list");
    if (box) box.innerHTML = `<span class="muted">No se pudo cargar el ranking.</span>`;
  }
}
