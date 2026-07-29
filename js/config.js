/**
 * config.js
 * ─────────────────────────────────────────────────────────
 * ÚNICO lugar donde se configura la conexión a Firebase.
 * Pega aquí la URL de tu Realtime Database y todo el resto
 * del proyecto la usará automáticamente. No hay que tocar
 * ningún otro archivo.
 *
 * Ejemplo:
 * const FIREBASE_DATABASE_URL = "https://mi-proyecto-default-rtdb.firebaseio.com";
 */

const FIREBASE_DATABASE_URL = "https://nyxora-83d38-default-rtdb.firebaseio.com/";

// Ajustes generales de la plataforma
const APP_CONFIG = {
  name: "NYXORA",
  tagline: "Donde cada reflejo cuenta",
  version: "1.0.0-fase1-3",

  // Matchmaking: rangos de búsqueda que se van ampliando con el tiempo (en puntos de rango)
  matchmaking: {
    initialWindow: 4,
    widenEvery: 4000,     // ms
    windowSteps: [4, 8, 12, 20, 40, 999],
    timeoutMs: 45000
  },

  // Streaming / polling
  realtime: {
    useStreaming: true,          // intenta SSE (EventSource) primero
    pollingIntervalMs: 2500,     // fallback
    pollingBackoffMax: 10000,
    heartbeatMs: 15000,
    offlineAfterMs: 45000
  },

  // Experiencia
  exp: {
    win: 100,
    loss: 25,
    perfectWin: 150,
    streakBonusPerWin: 10,
    streakBonusCap: 100,
    practiceExp: 5
  },

  // Nivel (independiente del rango): curva simple de EXP por nivel
  level: {
    baseExp: 500,
    growth: 1.12 // cada nivel requiere 12% más EXP que el anterior
  },

  chat: {
    maxLength: 80,
    minIntervalMs: 1200,
    maxMessagesStored: 40
  },

  room: {
    codeLength: 6,
    defaultRounds: 5,
    cleanupAfterMs: 1000 * 60 * 30 // 30 min
  }
};

// Claves usadas en localStorage (nunca se guardan contraseñas ni datos sensibles)
const STORAGE_KEYS = {
  playerId: "nyxora_player_id",
  settings: "nyxora_settings",
  uiState: "nyxora_ui_state"
};
