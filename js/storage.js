/**
 * storage.js
 * Solo se usa para: playerId, preferencias de UI y configuración
 * de sonido. NUNCA para el perfil completo (eso vive en Firebase).
 */
const Storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch {}
  }
};
