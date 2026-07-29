/**
 * app.js — arranque de NYXORA y orquestación de flujos.
 */

const App = {
  _stopPublicList: null,
  _roomListenStop: null,
  _matchSession: null,

  async boot() {
    UI.init();
    UI.setConnection("syncing");
    this.watchConnectivity();

    const existingId = Player.getLocalId();
    if (existingId) {
      try {
        await Player.loadOrCreate();
        this.afterLogin();
        return;
      } catch (e) {
        console.warn(e);
      }
    }
    this.showOnboarding();
  },

  watchConnectivity() {
    window.addEventListener("online", () => UI.setConnection("connected"));
    window.addEventListener("offline", () => UI.setConnection("offline"));
    // sondeo ligero para confirmar que Firebase responde
    const check = async () => {
      try { await FB.get("config/ping"); UI.setConnection(navigator.onLine ? "connected" : "offline"); }
      catch { UI.setConnection("offline"); }
      setTimeout(check, 20000);
    };
    check();
  },

  showOnboarding() {
    UI.root.innerHTML = `
    <section class="onboarding card glass">
      <div class="logo-big">NYXORA</div>
      <div class="tagline">${APP_CONFIG.tagline}</div>
      <label>Elige tu nombre de jugador</label>
      <input id="ob-username" maxlength="16" placeholder="Tu nombre en el hub"/>
      <button class="btn-primary" id="ob-start">ENTRAR AL HUB</button>
      <p class="muted small">Se generará un ID de jugador único en este dispositivo. No pedimos contraseña ni datos personales.</p>
    </section>`;
    document.getElementById("ob-start").addEventListener("click", async () => {
      const name = document.getElementById("ob-username").value;
      if (!name.trim()) { UI.toast("Escribe un nombre para continuar.", "warn"); return; }
      try {
        await Player.loadOrCreate(name);
        this.afterLogin();
      } catch (e) {
        UI.toast("No se pudo conectar con Firebase. Revisa FIREBASE_DATABASE_URL en config.js.", "error", 5000);
        console.error(e);
      }
    });
  },

  afterLogin() {
    document.getElementById("app-shell").classList.add("logged-in");
    Player.startHeartbeat();
    UI.go("dashboard");
  },

  // ── Matchmaking ──────────────────────────────────────────
  async startMatchmaking() {
    await Matchmaking.enqueue({
      onTick: ({ status }) => {
        const el = document.getElementById("mm-status");
        if (!el) return;
        el.textContent = status === "timeout"
          ? "No se encontró rival, inténtalo de nuevo."
          : "Buscando jugadores con habilidad similar…";
      },
      onFound: ({ gameId }) => {
        UI.toast("✨ ¡Oponente encontrado!", "success");
        UI.go("match", { gameId, roomType: "matchmaking" });
      }
    });
  },

  async startPractice(gameId) {
    UI.root.innerHTML = `
    <section class="match-screen">
      <div class="match-meta"><span>Práctica</span><span>${getGameMeta(gameId).name}</span></div>
      <div id="game-container" class="game-container"></div>
      <button class="btn-secondary" id="practice-exit" style="margin-top:16px">VOLVER</button>
    </section>`;
    document.getElementById("practice-exit").addEventListener("click", () => UI.go("dashboard"));
    const container = document.getElementById("game-container");
    runMiniGame(gameId, container, {
      onRoundResult: async (result) => {
        UI.toast(result.correct ? `+${result.points} pts` : "Sin puntos esta vez", result.correct ? "success" : "warn");
        await Player.applyMatchResult({ outcome: "win", gameType: gameId, score: result.points, gameStatsPatch: {} }, false);
        setTimeout(() => UI.go("dashboard"), 1400);
      }
    });
  },

  // ── Salas ────────────────────────────────────────────────
  enterRoomWait(roomId) {
    if (this._roomListenStop) this._roomListenStop();
    Rooms.watch(roomId, (room) => this.renderRoom(roomId, room));
    Rooms.watchChat(roomId, (msgs) => this.renderChat(msgs));
  },

  renderRoom(roomId, room) {
    if (!room) { UI.toast("La sala se cerró.", "warn"); UI.go("dashboard"); return; }
    const titleEl = document.getElementById("room-title");
    if (!titleEl) return; // el usuario navegó a otra pantalla
    titleEl.textContent = `${room.type === "private" ? "🔒" : "🌎"} ${room.name}`;
    document.getElementById("room-code-box").innerHTML = room.type === "private"
      ? `<span class="room-code">Código: <b>${roomId}</b></span> <button class="btn-tiny" id="copy-code">COPIAR</button>`
      : `<span class="muted">👥 ${Object.keys(room.players||{}).length} / ${room.maxPlayers}</span>`;

    const copyBtn = document.getElementById("copy-code");
    if (copyBtn) copyBtn.addEventListener("click", () => {
      navigator.clipboard?.writeText(roomId);
      UI.toast("Código copiado.", "info");
    });

    const players = room.players || {};
    document.getElementById("room-players").innerHTML = Object.entries(players).map(([id, pl]) => `
      <div class="room-player-row">
        ${UI.rankBadgeHTML(getRankById(pl.rankId || 1), "xs")}
        <span>${escapeHTML(pl.username)}${id === room.ownerId ? " 👑" : ""}</span>
        <span class="${pl.ready ? "ready-on" : "ready-off"}">${pl.ready ? "🟢 LISTO" : "⚪ NO LISTO"}</span>
      </div>`).join("");

    document.getElementById("room-games-panel").innerHTML = `
      <div class="muted">🎮 ${room.selectionMode === "all" ? "Cualquiera de los juegos" : `${(room.selectedGames||[]).length} juegos seleccionados`} · ${room.rounds} rondas</div>`;

    const isOwner = room.ownerId === Player.current.playerId;
    const startBtn = document.getElementById("room-start-btn");
    const allReady = Object.values(players).length > 1 && Object.values(players).every(p => p.ready);
    startBtn.style.display = isOwner ? "inline-block" : "none";
    startBtn.disabled = !allReady;
    startBtn.onclick = () => Rooms.startMatch(roomId);

    if (room.status === "starting") {
      this.launchRoomMatch(roomId, room);
    }
  },

  renderChat(msgs) {
    const log = document.getElementById("room-chat-log");
    if (!log) return;
    log.innerHTML = msgs.map(m => `<div class="chat-msg"><b>${escapeHTML(m.username)}:</b> ${escapeHTML(m.text)}</div>`).join("");
    log.scrollTop = log.scrollHeight;
  },

  sendRoomChat(roomId) {
    const input = document.getElementById("room-chat-input");
    if (!input.value.trim()) return;
    Rooms.sendChat(roomId, input.value);
    input.value = "";
  },

  toggleReady(roomId) {
    FB.get(`rooms/${roomId}/players/${Player.current.playerId}/ready`).then(cur => {
      Rooms.setReady(roomId, !cur);
    });
  },

  async leaveRoom(roomId) {
    Rooms.stopWatching();
    await Rooms.leave(roomId);
    UI.go("dashboard");
  },

  async launchRoomMatch(roomId, room) {
    if (this._launchingRoom === roomId) return;
    this._launchingRoom = roomId;
    const owner = room.ownerId === Player.current.playerId;
    if (owner) {
      const gameId = "G-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const gameType = Rooms.pickNextGame(room);
      const playersDoc = {};
      Object.entries(room.players).forEach(([id, pl]) => {
        playersDoc[id] = { username: pl.username, rankId: pl.rankId, score: 0, roundsWon: 0 };
      });
      await FB.put(`games/${gameId}`, {
        gameId, roomType: room.type, roomId,
        players: playersDoc, rounds: room.rounds, currentRound: 0,
        gameType, status: "starting", createdAt: FB.serverTimestamp()
      });
      await FB.patch(`rooms/${roomId}`, { activeGameId: gameId });
    }
    // todos (incluido el owner) esperan a que aparezca activeGameId y saltan a la partida
    const stop = FB.listen(`rooms/${roomId}/activeGameId`, (gameId) => {
      if (gameId) { stop(); Rooms.stopWatching(); UI.go("match", { gameId, roomType: room.type }); }
    });
  },

  // ── Partida ──────────────────────────────────────────────
  async runMatch(gameId, roomType) {
    const session = new MatchSession(gameId, roomType);
    this._matchSession = session;
    try {
      const game = await session.load();
      const ids = Object.keys(game.players);
      const oppId = ids.find(id => id !== Player.current.playerId);
      document.getElementById("mh-me").textContent = `👤 ${game.players[Player.current.playerId].username}`;
      document.getElementById("mh-opp").textContent = oppId ? `👤 ${game.players[oppId].username}` : "👤 Rival";
    } catch (e) {
      UI.toast(e.message, "error");
      UI.go("dashboard");
      return;
    }

    session.watch({
      getContainer: () => document.getElementById("game-container"),
      onCountdown: () => runCountdown(),
      onRoundStart: (round, gameType) => {
        const r = document.getElementById("match-round");
        const g = document.getElementById("match-game");
        if (r) r.textContent = `Ronda ${round} / ${session.game.rounds}`;
        if (g) g.textContent = `${getGameMeta(gameType).icon} ${getGameMeta(gameType).name}`;
      },
      onLocalRoundDone: () => {
        const c = document.getElementById("game-container");
        if (c) c.insertAdjacentHTML("beforeend", `<div class="waiting-opponent">Esperando al rival…</div>`);
      },
      onFinished: async (game) => {
        session.stop();
        const result = await finalizeMatch(game, roomType);
        UI.go("match-result", { result, game });
      }
    });
  }
};

function runCountdown() {
  const overlay = document.getElementById("countdown");
  if (!overlay) return;
  const seq = ["3", "2", "1", "🔥 ¡YA!"];
  let i = 0;
  overlay.style.display = "flex";
  const step = () => {
    overlay.textContent = seq[i];
    overlay.classList.remove("pulse"); void overlay.offsetWidth; overlay.classList.add("pulse");
    i++;
    if (i < seq.length) setTimeout(step, 650);
    else setTimeout(() => { overlay.style.display = "none"; }, 500);
  };
  step();
}

document.addEventListener("DOMContentLoaded", () => App.boot());
