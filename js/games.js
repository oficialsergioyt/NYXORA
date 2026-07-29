/**
 * games.js
 * ─────────────────────────────────────────────────────────
 * Registro central de minijuegos (MINI_GAMES) + la lógica
 * jugable de cada uno. Cada minijuego expone:
 *
 *   run(container, { onRoundResult, difficulty }) -> cleanup()
 *
 * onRoundResult({ points, raw, correct, meta }) se llama UNA
 * vez cuando la ronda termina. `points` (0-100) es lo que se
 * suma al marcador de esa ronda; `raw` es el dato bruto para
 * estadísticas (ms, precisión, etc).
 */

const MINI_GAMES = [
  { id: "reaction", name: "Reacción", icon: "⚡", category: "speed",
    description: "Toca en cuanto la pantalla se ponga verde.", minPlayers: 1, maxPlayers: 8 },
  { id: "traffic", name: "Semáforo", icon: "🚦", category: "precision",
    description: "Solo puedes tocar en verde. Adelantarte penaliza.", minPlayers: 1, maxPlayers: 8 },
  { id: "memory", name: "Secuencia", icon: "🧠", category: "memory",
    description: "Memoriza y repite la secuencia de símbolos.", minPlayers: 1, maxPlayers: 8 },
  { id: "math", name: "Cálculo", icon: "🔢", category: "logic",
    description: "Resuelve la operación lo más rápido posible.", minPlayers: 1, maxPlayers: 8 },
  { id: "target", name: "Objetivo", icon: "🎯", category: "precision",
    description: "Toca el objetivo antes de que cambie de posición.", minPlayers: 1, maxPlayers: 8 },
  { id: "colors", name: "Colores", icon: "🎨", category: "logic",
    description: "Variante Stroop: sigue la regla, no la palabra.", minPlayers: 1, maxPlayers: 8 }
];

function getGameMeta(id) { return MINI_GAMES.find(g => g.id === id); }

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

