/**
 * player.js
 * ─────────────────────────────────────────────────────────
 * Identidad y progresión del jugador. El playerId se genera
 * localmente y se guarda en localStorage; el perfil completo
 * vive en Firebase bajo players/PLAYER_ID.
 *
 * NOTA DE SEGURIDAD: cualquier persona con el playerId técnicamente
 * podría intentar escribir en ese nodo si conoce la URL. Las reglas
 * de Firebase (firebase-rules.json) validan tipos y rangos razonables
 * (p.ej. level y exp no pueden decrecer, wins no puede saltar en +1
 * de golpe a un número absurdo) pero esto NO sustituye una auth real.
 * Para producción: Firebase Auth (anónima como mínimo) + Cloud
 * Functions que sean las únicas que escriban wins/exp/rank.
 */

function generatePlayerId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `PX-${code}`;
}

function sanitizeUsername(name) {
  const trimmed = (name || "").trim().slice(0, 16);
  // quita HTML/scripts y caracteres peligrosos, deja letras/números/espacios/acentos básicos
  return trimmed.replace(/[<>{}$/\\"'`]/g, "").replace(/\s+/g, " ");
}

function emptyStats() {
  return {
    gamesPlayed: 0, wins: 0, losses: 0, draws: 0,
    currentStreak: 0, bestStreak: 0,
    totalScore: 0, perfectWins: 0, abandonedGames: 0,
    gamesToday: 0, winsToday: 0, winsWeek: 0, winsMonth: 0,
    bestScore: 0, biggestMargin: 0,
    friendGames: 0, publicGames: 0, privateGames: 0,
    byGame: {
      reaction:  { best: null, avg: null, wins: 0, played: 0 },
      traffic:   { best: null, wins: 0, played: 0, penalties: 0 },
      memory:    { best: 0, avg: 0, wins: 0, played: 0 },
      math:      { correct: 0, incorrect: 0, accuracy: 0, bestStreak: 0, played: 0 },
      target:    { accuracy: 0, hits: 0, misses: 0, avgTime: 0, played: 0 },
      colors:    { best: null, errors: 0, accuracy: 0, played: 0 }
    }
  };
}

const Player = {
  current: null, // objeto de perfil en memoria (espejo del de Firebase)
  _saveQueue: null,

  getLocalId() {
    let id = Storage.get(STORAGE_KEYS.playerId);
    return id;
  },

  async loadOrCreate(username) {
    let id = this.getLocalId();
    if (id) {
      try {
        const existing = await FB.get(`players/${id}`);
        if (existing) {
          this.current = existing;
          this.touchOnline(true);
          return this.current;
        }
      } catch (e) {
        console.warn("No se pudo cargar el perfil existente, se creará uno nuevo si hace falta.", e);
      }
    }
    // crear nuevo
    id = id || generatePlayerId();
    const profile = {
      playerId: id,
      username: sanitizeUsername(username) || `Jugador${id.slice(3)}`,
      level: 1,
      levelExp: 0,
      exp: 0,
      rankId: 1,
      title: null,
      avatar: "🎮",
      createdAt: FB.serverTimestamp(),
      lastSeen: FB.serverTimestamp(),
      online: true,
      settings: { soundOn: true, showStats: true, allowChallenges: true, allowInvites: true },
      stats: emptyStats()
    };
    await FB.put(`players/${id}`, profile);
    Storage.set(STORAGE_KEYS.playerId, id);
    this.current = profile;
    return profile;
  },

  async save(partial) {
    if (!this.current) return;
    Object.assign(this.current, partial);
    await FB.patch(`players/${this.current.playerId}`, partial);
  },

  async touchOnline(online) {
    if (!this.current) return;
    await FB.patch(`players/${this.current.playerId}`, {
      online, lastSeen: FB.serverTimestamp()
    });
  },

  startHeartbeat() {
    setInterval(() => this.touchOnline(true), APP_CONFIG.realtime.heartbeatMs);
    window.addEventListener("beforeunload", () => {
      // best-effort; los navegadores limitan esto, por eso también existe offlineAfterMs
      navigator.sendBeacon &&
        navigator.sendBeacon(FB.url(`players/${this.current.playerId}/online`), JSON.stringify(false));
    });
  },

  levelExpNeeded(level) {
    return Math.round(APP_CONFIG.level.baseExp * Math.pow(APP_CONFIG.level.growth, level - 1));
  },

  /**
   * Aplica el resultado de una partida: EXP, stats, nivel y rango.
   * result: { outcome: 'win'|'loss'|'draw', gameType, score, perfect, gameStats }
   */
  async applyMatchResult(result, competitive = true) {
    const p = this.current;
    const s = p.stats;
    s.gamesPlayed++;
    s.publicGames += result.roomType === "public" ? 1 : 0;
    s.privateGames += result.roomType === "private" ? 1 : 0;

    let expGain = 0;
    if (result.outcome === "win") {
      s.wins++; s.currentStreak++; s.bestStreak = Math.max(s.bestStreak, s.currentStreak);
      expGain = result.perfect ? APP_CONFIG.exp.perfectWin : APP_CONFIG.exp.win;
      if (result.perfect) s.perfectWins++;
      expGain += Math.min(APP_CONFIG.exp.streakBonusCap, s.currentStreak * APP_CONFIG.exp.streakBonusPerWin);
    } else if (result.outcome === "loss") {
      s.losses++; s.currentStreak = 0;
      expGain = APP_CONFIG.exp.loss;
    } else {
      s.draws++;
      expGain = Math.round((APP_CONFIG.exp.win + APP_CONFIG.exp.loss) / 2);
    }

    if (!competitive) expGain = APP_CONFIG.exp.practiceExp;

    s.totalScore += result.score || 0;
    s.bestScore = Math.max(s.bestScore, result.score || 0);

    if (result.gameType && s.byGame[result.gameType]) {
      const g = s.byGame[result.gameType];
      g.played++;
      if (result.outcome === "win") g.wins++;
      Object.assign(g, result.gameStatsPatch || {});
    }

    // Nivel
    let newLevel = p.level, newLevelExp = p.levelExp + expGain;
    while (newLevelExp >= this.levelExpNeeded(newLevel)) {
      newLevelExp -= this.levelExpNeeded(newLevel);
      newLevel++;
    }

    // Rango (solo compite)
    let newTotalExp = p.exp;
    let rankUp = null;
    if (competitive) {
      newTotalExp = p.exp + expGain;
      const before = getRankByExp(p.exp);
      const after = getRankByExp(newTotalExp);
      if (after.id !== before.id) rankUp = { from: before, to: after };
    }

    const patch = {
      level: newLevel,
      levelExp: newLevelExp,
      exp: newTotalExp,
      stats: s
    };
    if (rankUp) patch.rankId = rankUp.to.id;

    await this.save(patch);
    return { expGain, rankUp, newLevel };
  }
};
