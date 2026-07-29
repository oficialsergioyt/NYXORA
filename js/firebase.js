/**
 * firebase.js
 * ─────────────────────────────────────────────────────────
 * Capa única de acceso a Firebase Realtime Database usando
 * la API REST (sin SDK, sin API key). Toda llamada construye
 * su URL a partir de FIREBASE_DATABASE_URL (config.js).
 *
 * IMPORTANTE (seguridad, léelo):
 * Una URL de Realtime Database NO autentica usuarios. Este
 * prototipo usa un playerId generado en el cliente como
 * identificador, protegido con reglas .validate en Firebase
 * (ver firebase-rules.json) que impiden escribir campos
 * sensibles (wins, rank, exp) con valores arbitrarios o
 * fuera de rango. Para producción real, esto debería
 * moverse a Firebase Auth + Cloud Functions que validen y
 * escriban los resultados en el servidor, nunca el cliente
 * directamente. Lo dejamos señalado en cada punto sensible.
 */

const FB = (() => {
  function url(path, query = "") {
    const base = FIREBASE_DATABASE_URL.replace(/\/+$/, "");
    const clean = path.replace(/^\/+/, "");
    const sep = query ? "?" + query : "";
    return `${base}/${clean}.json${sep}`;
  }

  async function handle(res) {
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Firebase ${res.status}: ${text || res.statusText}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function get(path) {
    const res = await fetch(url(path));
    return handle(res);
  }

  async function put(path, data) {
    const res = await fetch(url(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return handle(res);
  }

  async function patch(path, data) {
    const res = await fetch(url(path), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return handle(res);
  }

  async function post(path, data) {
    const res = await fetch(url(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return handle(res);
  }

  async function del(path) {
    const res = await fetch(url(path), { method: "DELETE" });
    return handle(res);
  }

  // Marca de tiempo del servidor (Firebase la resuelve al escribir)
  function serverTimestamp() {
    return { ".sv": "timestamp" };
  }

  /**
   * Escucha cambios en tiempo real de un path.
   * Intenta SSE (streaming REST de Firebase). Si falla o no
   * está disponible, cae automáticamente a polling con backoff.
   *
   * onData(data) se llama cada vez que hay un valor nuevo.
   * Devuelve una función stop() para cortar la escucha.
   */
  function listen(path, onData, onError = () => {}) {
    let stopped = false;
    let usingStream = APP_CONFIG.realtime.useStreaming && typeof EventSource !== "undefined";
    let es = null;
    let pollTimer = null;
    let pollDelay = APP_CONFIG.realtime.pollingIntervalMs;
    let lastSnapshotJSON = null;

    function startPolling() {
      if (stopped) return;
      const tick = async () => {
        if (stopped) return;
        try {
          const data = await get(path);
          const json = JSON.stringify(data);
          if (json !== lastSnapshotJSON) {
            lastSnapshotJSON = json;
            onData(data);
          }
          pollDelay = APP_CONFIG.realtime.pollingIntervalMs; // reset backoff on success
        } catch (e) {
          onError(e);
          pollDelay = Math.min(pollDelay * 1.6, APP_CONFIG.realtime.pollingBackoffMax);
        } finally {
          if (!stopped) pollTimer = setTimeout(tick, pollDelay);
        }
      };
      tick();
    }

    function startStream() {
      try {
        es = new EventSource(url(path));
        let cache = null;

        es.addEventListener("put", (e) => {
          try {
            const { path: p, data } = JSON.parse(e.data);
            if (p === "/") {
              cache = data;
            } else {
              cache = cache || {};
              cache = applyPatchAtPath(cache, p, data);
            }
            onData(cache);
          } catch (err) { onError(err); }
        });

        es.addEventListener("patch", (e) => {
          try {
            const { path: p, data } = JSON.parse(e.data);
            cache = cache || {};
            cache = applyPatchAtPath(cache, p, data, true);
            onData(cache);
          } catch (err) { onError(err); }
        });

        es.onerror = () => {
          es.close();
          es = null;
          if (!stopped) {
            usingStream = false;
            startPolling();
          }
        };
      } catch (e) {
        usingStream = false;
        startPolling();
      }
    }

    function applyPatchAtPath(root, p, data, merge = false) {
      if (p === "/" ) return merge ? { ...(root || {}), ...data } : data;
      const parts = p.split("/").filter(Boolean);
      const clone = root ? { ...root } : {};
      let cursor = clone;
      for (let i = 0; i < parts.length - 1; i++) {
        cursor[parts[i]] = { ...(cursor[parts[i]] || {}) };
        cursor = cursor[parts[i]];
      }
      cursor[parts[parts.length - 1]] = data;
      return clone;
    }

    if (usingStream) startStream(); else startPolling();

    return function stop() {
      stopped = true;
      if (es) es.close();
      if (pollTimer) clearTimeout(pollTimer);
    };
  }

  return { get, put, patch, post, delete: del, serverTimestamp, listen, url };
})();