const Games = {

  reaction(container, { onRoundResult }) {
    container.innerHTML = "";
    const box = el("div", "game-stage game-reaction waiting", `<div class="game-msg">ESPERA…</div>`);
    container.appendChild(box);
    let state = "waiting", startTs = 0, timeout = null, done = false;

    function toGreen() {
      state = "go";
      box.className = "game-stage game-reaction go";
      box.querySelector(".game-msg").textContent = "¡AHORA!";
      startTs = performance.now();
    }

    timeout = setTimeout(toGreen, 1200 + Math.random() * 2200);

    function onTap() {
      if (done) return;
      if (state === "waiting") {
        done = true;
        clearTimeout(timeout);
        box.className = "game-stage game-reaction fail";
        box.querySelector(".game-msg").textContent = "¡Muy pronto!";
        onRoundResult({ points: 0, raw: null, correct: false, meta: { falseStart: true } });
        return;
      }
      done = true;
      const ms = Math.round(performance.now() - startTs);
      const points = Math.max(5, Math.round(100 - ms / 6));
      box.querySelector(".game-msg").textContent = `${ms} ms`;
      onRoundResult({ points, raw: ms, correct: true, meta: { ms } });
    }

    box.addEventListener("pointerdown", onTap);
    return () => { clearTimeout(timeout); box.removeEventListener("pointerdown", onTap); };
  },

  traffic(container, { onRoundResult }) {
    container.innerHTML = "";
    const wrap = el("div", "game-stage game-traffic");
    const light = el("div", "traffic-light");
    ["red", "yellow", "green"].forEach(c => light.appendChild(el("div", `bulb ${c}`)));
    wrap.appendChild(light);
    wrap.appendChild(el("div", "game-msg", "Espera al verde…"));
    container.appendChild(wrap);

    let phase = 0; // 0 red, 1 yellow, 2 green
    let done = false, greenAt = 0;
    const bulbs = wrap.querySelectorAll(".bulb");
    function setPhase(p) {
      phase = p;
      bulbs.forEach((b, i) => b.classList.toggle("on", i === p));
      if (p === 2) greenAt = performance.now();
    }
    const t1 = setTimeout(() => setPhase(1), 900 + Math.random() * 800);
    const t2 = setTimeout(() => setPhase(2), 1900 + Math.random() * 1400);

    function onTap() {
      if (done) return;
      done = true;
      clearTimeout(t1); clearTimeout(t2);
      if (phase !== 2) {
        wrap.querySelector(".game-msg").textContent = "❌ Penalización";
        onRoundResult({ points: 0, raw: null, correct: false, meta: { early: true } });
      } else {
        const ms = Math.round(performance.now() - greenAt);
        const points = Math.max(5, Math.round(100 - ms / 5));
        wrap.querySelector(".game-msg").textContent = `${ms} ms`;
        onRoundResult({ points, raw: ms, correct: true, meta: { ms } });
      }
    }
    wrap.addEventListener("pointerdown", onTap);
    return () => { clearTimeout(t1); clearTimeout(t2); wrap.removeEventListener("pointerdown", onTap); };
  },

  memory(container, { onRoundResult, difficulty = 1 }) {
    container.innerHTML = "";
    const symbols = ["🔥", "💎", "⭐", "⚡", "🌙", "🍀"];
    const length = 3 + Math.min(5, difficulty);
    const sequence = Array.from({ length }, () => symbols[Math.floor(Math.random() * symbols.length)]);

    const wrap = el("div", "game-stage game-memory");
    const display = el("div", "memory-display", sequence.map(s => `<span>${s}</span>`).join(""));
    wrap.appendChild(display);
    wrap.appendChild(el("div", "game-msg", "Memoriza…"));
    container.appendChild(wrap);

    let userSeq = [];
    let locked = true;

    setTimeout(() => {
      display.innerHTML = "";
      wrap.querySelector(".game-msg").textContent = "Repite la secuencia";
      locked = false;
      const grid = el("div", "memory-grid");
      symbols.forEach(sym => {
        const btn = el("button", "memory-btn", sym);
        btn.addEventListener("click", () => {
          if (locked) return;
          userSeq.push(sym);
          btn.classList.add("tap");
          setTimeout(() => btn.classList.remove("tap"), 150);
          const idx = userSeq.length - 1;
          if (userSeq[idx] !== sequence[idx]) {
            locked = true;
            onRoundResult({ points: Math.round((idx / length) * 60), raw: idx, correct: false, meta: { failedAt: idx } });
            return;
          }
          if (userSeq.length === sequence.length) {
            locked = true;
            onRoundResult({ points: 100, raw: length, correct: true, meta: { length } });
          }
        });
        grid.appendChild(btn);
      });
      wrap.appendChild(grid);
    }, 900 + length * 350);

    return () => {};
  },

  math(container, { onRoundResult }) {
    container.innerHTML = "";
    const ops = ["+", "-", "×"];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a, b, answer;
    if (op === "+") { a = rnd(10, 90); b = rnd(10, 90); answer = a + b; }
    else if (op === "-") { a = rnd(30, 99); b = rnd(1, a); answer = a - b; }
    else { a = rnd(2, 12); b = rnd(2, 12); answer = a * b; }

    function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

    const options = new Set([answer]);
    while (options.size < 4) options.add(answer + rnd(-10, 10) * (rnd(0,1)?1:-1) || answer + rnd(1,9));
    const shuffled = Array.from(options).sort(() => Math.random() - 0.5);

    const wrap = el("div", "game-stage game-math");
    wrap.appendChild(el("div", "math-question", `${a} ${op} ${b}`));
    const optsWrap = el("div", "math-options");
    wrap.appendChild(optsWrap);
    container.appendChild(wrap);

    const start = performance.now();
    let done = false;
    shuffled.forEach(val => {
      const btn = el("button", "math-btn", String(val));
      btn.addEventListener("click", () => {
        if (done) return;
        done = true;
        const ms = performance.now() - start;
        const correct = val === answer;
        btn.classList.add(correct ? "correct" : "wrong");
        const points = correct ? Math.max(20, Math.round(100 - ms / 40)) : 0;
        onRoundResult({ points, raw: ms, correct, meta: { ms } });
      });
      optsWrap.appendChild(btn);
    });
    return () => {};
  },

  target(container, { onRoundResult }) {
    container.innerHTML = "";
    const wrap = el("div", "game-stage game-target");
    container.appendChild(wrap);
    const start = performance.now();
    let done = false;

    function place() {
      const t = el("div", "target-dot", "🎯");
      const pad = 30;
      const x = pad + Math.random() * (100 - pad * 2);
      const y = pad + Math.random() * (100 - pad * 2);
      t.style.left = x + "%";
      t.style.top = y + "%";
      t.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        if (done) return;
        done = true;
        const ms = performance.now() - start;
        const points = Math.max(10, Math.round(100 - ms / 30));
        onRoundResult({ points, raw: ms, correct: true, meta: { ms } });
      });
      wrap.appendChild(t);
    }
    place();

    wrap.addEventListener("pointerdown", () => {
      if (done) return;
      // click fuera del objetivo: pequeña penalización, no termina la ronda
      wrap.classList.add("miss-flash");
      setTimeout(() => wrap.classList.remove("miss-flash"), 150);
    });

    return () => {};
  },

  colors(container, { onRoundResult }) {
    container.innerHTML = "";
    const palette = [
      { name: "ROJO", css: "#ef4444" }, { name: "AZUL", css: "#38bdf8" },
      { name: "VERDE", css: "#4ade80" }, { name: "AMARILLO", css: "#facc15" }
    ];
    const word = palette[Math.floor(Math.random() * palette.length)];
    let ink = palette[Math.floor(Math.random() * palette.length)];
    // fuerza que a veces coincidan y a veces no
    if (Math.random() < 0.3) ink = word;

    const ruleByColor = Math.random() < 0.5; // true: elige según el COLOR visual; false: según la PALABRA
    const wrap = el("div", "game-stage game-colors");
    wrap.appendChild(el("div", "colors-rule", ruleByColor ? "Elige el COLOR de la tinta" : "Elige lo que DICE la palabra"));
    wrap.appendChild(el("div", "colors-word", word.name)).style.color = ink.css;
    const optsWrap = el("div", "colors-options");
    wrap.appendChild(optsWrap);
    container.appendChild(wrap);

    const correctAnswer = ruleByColor ? ink.name : word.name;
    const start = performance.now();
    let done = false;
    palette.sort(() => Math.random() - 0.5).forEach(p => {
      const btn = el("button", "colors-btn", p.name);
      btn.style.borderColor = p.css;
      btn.addEventListener("click", () => {
        if (done) return;
        done = true;
        const ms = performance.now() - start;
        const correct = p.name === correctAnswer;
        const points = correct ? Math.max(15, Math.round(100 - ms / 35)) : 0;
        onRoundResult({ points, raw: ms, correct, meta: { ms } });
      });
      optsWrap.appendChild(btn);
    });
    return () => {};
  }
};

/**
 * Ejecuta un minijuego por su id dentro de un contenedor.
 * Devuelve la función de limpieza del propio juego.
 */
function runMiniGame(gameId, container, opts) {
  if (typeof Games[gameId] !== "function") throw new Error(`Minijuego desconocido: ${gameId}`);
  return Games[gameId](container, opts);
}
