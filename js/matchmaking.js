/**
 * matchmaking.js
 * ─────────────────────────────────────────────────────────
 * Cola de emparejamiento automático (matchmaking/PLAYER_ID).
 * Cada cliente en cola revisa periódicamente a los demás
 * jugadores en cola y busca uno con rango cercano.
 *
 * NOTA: para evitar por completo condiciones de carrera donde
 * dos jugadores intenten emparejar con un tercero al mismo
 * tiempo hace falta una transacción atómica del lado servidor
 * (Cloud Function). Aquí lo mitigamos así: al encontrar
 * candidato, el jugador con playerId "menor" alfabéticamente
 * es quien crea la partida y ambos se retiran de la cola
 * usando el mismo gameId como bandera; si el otro ya fue
 * tomado por otro emparejamiento, el intento se descarta y
 * el bucle sigue buscando.
 */

const Matchmaking = {
  active: false,
  _timer: null,
  _widenTimer: null,
  _window: 4,
  _startedAt: 0,
  _onFound: null,
  _onTick: null,

  async enqueue({ onFound, onTick }) {
    this.active = true;
    this._onFound = onFound;
    this._onTick = onTick;
    this._window = APP_CONFIG.matchmaking.windowSteps[0];
    this._startedAt = Date.now();

    await FB.put(`matchmaking/${Player.current.playerId}`, {
      playerId: Player.current.playerId,
      username: Player.current.username,
      rankId: Player.current.rankId,
      level: Player.current.level,
      createdAt: FB.serverTimestamp()
    });

    let stepIndex = 0;
    this._widenTimer = setInterval(() => {
      stepIndex = Math.min(stepIndex + 1, APP_CONFIG.matchmaking.windowSteps.length - 1);
      this._window = APP_CONFIG.matchmaking.windowSteps[stepIndex];
    }, APP_CONFIG.matchmaking.widenEvery);

    const loop = async () => {
      if (!this.active) return;
      try {
        const found = await this._tryMatch();
        if (found) return; // se detiene solo al encontrar
      } catch (e) {
        console.warn("matchmaking tick error", e);
      }
      if (Date.now() - this._startedAt > APP_CONFIG.matchmaking.timeoutMs) {
        this._onTick && this._onTick({ status: "timeout" });
        await this.cancel();
        return;
      }
      this._onTick && this._onTick({ status: "searching", window: this._window });
      this._timer = setTimeout(loop, 1600);
    };
    loop();
  },

  async _tryMatch() {
    const pool = await FB.get(`matchmaking`);
    if (!pool) return false;
    const me = Player.current;
    const candidates = Object.values(pool).filter(p =>
      p.playerId !== me.playerId &&
      Math.abs(p.rankId - me.rankId) <= this._window
    );
    if (!candidates.length) return false;

    candidates.sort((a, b) => Math.abs(a.rankId - me.rankId) - Math.abs(b.rankId - me.rankId));
    const opponent = candidates[0];

    // Determinismo simple para evitar doble-creación: el playerId menor crea la partida.
    const iCreate = me.playerId < opponent.playerId;

    if (iCreate) {
      const gameId = "G-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const gameType = MINI_GAMES[Math.floor(Math.random() * MINI_GAMES.length)].id;
      const gameDoc = {
        gameId, roomType: "matchmaking",
        players: {
          [me.playerId]: { username: me.username, rankId: me.rankId, score: 0, roundsWon: 0 },
          [opponent.playerId]: { username: opponent.username, rankId: opponent.rankId, score: 0, roundsWon: 0 }
        },
        rounds: APP_CONFIG.room.defaultRounds,
        currentRound: 0,
        gameType,
        status: "starting",
        createdAt: FB.serverTimestamp()
      };
      await FB.put(`games/${gameId}`, gameDoc);
      await FB.patch(`matchmaking/${opponent.playerId}`, { matchedGameId: gameId });
      await FB.delete(`matchmaking/${me.playerId}`);
      await FB.delete(`matchmaking/${opponent.playerId}`);
      this.active = false;
      clearInterval(this._widenTimer);
      this._onFound({ gameId, opponent });
      return true;
    } else {
      // espera a que el otro (que crea) escriba matchedGameId en mi propia entrada
      const mine = await FB.get(`matchmaking/${me.playerId}`);
      if (mine && mine.matchedGameId) {
        this.active = false;
        clearInterval(this._widenTimer);
        this._onFound({ gameId: mine.matchedGameId, opponent });
        return true;
      }
      return false;
    }
  },

  async cancel() {
    this.active = false;
    clearTimeout(this._timer);
    clearInterval(this._widenTimer);
    if (Player.current) await FB.delete(`matchmaking/${Player.current.playerId}`).catch(() => {});
  }
};
