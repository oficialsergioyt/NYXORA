/**
 * rooms.js
 * ─────────────────────────────────────────────────────────
 * Salas públicas y privadas sincronizadas en tiempo real via
 * rooms/ROOM_ID en Firebase.
 */

const Rooms = {
  currentRoomId: null,
  _stopListen: null,
  _stopChatListen: null,
  _lastChatAt: 0,

  generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < APP_CONFIG.room.codeLength; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  },

  async create({ name, type, maxPlayers, selectionMode, selectedGames, rounds }) {
    const roomId = (type === "private" ? this.generateRoomCode() : "PUB-" + Math.random().toString(36).slice(2, 8).toUpperCase());
    const owner = Player.current;
    const room = {
      roomId,
      ownerId: owner.playerId,
      name: sanitizeUsername(name) || `Sala de ${owner.username}`,
      type,
      maxPlayers,
      status: "waiting",
      selectionMode, // "all" | "selected" | "rotation"
      selectedGames: selectedGames || MINI_GAMES.map(g => g.id),
      rotationIndex: 0,
      rounds: rounds || APP_CONFIG.room.defaultRounds,
      createdAt: FB.serverTimestamp(),
      players: {
        [owner.playerId]: {
          username: owner.username, avatar: owner.avatar, rankId: owner.rankId,
          ready: true, joinedAt: FB.serverTimestamp(), online: true
        }
      }
    };
    await FB.put(`rooms/${roomId}`, room);
    this.currentRoomId = roomId;
    return room;
  },

  async join(roomId) {
    const room = await FB.get(`rooms/${roomId}`);
    if (!room) throw new Error("La sala no existe o ya terminó.");
    const players = room.players || {};
    if (Object.keys(players).length >= room.maxPlayers) throw new Error("La sala está llena.");
    if (room.status !== "waiting") throw new Error("La partida ya comenzó.");
    const p = Player.current;
    await FB.patch(`rooms/${roomId}/players/${p.playerId}`, {
      username: p.username, avatar: p.avatar, rankId: p.rankId,
      ready: false, joinedAt: FB.serverTimestamp(), online: true
    });
    this.currentRoomId = roomId;
    return roomId;
  },

  async leave(roomId) {
    if (!roomId) return;
    await FB.delete(`rooms/${roomId}/players/${Player.current.playerId}`);
    const room = await FB.get(`rooms/${roomId}`);
    if (!room || !room.players || Object.keys(room.players).length === 0) {
      await FB.delete(`rooms/${roomId}`);
    } else if (room.ownerId === Player.current.playerId) {
      // transferir propiedad al primero que quede
      const nextOwner = Object.keys(room.players)[0];
      await FB.patch(`rooms/${roomId}`, { ownerId: nextOwner });
    }
    if (this.currentRoomId === roomId) this.currentRoomId = null;
    this.stopWatching();
  },

  async setReady(roomId, ready) {
    await FB.patch(`rooms/${roomId}/players/${Player.current.playerId}`, { ready });
  },

  async startMatch(roomId) {
    await FB.patch(`rooms/${roomId}`, { status: "starting" });
  },

  watch(roomId, onChange) {
    this.stopWatching();
    this._stopListen = FB.listen(`rooms/${roomId}`, onChange);
  },

  stopWatching() {
    if (this._stopListen) { this._stopListen(); this._stopListen = null; }
    if (this._stopChatListen) { this._stopChatListen(); this._stopChatListen = null; }
  },

  watchPublicList(onChange) {
    return FB.listen(`rooms`, (all) => {
      const list = Object.values(all || {}).filter(r => r && r.type === "public" && r.status === "waiting");
      onChange(list);
    });
  },

  pickNextGame(room) {
    const pool = room.selectionMode === "all" ? MINI_GAMES.map(g => g.id) : (room.selectedGames || []);
    if (!pool.length) return MINI_GAMES[0].id;
    if (room.selectionMode === "rotation") {
      const idx = (room.rotationIndex || 0) % pool.length;
      return pool[idx];
    }
    return pool[Math.floor(Math.random() * pool.length)];
  },

  async sendChat(roomId, text) {
    const now = Date.now();
    if (now - this._lastChatAt < APP_CONFIG.chat.minIntervalMs) return; // anti-spam
    const clean = sanitizeUsername(text).slice(0, APP_CONFIG.chat.maxLength);
    if (!clean) return;
    this._lastChatAt = now;
    await FB.post(`rooms/${roomId}/chat`, {
      playerId: Player.current.playerId,
      username: Player.current.username,
      text: clean,
      at: FB.serverTimestamp()
    });
  },

  watchChat(roomId, onMessages) {
    this._stopChatListen = FB.listen(`rooms/${roomId}/chat`, (data) => {
      const msgs = Object.values(data || {}).sort((a, b) => (a.at || 0) - (b.at || 0));
      onMessages(msgs.slice(-APP_CONFIG.chat.maxMessagesStored));
    });
  }
};
