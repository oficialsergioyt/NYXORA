/**
 * ranks.js
 * ─────────────────────────────────────────────────────────
 * Genera 120 rangos ÚNICOS (nombre + medalla SVG) de forma
 * procedural, agrupados en 8 niveles de rareza. Los nombres
 * se arman combinando palabras temáticas por rareza y se
 * garantiza que no haya dos iguales. Las medallas se
 * construyen combinando forma + ornamento + símbolo + color,
 * así que las 120 se ven distintas sin dibujar cada una a mano.
 */

const RARITY_TIERS = [
  { key: "common",       label: "Común",        color: "#8a94a6", glow: 0.15, shapes: ["circle"] },
  { key: "uncommon",     label: "Poco común",   color: "#4fd1a5", glow: 0.25, shapes: ["circle", "hex"] },
  { key: "rare",         label: "Raro",         color: "#38bdf8", glow: 0.35, shapes: ["hex", "shield"] },
  { key: "epic",         label: "Épico",        color: "#a78bfa", glow: 0.5,  shapes: ["shield", "diamond"] },
  { key: "legendary",    label: "Legendario",   color: "#f5a623", glow: 0.65, shapes: ["diamond", "star"] },
  { key: "mythic",       label: "Mítico",       color: "#fb7185", glow: 0.8,  shapes: ["star", "crown"] },
  { key: "divine",       label: "Divino",       color: "#f8fafc", glow: 0.92, shapes: ["crown", "sunburst"] },
  { key: "transcendent", label: "Trascendente", color: "#e879f9", glow: 1.0,  shapes: ["sunburst", "vortex"] }
];

const RANKS_PER_TIER = 15; // 8 tiers x 15 = 120

const NAME_PARTS = {
  common:       { pre: ["Novato", "Errante", "Iniciado", "Aprendiz", "Recluta"], post: ["de Ceniza", "del Sendero", "de Bronce", "Curioso", "Nómada"] },
  uncommon:     { pre: ["Explorador", "Rastreador", "Vigía", "Buscador", "Cazador"], post: ["de Señales", "del Eco", "de Bruma", "Silencioso", "Alerta"] },
  rare:         { pre: ["Duelista", "Táctico", "Combatiente", "Estratega", "Centinela"], post: ["Veloz", "de Precisión", "del Pulso", "Afilado", "de Reflejos"] },
  epic:         { pre: ["Guardián", "Dominador", "Vanguardia", "Conquistador", "Arquitecto"], post: ["del Vórtice", "de la Tormenta", "Mental", "de Acero", "del Abismo"] },
  legendary:    { pre: ["Campeón", "Maestro", "Veterano", "Élite", "Corona"], post: ["del Instante", "Supremo", "de la Corona", "Inquebrantable", "del Vacío"] },
  mythic:       { pre: ["Mítico", "Fénix", "Espectro", "Titán", "Oráculo"], post: ["Carmesí", "Eterno", "del Caos", "de Cristal", "Insigne"] },
  divine:       { pre: ["Divino", "Celestial", "Arcano", "Sagrado", "Astral"], post: ["del Amanecer", "de las Esferas", "Radiante", "Absoluto", "del Firmamento"] },
  transcendent: { pre: ["Trascendente", "Primigenio", "Infinito", "Sempiterno", "Origen"], post: ["Absoluto", "del Todo", "sin Nombre", "Definitivo", "Eterno"] }
};

const BADGE_SYMBOLS = ["◆", "◇", "✦", "✧", "★", "✪", "✹", "✷", "⬢", "⬡", "⚜", "☄", "♢", "✶", "❖"];

function generateRankName(tierKey, seedIndex, used) {
  const parts = NAME_PARTS[tierKey];
  const pre = parts.pre[seedIndex % parts.pre.length];
  const post = parts.post[Math.floor(seedIndex / parts.pre.length) % parts.post.length];
  let name = `${pre} ${post}`;
  let attempt = 0;
  while (used.has(name)) {
    attempt++;
    const alt = parts.post[(seedIndex + attempt) % parts.post.length];
    name = `${pre} ${alt} ${attempt > parts.post.length ? "II" : ""}`.trim();
    if (attempt > 20) { name = `${pre} ${post} #${seedIndex}`; break; }
  }
  used.add(name);
  return name;
}

