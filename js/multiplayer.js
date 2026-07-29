/**
 * multiplayer.js
 * ─────────────────────────────────────────────────────────
 * Controla una partida ya creada (games/GAME_ID): countdown,
 * ejecución del minijuego local, sincronización de resultados
 * de ronda vía Firebase y avance de rondas.
 *
 * AUTORIDAD DE RONDA: para no tener dos clientes escribiendo el
 * mismo avance a la vez, el jugador cuyo playerId es
 * alfabéticamente menor actúa como "host" de la partida: es el
 * único que, al detectar que todos los jugadores enviaron su
 * puntuación de la ronda, calcula el ganador de la ronda y
 * escribe el avance a la siguiente. Esto es suficiente para un
 * prototipo; en producción esa autoridad debería vivir en un
 * backend, no en uno de los dos clientes.
 */

class MatchSession {
  constructor(gameId, roomType = "matchmaking") {
    this.gameId = gameId;
    this.roomType = roomType;
    this.me = Player.current.playerId;
    this.stopListen = null;
    this.lastRoundIndex = -1;
    this.game = null;
    this.isHost = false;
    this.roundCleanup = null;
    this.finished = false;
    this.callbacks = {};
  }

  async load() {
    this.game = await FB.get(`games/${this.gameId}`);
    if (!this.game) throw new Error("La partida no existe o ya terminó.");
    const ids = Object.keys(this.game.players || {});
    this.isHost = ids.slice().sort()[0] === this.me;
    return this.game;
  }

  watch(callbacks) {
    this.callbacks = callbacks;
    this.stopListen = FB.listen(`games/${this.gameId}`, (data) => {
      if (!data) return;
      this.game = data;
      this._onStateChange();
    });
  }

  stop() {
    if (this.stopListen) this.stopListen();
    if (this.roundCleanup) this.roundCleanup();
  }

  _onStateChange() {
    const g = this.game;
    if (!g) return;

    if (g.status === "starting" && this.lastRoundIndex === -1) {
      this.lastRoundIndex = -0.5;
      this.callbacks.onCountdown && this.callbacks.onCountdown();
      setTimeout(async () => {
        if (this.isHost) await FB.patch(`games/${this.gameId}`, { status: "playing", currentRound: 1 });
      }, 2600);
      return;
    }

    if (g.status === "playing" && g.currentRound !== this.lastRoundIndex) {
      this.lastRoundIndex = g.currentRound;
      this.callbacks.onRoundStart && this.callbacks.onRoundStart(g.currentRound, g.gameType);
      this._runLocalRound();
    }

    if (g.status === "playing") {
      this._maybeAdvanceAsHost();
    }

    if (g.status === "finished" && !this.finished) {
      this.finished = true;
      this.callbacks.onFinished && this.callbacks.onFinished(g);
    }
  }

  _runLocalRound() {
    const container = this.callbacks.getContainer();
    this.roundCleanup = runMiniGame(this.game.gameType, container, {
      difficulty: this.game.currentRound,
      onRoundResult: (result) => this._submitRoundResult(result)
    });
  }

  async _submitRoundResult(result) {
    await FB.patch(`games/${this.gameId}/players/${this.me}`, {
      roundScore: result.points, roundDone: true, roundMeta: result.meta || {}
    });
    this.callbacks.onLocalRoundDone && this.callbacks.onLocalRoundDone(result);
  }

  async _maybeAdvanceAsHost() {
    if (!this.isHost) return;
    const g = this.game;
    const players = g.players || {};
    const ids = Object.keys(players);
    const allDone = ids.every(id => players[id].roundDone);
    if (!allDone) return;
    if (g._advancing === g.currentRound) return; // ya en proceso
    g._advancing = g.currentRound; // marca local para no duplicar mientras llega el patch

    // sumar puntuaciones de la ronda al total
    const updates = {};
    let bestScore = -1, winners = [];
    ids.forEach(id => {
      const total = (players[id].score || 0) + (players[id].roundScore || 0);
      updates[`players/${id}/score`] = total;
      updates[`players/${id}/roundScore`] = 0;
      updates[`players/${id}/roundDone`] = false;
      if (players[id].roundScore > bestScore) { bestScore = players[id].roundScore; winners = [id]; }
      else if (players[id].roundScore === bestScore) winners.push(id);
    });

    const isLastRound = g.currentRound >= g.rounds;
    if (isLastRound) {
      updates["status"] = "finished";
      updates["finishedAt"] = FB.serverTimestamp();
    } else {
      updates["currentRound"] = g.currentRound + 1;
      if (g.selectionPool) updates["rotationIndex"] = (g.rotationIndex || 0) + 1;
    }
    await FB.patch(`games/${this.gameId}`, updates);
  }
}

/**
 * Aplica el resultado final de una partida ya terminada:
 * calcula ganador, actualiza estadísticas del jugador local,
 * publica actividad y refresca el leaderboard.
 */
async function finalizeMatch(game, roomType) {
  const ids = Object.keys(game.players || {});
  const scores = ids.map(id => ({ id, score: game.players[id].score || 0 }));
  scores.sort((a, b) => b.score - a.score);
  const top = scores[0].score;
  const winners = scores.filter(s => s.score === top).map(s => s.id);
  const me = Player.current.playerId;
  const myScore = game.players[me]?.score || 0;
  const outcome = winners.length > 1 && winners.includes(me) ? "draw"
    : winners[0] === me ? "win" : "loss";
  const perfect = outcome === "win" && scores.length > 1 && (top - scores[1].score) >= 40;

  const result = {
    outcome, gameType: game.gameType, score: myScore, perfect, roomType,
    gameStatsPatch: buildGameStatsPatch(game.gameType, game.players[me])
  };

  const applied = await Player.applyMatchResult(result, true);

  if (outcome === "win") {
    await FB.post(`activity`, {
      text: `${Player.current.username} ganó una partida de ${getGameMeta(game.gameType).name}.`,
      at: FB.serverTimestamp()
    }).catch(() => {});
  }

  return { outcome, myScore, opponents: scores.filter(s => s.id !== me), applied };
}

function buildGameStatsPatch(gameType, playerNode) {
  // Estadística ligera por tipo de juego a partir del último roundMeta conocido
  if (!playerNode) return {};
  const meta = playerNode.roundMeta || {};
  switch (gameType) {
    case "reaction":
      return meta.ms ? { best: meta.ms } : {};
    case "colors":
      return {};
    default:
      return {};
  }
}