function buildBadgeSVG(rank) {
  const tier = RARITY_TIERS.find(t => t.key === rank.rarity);
  const shape = rank.badgeShape;
  const color = tier.color;
  const glow = tier.glow;
  const symbol = rank.badgeSymbol;
  const ringCount = Math.min(3, Math.floor(rank.tierIndex / 5)); // más anillos cuanto más alto en el tier

  let shapePath = "";
  switch (shape) {
    case "circle":
      shapePath = `<circle cx="32" cy="32" r="24" fill="none" stroke="${color}" stroke-width="3"/>`;
      break;
    case "hex":
      shapePath = `<polygon points="32,6 54,19 54,45 32,58 10,45 10,19" fill="none" stroke="${color}" stroke-width="3"/>`;
      break;
    case "shield":
      shapePath = `<path d="M32 6 L54 14 V32 C54 46 44 56 32 60 C20 56 10 46 10 32 V14 Z" fill="none" stroke="${color}" stroke-width="3"/>`;
      break;
    case "diamond":
      shapePath = `<polygon points="32,4 58,32 32,60 6,32" fill="none" stroke="${color}" stroke-width="3"/>`;
      break;
    case "star":
      shapePath = `<polygon points="32,4 39,24 60,24 43,37 49,58 32,46 15,58 21,37 4,24 25,24" fill="none" stroke="${color}" stroke-width="2.5"/>`;
      break;
    case "crown":
      shapePath = `<path d="M8 44 L14 20 L26 34 L32 14 L38 34 L50 20 L56 44 Z" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round"/>`;
      break;
    case "sunburst":
      shapePath = Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const x1 = 32 + Math.cos(a) * 16, y1 = 32 + Math.sin(a) * 16;
        const x2 = 32 + Math.cos(a) * 28, y2 = 32 + Math.sin(a) * 28;
        return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="2.5"/>`;
      }).join("") + `<circle cx="32" cy="32" r="15" fill="none" stroke="${color}" stroke-width="3"/>`;
      break;
    case "vortex":
      shapePath = Array.from({ length: 3 }).map((_, i) => {
        const r = 12 + i * 8;
        return `<circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="${2 - i * 0.4}" stroke-dasharray="${4 + i * 4} ${3}"/>`;
      }).join("");
      break;
    default:
      shapePath = `<circle cx="32" cy="32" r="24" fill="none" stroke="${color}" stroke-width="3"/>`;
  }

  const rings = Array.from({ length: ringCount }).map((_, i) =>
    `<circle cx="32" cy="32" r="${27 + i * 4}" fill="none" stroke="${color}" stroke-opacity="${0.25 - i * 0.07}" stroke-width="1"/>`
  ).join("");

  return `
  <svg viewBox="0 0 64 64" class="rank-badge-svg" data-rarity="${rank.rarity}">
    <defs>
      <filter id="glow-${rank.id}" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="${2 + glow * 3}" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <g filter="url(#glow-${rank.id})">
      ${rings}
      ${shapePath}
      <text x="32" y="38" text-anchor="middle" font-size="18" fill="${color}">${symbol}</text>
    </g>
  </svg>`;
}

function expCurveForTier(tierIdx, rankInTier) {
  // Curva exponencial global: cada rango cuesta más que el anterior, y los tiers altos escalan mucho más fuerte.
  // El primer rango (globalIndex 0) siempre requiere 0 EXP: es el rango con el
  // que arranca todo jugador nuevo, y si pidiera >0 la barra de progreso da
  // porcentajes negativos.
  const globalIndex = tierIdx * RANKS_PER_TIER + rankInTier;
  if (globalIndex === 0) return 0;
  const base = 300;
  const growth = 1.145;
  return Math.round(base * Math.pow(growth, globalIndex - 1));
}

function buildRanks() {
  const used = new Set();
  const ranks = [];
  let id = 1;
  RARITY_TIERS.forEach((tier, tierIdx) => {
    for (let i = 0; i < RANKS_PER_TIER; i++) {
      const name = generateRankName(tier.key, i + tierIdx * 3, used);
      const symbol = BADGE_SYMBOLS[(tierIdx * RANKS_PER_TIER + i) % BADGE_SYMBOLS.length];
      const shape = tier.shapes[i % tier.shapes.length];
      const rank = {
        id,
        name,
        description: `Nivel de habilidad ${tier.label.toLowerCase()} #${i + 1} dentro del rango ${tier.label}.`,
        requiredExp: expCurveForTier(tierIdx, i),
        rarity: tier.key,
        rarityLabel: tier.label,
        color: tier.color,
        glow: tier.glow,
        badgeSymbol: symbol,
        badgeShape: shape,
        tierIndex: i,
        title: `"${name.split(" ")[0]}"`
      };
      rank.badgeSVG = buildBadgeSVG(rank);
      ranks.push(rank);
      id++;
    }
  });
  return ranks;
}

const RANKS = buildRanks();

function getRankByExp(totalExp) {
  let current = RANKS[0];
  for (const r of RANKS) {
    if (totalExp >= r.requiredExp) current = r;
    else break;
  }
  return current;
}

function getNextRank(currentRankId) {
  return RANKS.find(r => r.id === currentRankId + 1) || null;
}

function getRankById(id) {
  return RANKS.find(r => r.id === id) || RANKS[0];
}

function rankProgress(totalExp) {
  const current = getRankByExp(totalExp);
  const next = getNextRank(current.id);
  if (!next) return { current, next: null, pct: 1, remaining: 0 };
  const span = next.requiredExp - current.requiredExp;
  const into = totalExp - current.requiredExp;
  return {
    current,
    next,
    pct: Math.min(1, into / span),
    remaining: Math.max(0, next.requiredExp - totalExp)
  };
}

// Títulos especiales desbloqueables por logros (independientes del rango numérico)
const SPECIAL_TITLES = [
  { id: "lightning", name: "El Relámpago", condition: "Reacción menor a 180ms" },
  { id: "brain", name: "El Cerebro Absoluto", condition: "Racha de 20 respuestas correctas" },
  { id: "eye", name: "Ojo Preciso", condition: "Precisión superior al 95% en 10 partidas" },
  { id: "strategist", name: "El Estratega", condition: "50 victorias competitivas" },
  { id: "unstoppable", name: "El Imparable", condition: "Racha de 15 victorias" }
];
