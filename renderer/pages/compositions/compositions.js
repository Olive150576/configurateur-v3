'use strict';

// ── Constantes SVG (en cm — 1px = 1cm sur le canvas) ─────────────────────────
const ARM  = 10;   // largeur accoudoir (cm)
const BH   = 12;   // hauteur dossier (cm)
const S_FILL = '#c8a96e';
const DARK   = '#1C1410';

// ── Dimensions par défaut (cm) ────────────────────────────────────────────────
const SEAT_PER_PLACE = 65; // cm de largeur d'assise par place

function defaultDims(type, places) {
  const n = parseInt(places) || 2;
  switch (type) {
    case 'sofa-full':          return { w: n * SEAT_PER_PLACE + ARM * 2, d: 90 };
    case 'batard-left':        return { w: n * SEAT_PER_PLACE + ARM,     d: 90 };
    case 'batard-right':       return { w: n * SEAT_PER_PLACE + ARM,     d: 90 };
    case 'sans-accoudoir':     return { w: n * SEAT_PER_PLACE,           d: 90 };
    case 'angle-left':
    case 'angle-right':        return { w: 90, d: 90 };
    case 'meridienne-left':
    case 'meridienne-right':   return { w: 90, d: 160 };
    case 'pouf':               return { w: 80, d: 80 };
    case 'table-ronde':        return { w: 80, d: 80 };
    case 'table-carree':       return { w: 90, d: 90 };
    case 'table-rectangulaire':return { w: 120, d: 60 };
    default:                   return { w: 90, d: 90 };
  }
}

// ── Parser de dimensions produit ("L.160 × P.95 × H.85 cm") ──────────────────
function parseDimStr(str) {
  if (!str) return null;
  const L = str.match(/L\.?\s*(\d+)/i);
  const P = str.match(/P\.?\s*(\d+)/i);
  if (!L && !P) return null;
  return { w: L ? parseInt(L[1]) : null, d: P ? parseInt(P[1]) : null };
}

// ── Générateurs SVG à l'échelle (1cm = 1px) ───────────────────────────────────
// Chaque fonction retourne un <svg viewBox="0 0 w d"> à dimensions réelles.
// Le viewBox EST le gabarit cm. Les attr width/height sont posés lors du rendu canvas.

function label(cx, cy, n, w, d, hasRelax) {
  const fs  = Math.max(8, Math.min(13, Math.round(w * 0.09)));
  const fs2 = Math.max(7, fs - 1);
  const relax = hasRelax
    ? `<text x="${cx}" y="${cy - fs - 3}" font-family="sans-serif" font-size="${fs + 2}"
        text-anchor="middle">⚡</text>` : '';
  return `${relax}
    <text x="${cx}" y="${cy}" font-family="sans-serif" font-size="${fs}"
      fill="white" text-anchor="middle" font-weight="700">${n}P · ${w}cm</text>
    <text x="${cx}" y="${cy + fs2 + 2}" font-family="sans-serif" font-size="${fs2}"
      fill="rgba(255,255,255,0.75)" text-anchor="middle">${w}×${d}cm</text>`;
}

function svgSofaFull(n, w, d, r) {
  n = parseInt(n) || 2;
  const sw = w - ARM * 2;
  return `<svg viewBox="0 0 ${w} ${d}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <rect x="${ARM}" y="0"      width="${sw}"  height="${d}"  rx="3" fill="${S_FILL}" opacity="0.85"/>
    <rect x="${ARM}" y="0"      width="${sw}"  height="${BH}" rx="3" fill="${DARK}"   opacity="0.65"/>
    <rect x="0"      y="0"      width="${ARM}" height="${d}"  rx="2" fill="${DARK}"   opacity="0.50"/>
    <rect x="${w-ARM}" y="0"    width="${ARM}" height="${d}"  rx="2" fill="${DARK}"   opacity="0.50"/>
    ${label(w/2, d*0.55, n, w, d, r)}
  </svg>`;
}

function svgBatardLeft(n, w, d, r) {
  n = parseInt(n) || 2;
  const sw = w - ARM;
  return `<svg viewBox="0 0 ${w} ${d}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <rect x="${ARM}" y="0" width="${sw}" height="${d}"  rx="3" fill="${S_FILL}" opacity="0.85"/>
    <rect x="${ARM}" y="0" width="${sw}" height="${BH}" rx="3" fill="${DARK}"   opacity="0.65"/>
    <rect x="0"      y="0" width="${ARM}" height="${d}" rx="2" fill="${DARK}"   opacity="0.50"/>
    ${label(ARM + sw/2, d*0.55, n, w, d, r)}
  </svg>`;
}

function svgBatardRight(n, w, d, r) {
  n = parseInt(n) || 2;
  const sw = w - ARM;
  return `<svg viewBox="0 0 ${w} ${d}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <rect x="0"      y="0" width="${sw}"  height="${d}"  rx="3" fill="${S_FILL}" opacity="0.85"/>
    <rect x="0"      y="0" width="${sw}"  height="${BH}" rx="3" fill="${DARK}"   opacity="0.65"/>
    <rect x="${sw}"  y="0" width="${ARM}" height="${d}"  rx="2" fill="${DARK}"   opacity="0.50"/>
    ${label(sw/2, d*0.55, n, w, d, r)}
  </svg>`;
}

function svgSansAccoudoir(n, w, d, r) {
  n = parseInt(n) || 2;
  return `<svg viewBox="0 0 ${w} ${d}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <rect x="0" y="0" width="${w}" height="${d}"  rx="3" fill="${S_FILL}" opacity="0.85"/>
    <rect x="0" y="0" width="${w}" height="${BH}" rx="3" fill="${DARK}"   opacity="0.65"/>
    ${label(w/2, d*0.55, n, w, d, r)}
  </svg>`;
}

function svgAngleLeft(w, d) {
  // Carré seul : dossier en haut + dossier côté gauche (coin intérieur bas-droit ouvert)
  const S = Math.min(w, d); // côté du carré
  return `<svg viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <rect x="0" y="0" width="${S}" height="${S}" rx="3" fill="${S_FILL}" opacity="0.85"/>
    <rect x="0" y="0" width="${S}" height="${BH}" rx="3" fill="${DARK}"  opacity="0.65"/>
    <rect x="0" y="0" width="${BH}" height="${S}" rx="3" fill="${DARK}"  opacity="0.65"/>
    <text x="${S*0.6}" y="${S*0.52}" font-family="sans-serif" font-size="${Math.max(8,Math.round(S*0.14))}"
      fill="white" text-anchor="middle" font-weight="700">∟G</text>
    <text x="${S*0.6}" y="${S*0.52 + Math.max(8,Math.round(S*0.14)) + 2}" font-family="sans-serif"
      font-size="${Math.max(7,Math.round(S*0.11))}" fill="rgba(255,255,255,0.75)" text-anchor="middle">${S}×${S}cm</text>
  </svg>`;
}

function svgAngleRight(w, d) {
  const S = Math.min(w, d);
  return `<svg viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <rect x="0"      y="0" width="${S}"  height="${S}"  rx="3" fill="${S_FILL}" opacity="0.85"/>
    <rect x="0"      y="0" width="${S}"  height="${BH}" rx="3" fill="${DARK}"   opacity="0.65"/>
    <rect x="${S-BH}" y="0" width="${BH}" height="${S}" rx="3" fill="${DARK}"   opacity="0.65"/>
    <text x="${S*0.4}" y="${S*0.52}" font-family="sans-serif" font-size="${Math.max(8,Math.round(S*0.14))}"
      fill="white" text-anchor="middle" font-weight="700">∟D</text>
    <text x="${S*0.4}" y="${S*0.52 + Math.max(8,Math.round(S*0.14)) + 2}" font-family="sans-serif"
      font-size="${Math.max(7,Math.round(S*0.11))}" fill="rgba(255,255,255,0.75)" text-anchor="middle">${S}×${S}cm</text>
  </svg>`;
}

// Méridienne — vue de dessus, orientation VERTICALE
// w = largeur (= profondeur du canapé, côté court, ex: 90cm)
// d = longueur (= longueur de la chaise longue, côté long, ex: 160cm)
// Dossier : sur la LARGEUR (bande BH en haut, côté court)
// Accoudoir : sur la LONGUEUR (bande ARM à droite ou gauche, côté long)

function svgMerienneRight(w, d) {
  // Accoudoir D = côté DROIT (long side right)
  // Hauteur accoudoir = w (largeur de la méridienne = profondeur d'un canapé), pas d
  const sw = w - ARM; // largeur assise
  return `<svg viewBox="0 0 ${w} ${d}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <!-- assise -->
    <rect x="0"    y="0" width="${sw}" height="${d}"  rx="3" fill="${S_FILL}" opacity="0.85"/>
    <!-- dossier sur la largeur (haut, côté court) -->
    <rect x="0"    y="0" width="${sw}" height="${BH}" rx="3" fill="${DARK}"   opacity="0.65"/>
    <!-- accoudoir D : ARM de large × w de haut (= même dimension qu'un accoudoir de canapé) -->
    <rect x="${sw}" y="0" width="${ARM}" height="${w}" rx="2" fill="${DARK}"   opacity="0.50"/>
    <text x="${sw/2}" y="${d*0.55}" font-family="sans-serif"
      font-size="${Math.max(8,Math.round(w*0.11))}" fill="white" text-anchor="middle" font-weight="700">MÉR.D</text>
    <text x="${sw/2}" y="${d*0.55 + Math.max(8,Math.round(w*0.11)) + 3}"
      font-family="sans-serif" font-size="${Math.max(7,Math.round(w*0.09))}"
      fill="rgba(255,255,255,0.75)" text-anchor="middle">${d}cm</text>
  </svg>`;
}

function svgMerienneLeft(w, d) {
  // Accoudoir G = côté GAUCHE (long side left)
  const sw = w - ARM;
  return `<svg viewBox="0 0 ${w} ${d}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <!-- accoudoir G : ARM de large × w de haut (= même dimension qu'un accoudoir de canapé) -->
    <rect x="0"    y="0" width="${ARM}" height="${w}"  rx="2" fill="${DARK}"   opacity="0.50"/>
    <!-- assise -->
    <rect x="${ARM}" y="0" width="${sw}" height="${d}"  rx="3" fill="${S_FILL}" opacity="0.85"/>
    <!-- dossier sur la largeur (haut, côté court) -->
    <rect x="${ARM}" y="0" width="${sw}" height="${BH}" rx="3" fill="${DARK}"   opacity="0.65"/>
    <text x="${ARM + sw/2}" y="${d*0.55}" font-family="sans-serif"
      font-size="${Math.max(8,Math.round(w*0.11))}" fill="white" text-anchor="middle" font-weight="700">MÉR.G</text>
    <text x="${ARM + sw/2}" y="${d*0.55 + Math.max(8,Math.round(w*0.11)) + 3}"
      font-family="sans-serif" font-size="${Math.max(7,Math.round(w*0.09))}"
      fill="rgba(255,255,255,0.75)" text-anchor="middle">${d}cm</text>
  </svg>`;
}

function svgPouf(w, d) {
  const fs  = Math.max(8, Math.round(w * 0.12));
  const fs2 = Math.max(7, fs - 1);
  return `<svg viewBox="0 0 ${w} ${d}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <rect x="2" y="2" width="${w-4}" height="${d-4}" rx="8" fill="${S_FILL}" opacity="0.85"/>
    <text x="${w/2}" y="${d*0.48}" font-family="sans-serif" font-size="${fs}"
      fill="white" text-anchor="middle" font-weight="700">POUF</text>
    <text x="${w/2}" y="${d*0.48 + fs2 + 2}" font-family="sans-serif" font-size="${fs2}"
      fill="rgba(255,255,255,0.75)" text-anchor="middle">${w}×${d}cm</text>
  </svg>`;
}

function svgTableRonde(w, d) {
  const r = Math.round(Math.min(w, d) / 2) - 2;
  const cx = w / 2, cy = d / 2;
  return `<svg viewBox="0 0 ${w} ${d}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#d4a84b" opacity="0.55" stroke="#a07830" stroke-width="1.5"/>
    <circle cx="${cx}" cy="${cy}" r="${Math.round(r*0.7)}" fill="none" stroke="#a07830" stroke-width="1" opacity="0.35"/>
    <text x="${cx}" y="${cy - 4}" font-family="sans-serif" font-size="${Math.max(7,Math.round(r*0.2))}"
      fill="#5a3e10" text-anchor="middle" font-weight="700">TABLE</text>
    <text x="${cx}" y="${cy + Math.max(7,Math.round(r*0.2)) + 2}" font-family="sans-serif"
      font-size="${Math.max(6,Math.round(r*0.17))}" fill="#5a3e10" text-anchor="middle">⌀${w}cm</text>
  </svg>`;
}

function svgTableCarree(w, d) {
  return `<svg viewBox="0 0 ${w} ${d}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <rect x="2" y="2" width="${w-4}" height="${d-4}" rx="5" fill="#d4a84b" opacity="0.55" stroke="#a07830" stroke-width="1.5"/>
    <rect x="8" y="8" width="${w-16}" height="${d-16}" rx="3" fill="none" stroke="#a07830" stroke-width="1" opacity="0.35"/>
    <text x="${w/2}" y="${d/2 - 3}" font-family="sans-serif" font-size="${Math.max(7,Math.round(w*0.1))}"
      fill="#5a3e10" text-anchor="middle" font-weight="700">TABLE</text>
    <text x="${w/2}" y="${d/2 + Math.max(7,Math.round(w*0.1)) + 1}" font-family="sans-serif"
      font-size="${Math.max(6,Math.round(w*0.09))}" fill="#5a3e10" text-anchor="middle">${w}×${d}cm</text>
  </svg>`;
}

function svgTableRectangulaire(w, d) {
  return `<svg viewBox="0 0 ${w} ${d}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <rect x="2" y="2" width="${w-4}" height="${d-4}" rx="5" fill="#d4a84b" opacity="0.55" stroke="#a07830" stroke-width="1.5"/>
    <rect x="8" y="8" width="${w-16}" height="${d-16}" rx="3" fill="none" stroke="#a07830" stroke-width="1" opacity="0.35"/>
    <text x="${w/2}" y="${d/2 - 3}" font-family="sans-serif" font-size="${Math.max(7,Math.round(d*0.14))}"
      fill="#5a3e10" text-anchor="middle" font-weight="700">TABLE</text>
    <text x="${w/2}" y="${d/2 + Math.max(7,Math.round(d*0.14)) + 1}" font-family="sans-serif"
      font-size="${Math.max(6,Math.round(d*0.12))}" fill="#5a3e10" text-anchor="middle">${w}×${d}cm</text>
  </svg>`;
}

// ── Définition de la palette ───────────────────────────────────────────────────

const SOFA_DEFS = [
  { type: 'sofa-full',      label: 'Canapé',        askPlaces: true,  defaultPlaces: 3,
    svgFn: (p) => { const {w,d} = defaultDims('sofa-full', p);      return svgSofaFull(p,w,d); } },
  { type: 'batard-left',    label: 'Bâtard G',      askPlaces: true,  defaultPlaces: 2,
    svgFn: (p) => { const {w,d} = defaultDims('batard-left', p);    return svgBatardLeft(p,w,d); } },
  { type: 'batard-right',   label: 'Bâtard D',      askPlaces: true,  defaultPlaces: 2,
    svgFn: (p) => { const {w,d} = defaultDims('batard-right', p);   return svgBatardRight(p,w,d); } },
  { type: 'sans-accoudoir', label: 'Sans acc.',      askPlaces: true,  defaultPlaces: 2,
    svgFn: (p) => { const {w,d} = defaultDims('sans-accoudoir', p); return svgSansAccoudoir(p,w,d); } },
];

const CORNER_DEFS = [
  { type: 'angle-left',       label: 'Angle G',     askPlaces: false,
    svgFn: () => { const {w,d} = defaultDims('angle-left');   return svgAngleLeft(w,d); } },
  { type: 'angle-right',      label: 'Angle D',     askPlaces: false,
    svgFn: () => { const {w,d} = defaultDims('angle-right');  return svgAngleRight(w,d); } },
  { type: 'meridienne-left',  label: 'Méri. G',     askPlaces: false,
    svgFn: () => { const {w,d} = defaultDims('meridienne-left');  return svgMerienneLeft(w,d); } },
  { type: 'meridienne-right', label: 'Méri. D',     askPlaces: false,
    svgFn: () => { const {w,d} = defaultDims('meridienne-right'); return svgMerienneRight(w,d); } },
];

const TABLE_DEFS = [
  { type: 'pouf',                label: 'Pouf',          askPlaces: false,
    svgFn: () => { const {w,d} = defaultDims('pouf');               return svgPouf(w,d); } },
  { type: 'table-ronde',         label: 'Table ronde',   askPlaces: false,
    svgFn: () => { const {w,d} = defaultDims('table-ronde');        return svgTableRonde(w,d); } },
  { type: 'table-carree',        label: 'Table carrée',  askPlaces: false,
    svgFn: () => { const {w,d} = defaultDims('table-carree');       return svgTableCarree(w,d); } },
  { type: 'table-rectangulaire', label: 'Table rect.',   askPlaces: false,
    svgFn: () => { const {w,d} = defaultDims('table-rectangulaire');return svgTableRectangulaire(w,d); } },
];

const ALL_DEFS = [...SOFA_DEFS, ...CORNER_DEFS, ...TABLE_DEFS];

function svgForModule(mod) {
  const w = mod.w_cm, d = mod.d_cm, n = mod.places, r = mod.hasRelax;
  switch (mod.type) {
    case 'sofa-full':          return svgSofaFull(n, w, d, r);
    case 'batard-left':        return svgBatardLeft(n, w, d, r);
    case 'batard-right':       return svgBatardRight(n, w, d, r);
    case 'sans-accoudoir':     return svgSansAccoudoir(n, w, d, r);
    case 'angle-left':         return svgAngleLeft(w, d);
    case 'angle-right':        return svgAngleRight(w, d);
    case 'meridienne-left':    return svgMerienneLeft(w, d);
    case 'meridienne-right':   return svgMerienneRight(w, d);
    case 'pouf':               return svgPouf(w, d);
    case 'table-ronde':        return svgTableRonde(w, d);
    case 'table-carree':       return svgTableCarree(w, d);
    case 'table-rectangulaire':return svgTableRectangulaire(w, d);
    default: return '';
  }
}

// ── État canvas ────────────────────────────────────────────────────────────────

let canvasModules         = [];
let selectedId            = null;
let panX                  = -400;
let panY                  = -200;
let scale                 = 1;
let currentCompositionId  = null;

function uuid() {
  return 'mod_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

// ── Construction palette ───────────────────────────────────────────────────────

function buildPaletteGrid(containerId, defs) {
  const container = document.getElementById(containerId);
  defs.forEach(def => {
    const tile = document.createElement('div');
    tile.className = 'palette-tile';
    tile.title = def.label;
    tile.innerHTML =
      def.svgFn(def.defaultPlaces || null) +
      `<div class="palette-tile-label">${def.label}</div>`;
    tile.addEventListener('click', () => handlePaletteClick(def));
    container.appendChild(tile);
  });
}

function handlePaletteClick(def) {
  const dims = defaultDims(def.type, def.defaultPlaces);
  showDimsModal(def, def.defaultPlaces || null, dims.w, dims.d, (places, w, d) => {
    placeModuleOnCanvas(def, places, w, d);
  });
}

// ── Modal saisie dimensions ────────────────────────────────────────────────────

let _modalCallback    = null;
let _modalType        = null;
let selectedProductData = null;  // produit sélectionné dans le dropdown

// Extrait le nombre de places depuis un nom de gamme ("3 places", "2P", "3 Pl."…)
function placesFromRangeName(name) {
  const m = (name || '').match(/(\d+)\s*[Pp](?:l(?:aces?)?)?/);
  return m ? parseInt(m[1]) : null;
}

function showDimsModal(def, defaultPlaces, defaultW, defaultD, callback) {
  _modalCallback = callback;
  _modalType     = def.type;

  const prodName = selectedProductData
    ? (selectedProductData.name + (selectedProductData.collection ? ` — ${selectedProductData.collection}` : ''))
    : null;
  document.getElementById('places-modal-title').textContent =
    prodName ? `${def.label} · ${prodName}` : `Module : ${def.label}`;

  // Ligne "nombre de places" : visible uniquement si askPlaces
  const placesRow = document.getElementById('places-row');
  placesRow.style.display = def.askPlaces ? 'block' : 'none';
  const placesInput = document.getElementById('places-modal-input');
  placesInput.value = defaultPlaces || 2;

  // Labels adaptés selon le module
  const isAngle = def.type.startsWith('angle');
  const isMer   = def.type.startsWith('meridienne');
  document.getElementById('lbl-width').textContent  = isAngle ? 'Côté (cm)'    : isMer ? 'Largeur (cm)'  : 'Largeur (cm)';
  document.getElementById('lbl-depth').textContent  = isAngle ? 'Côté (cm)'    : isMer ? 'Longueur (cm)' : 'Profondeur (cm)';

  document.getElementById('modal-width').value  = defaultW;
  document.getElementById('modal-depth').value  = defaultD;

  // ── Modules du produit sélectionné ──
  const rangeSection  = document.getElementById('range-quick-select');
  const rangeButtons  = document.getElementById('range-buttons');
  rangeButtons.innerHTML = '';

  const productModules = (selectedProductData?.modules ?? [])
    .map(m => ({ ...m, dims: parseDimStr(m.dimensions) }));

  if (productModules.length > 0) {
    rangeSection.style.display = 'block';
    productModules.forEach(m => {
      const btn = document.createElement('button');
      btn.style.cssText = 'padding:4px 9px;font-size:11px;border:1px solid #c8a96e;border-radius:5px;background:white;cursor:pointer;color:#1e293b;white-space:nowrap';
      // Label : nom + dimensions si disponibles
      let label = m.name;
      if (m.dims?.w) label += ` · L.${m.dims.w}`;
      if (m.dims?.d) label += ` × P.${m.dims.d}`;
      else if (m.dimensions) label += ` · ${m.dimensions}`;
      btn.textContent = label;
      btn.addEventListener('mouseenter', () => btn.style.background = '#fef9f0');
      btn.addEventListener('mouseleave', () => btn.style.background = 'white');
      btn.addEventListener('click', () => {
        // Pré-remplir dimensions si parsables
        if (m.dims?.w) document.getElementById('modal-width').value = m.dims.w;
        if (m.dims?.d) document.getElementById('modal-depth').value = m.dims.d;
        // Pré-remplir places depuis le nom du module
        const p = placesFromRangeName(m.name);
        if (p && def.askPlaces) placesInput.value = p;
        // Highlight bouton actif
        rangeButtons.querySelectorAll('button').forEach(b => {
          b.style.background  = 'white';
          b.style.fontWeight  = 'normal';
        });
        btn.style.background  = '#fef3cd';
        btn.style.fontWeight  = '700';
      });
      rangeButtons.appendChild(btn);
    });
  } else {
    rangeSection.style.display = 'none';
  }

  const modal = document.getElementById('places-modal');
  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('modal-width').focus(), 50);
}

function hideDimsModal() {
  document.getElementById('places-modal').style.display = 'none';
  _modalCallback = null;
}

function confirmDimsModal() {
  const def = ALL_DEFS.find(d => d.type === _modalType);
  let places = null;
  if (def && def.askPlaces) {
    places = parseInt(document.getElementById('places-modal-input').value);
    if (isNaN(places) || places < 1 || places > 6) {
      document.getElementById('places-modal-input').style.borderColor = '#ef4444';
      return;
    }
    document.getElementById('places-modal-input').style.borderColor = '';
  }
  const w = parseInt(document.getElementById('modal-width').value);
  const d = parseInt(document.getElementById('modal-depth').value);
  if (isNaN(w) || w < 20 || isNaN(d) || d < 20) {
    document.getElementById('modal-width').style.borderColor  = isNaN(w) || w < 20 ? '#ef4444' : '';
    document.getElementById('modal-depth').style.borderColor = isNaN(d) || d < 20 ? '#ef4444' : '';
    return;
  }
  document.getElementById('modal-width').style.borderColor  = '';
  document.getElementById('modal-depth').style.borderColor = '';
  const cb = _modalCallback;
  hideDimsModal();
  if (cb) cb(places, w, d);
}

// ── Placement d'un module ──────────────────────────────────────────────────────

function placeModuleOnCanvas(def, places, w_cm, d_cm) {
  const wrapper = document.getElementById('canvas-wrapper');
  const cx = Math.round((-panX + wrapper.clientWidth  / 2) / scale);
  const cy = Math.round((-panY + wrapper.clientHeight / 2) / scale);

  const mod = {
    id:       uuid(),
    type:     def.type,
    places:   places,
    w_cm:     w_cm,
    d_cm:     d_cm,
    x:        cx - Math.round(w_cm / 2),
    y:        cy - Math.round(d_cm / 2),
    rotation: 0,
    hasRelax: false,
  };
  canvasModules.push(mod);
  renderModule(mod);
  selectModule(mod.id);
}

// ── Rendu d'un module ──────────────────────────────────────────────────────────

function renderModule(mod) {
  const el = document.createElement('div');
  el.className = 'module-item';
  el.dataset.id = mod.id;

  // SVG
  const svgWrap = document.createElement('div');
  svgWrap.innerHTML = svgForModule(mod);
  const svgEl = svgWrap.querySelector('svg');
  if (svgEl) {
    // Dimensions en cm = pixels à l'échelle 1:1
    svgEl.setAttribute('width',  mod.w_cm);
    svgEl.setAttribute('height', mod.d_cm);
    svgEl.style.display = 'block';
    el.appendChild(svgEl);
  }

  // Overlay actions
  const actions = document.createElement('div');
  actions.className = 'module-actions';
  actions.innerHTML =
    `<button class="action-btn" data-action="rotate-left"  title="Rotation −45°">↺</button>` +
    `<button class="action-btn" data-action="rotate-right" title="Rotation +45°">↻</button>` +
    `<button class="action-btn" data-action="relax"        title="Relax électrique">⚡</button>` +
    `<button class="action-btn" data-action="delete"       title="Supprimer">🗑</button>`;
  actions.addEventListener('mousedown',   e => e.stopPropagation());
  actions.addEventListener('pointerdown', e => e.stopPropagation());
  actions.addEventListener('click', e => {
    const action = e.target.closest('[data-action]');
    if (!action) return;
    if (action.dataset.action === 'rotate-left')  rotateModule(mod.id, -45);
    if (action.dataset.action === 'rotate-right') rotateModule(mod.id,  45);
    if (action.dataset.action === 'relax')        toggleRelax(mod.id);
    if (action.dataset.action === 'delete')       deleteModule(mod.id);
  });
  el.appendChild(actions);

  // Surbrillance ⚡ si relax déjà actif (chargement)
  if (mod.hasRelax) {
    const btn = actions.querySelector('[data-action="relax"]');
    if (btn) btn.style.background = 'rgba(250,204,21,0.35)';
  }

  updateModulePos(el, mod);
  attachDrag(el, mod);
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    selectModule(mod.id);
  });

  document.getElementById('canvas').appendChild(el);
}

function updateModulePos(el, mod) {
  el.style.left      = mod.x + 'px';
  el.style.top       = mod.y + 'px';
  el.style.transform = `rotate(${mod.rotation}deg)`;
}

function selectModule(id) {
  selectedId = id;
  document.querySelectorAll('.module-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === id);
  });
}

function rotateModule(id, delta) {
  const mod = canvasModules.find(m => m.id === id);
  if (!mod) return;
  mod.rotation = ((mod.rotation + delta) % 360 + 360) % 360;
  const el = document.querySelector(`.module-item[data-id="${id}"]`);
  if (el) el.style.transform = `rotate(${mod.rotation}deg)`;
}

function deleteModule(id) {
  canvasModules = canvasModules.filter(m => m.id !== id);
  const el = document.querySelector(`.module-item[data-id="${id}"]`);
  if (el) el.remove();
  if (selectedId === id) selectedId = null;
}

function toggleRelax(id) {
  const mod = canvasModules.find(m => m.id === id);
  if (!mod) return;
  mod.hasRelax = !mod.hasRelax;

  // Remplacer le SVG dans le DOM
  const el = document.querySelector(`.module-item[data-id="${id}"]`);
  if (!el) return;
  const svgWrap = document.createElement('div');
  svgWrap.innerHTML = svgForModule(mod);
  const newSvg = svgWrap.querySelector('svg');
  if (newSvg) {
    newSvg.setAttribute('width',  mod.w_cm);
    newSvg.setAttribute('height', mod.d_cm);
    newSvg.style.display = 'block';
    const oldSvg = el.querySelector('svg');
    if (oldSvg) el.replaceChild(newSvg, oldSvg);
    else el.insertBefore(newSvg, el.firstChild);
  }

  // Mettre en surbrillance le bouton ⚡ si actif
  const btn = el.querySelector('[data-action="relax"]');
  if (btn) btn.style.background = mod.hasRelax ? 'rgba(250,204,21,0.35)' : '';
}

function clearCanvas() {
  if (!confirm('Vider le canvas ? Les modifications non sauvegardées seront perdues.')) return;
  canvasModules = [];
  selectedId = null;
  currentCompositionId = null;
  document.getElementById('canvas').innerHTML = '';
  document.getElementById('composition-name').value = '';
}

// ── Drag (Pointer Events) ──────────────────────────────────────────────────────

function attachDrag(el, mod) {
  let dragging = false;
  let startPX, startPY, startMX, startMY;

  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('.module-actions')) return;
    dragging  = true;
    startPX   = e.clientX;
    startPY   = e.clientY;
    startMX   = mod.x;
    startMY   = mod.y;
    el.setPointerCapture(e.pointerId);
    el.style.zIndex = 100;
    e.stopPropagation();
  });

  el.addEventListener('pointermove', e => {
    if (!dragging) return;
    mod.x = Math.round(startMX + (e.clientX - startPX) / scale);
    mod.y = Math.round(startMY + (e.clientY - startPY) / scale);
    el.style.left = mod.x + 'px';
    el.style.top  = mod.y + 'px';
  });

  el.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    el.style.zIndex = '';
  });
}

// ── Pan & Zoom ─────────────────────────────────────────────────────────────────

let isPanning  = false;
let panStartX, panStartY, panStartTX, panStartTY;
let spaceHeld  = false;

function applyTransform() {
  document.getElementById('canvas').style.transform =
    `translate(${panX}px, ${panY}px) scale(${scale})`;
  document.getElementById('zoom-label').textContent =
    Math.round(scale * 100) + '%';
}

function initPanZoom() {
  const wrapper = document.getElementById('canvas-wrapper');

  wrapper.addEventListener('pointerdown', e => {
    const isMid   = e.button === 1;
    const isSpace = spaceHeld && e.button === 0;
    if (!isMid && !isSpace) return;
    isPanning  = true;
    panStartX  = e.clientX;
    panStartY  = e.clientY;
    panStartTX = panX;
    panStartTY = panY;
    wrapper.setPointerCapture(e.pointerId);
    wrapper.style.cursor = 'grabbing';
    e.preventDefault();
  });

  wrapper.addEventListener('pointermove', e => {
    if (!isPanning) return;
    panX = panStartTX + (e.clientX - panStartX);
    panY = panStartTY + (e.clientY - panStartY);
    applyTransform();
  });

  wrapper.addEventListener('pointerup', () => {
    if (!isPanning) return;
    isPanning = false;
    wrapper.style.cursor = spaceHeld ? 'grab' : '';
  });

  wrapper.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    scale = Math.min(4, Math.max(0.1, scale * delta));
    applyTransform();
  }, { passive: false });

  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !e.target.matches('input,textarea,select')) {
      spaceHeld = true;
      wrapper.style.cursor = 'grab';
      e.preventDefault();
    }
    if (e.code === 'Escape') selectModule(null);
    if ((e.code === 'Delete' || e.code === 'Backspace') && selectedId &&
        !e.target.matches('input,textarea')) {
      deleteModule(selectedId);
    }
  });
  document.addEventListener('keyup', e => {
    if (e.code === 'Space') {
      spaceHeld = false;
      if (!isPanning) wrapper.style.cursor = '';
    }
  });

  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    scale = Math.min(4, scale * 1.2); applyTransform();
  });
  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    scale = Math.max(0.1, scale / 1.2); applyTransform();
  });
  document.getElementById('btn-zoom-reset').addEventListener('click', () => {
    scale = 1; panX = -400; panY = -200; applyTransform();
  });

  document.getElementById('canvas').addEventListener('pointerdown', e => {
    if (e.target === document.getElementById('canvas')) selectModule(null);
  });
}

// ── Miniature thumbnail ────────────────────────────────────────────────────────

function generateThumbnail() {
  if (!canvasModules.length) return '';

  const PAD  = 10;
  const minX = Math.min(...canvasModules.map(m => m.x)) - PAD;
  const minY = Math.min(...canvasModules.map(m => m.y)) - PAD;
  const maxX = Math.max(...canvasModules.map(m => m.x + m.w_cm)) + PAD;
  const maxY = Math.max(...canvasModules.map(m => m.y + m.d_cm)) + PAD;
  const vw   = maxX - minX;
  const vh   = maxY - minY;

  // SVG imbriqués : fidèles au canvas (accoudoirs, dossiers, dimensions)
  const pieces = canvasModules.map(m => {
    const tx  = m.x - minX;
    const ty  = m.y - minY;
    const cx  = tx + m.w_cm / 2;
    const cy  = ty + m.d_cm / 2;
    const rot = m.rotation || 0;
    const inner = svgForModule(m)
      .replace(/^<svg[^>]*>/, '')
      .replace(/<\/svg>\s*$/, '');
    return `<g transform="rotate(${rot},${cx},${cy})">
      <svg x="${tx}" y="${ty}" width="${m.w_cm}" height="${m.d_cm}" viewBox="0 0 ${m.w_cm} ${m.d_cm}" overflow="visible">
        ${inner}
      </svg>
    </g>`;
  }).join('\n');

  return `<svg viewBox="0 0 ${vw} ${vh}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block">
    <rect width="${vw}" height="${vh}" fill="#f8fafc" rx="3"/>
    ${pieces}
  </svg>`;
}

// ── Sauvegarde / Chargement ────────────────────────────────────────────────────

async function saveComposition() {
  const name = document.getElementById('composition-name').value.trim();
  if (!name) { showToast('Donnez un nom à la composition'); return; }
  if (!canvasModules.length) { showToast('Le canvas est vide'); return; }

  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  try {
    const productLabel = document.getElementById('composition-product').value.trim() || null;
    const res = await window.api.compositions.save({
      id:            currentCompositionId || undefined,
      name,
      product_id:    productLabel,
      modules_json:  JSON.stringify(canvasModules),
      thumbnail_svg: generateThumbnail(),
    });
    if (!res.ok) throw new Error(res.error);
    currentCompositionId = res.data.id;
    showToast('Composition enregistrée');
    loadCompositionsList();
  } catch (err) {
    showToast('Erreur : ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

async function loadCompositionsList() {
  const list = document.getElementById('compositions-list');
  try {
    const res = await window.api.compositions.getAll();
    if (!res.ok || !res.data.length) {
      list.innerHTML = '<div style="color:#94a3b8;font-size:12px">Aucune composition.</div>';
      return;
    }
    list.innerHTML = '';
    res.data.forEach(comp => {
      const item = document.createElement('div');
      item.className = 'composition-item';
      const dateStr = new Date(comp.updated_at).toLocaleDateString('fr-FR');
      const thumbHtml = comp.thumbnail_svg
        ? `<div class="composition-item-thumb">${comp.thumbnail_svg}</div>` : '';
      item.innerHTML = `
        ${thumbHtml}
        <div class="composition-item-name">${escHtml(comp.name)}</div>
        ${comp.product_id ? `<div class="composition-item-meta" style="color:#c8a96e;font-style:italic">${escHtml(comp.product_id)}</div>` : ''}
        <div class="composition-item-meta">${dateStr}</div>
        <div class="composition-item-actions">
          <button class="btn-xs btn-xs-primary" data-action="load">📂 Charger</button>
          <button class="btn-xs btn-xs-danger"  data-action="del">🗑 Suppr.</button>
        </div>`;
      item.querySelector('[data-action="load"]').addEventListener('click', e => {
        e.stopPropagation(); loadComposition(comp);
      });
      item.querySelector('[data-action="del"]').addEventListener('click', e => {
        e.stopPropagation(); deleteComposition(comp.id);
      });
      list.appendChild(item);
    });
  } catch (_) {
    list.innerHTML = '<div style="color:#ef4444;font-size:12px">Erreur de chargement</div>';
  }
}

function loadComposition(comp) {
  if (canvasModules.length &&
      !confirm('Charger cette composition ? Le canvas actuel sera remplacé.')) return;
  document.getElementById('canvas').innerHTML = '';
  canvasModules = [];
  selectedId = null;
  currentCompositionId = comp.id;
  document.getElementById('composition-name').value = comp.name;
  document.getElementById('composition-product').value = comp.product_id || '';
  let modules = [];
  try { modules = JSON.parse(comp.modules_json || '[]'); } catch (_) {}
  modules.forEach(mod => {
    // Rétrocompatibilité : anciens modules sans w_cm/d_cm
    if (!mod.w_cm || !mod.d_cm) {
      const dims = defaultDims(mod.type, mod.places);
      mod.w_cm = dims.w;
      mod.d_cm = dims.d;
    }
    canvasModules.push(mod);
    renderModule(mod);
  });
  showToast(`"${comp.name}" chargé`);
}

async function deleteComposition(id) {
  if (!confirm('Supprimer cette composition ?')) return;
  try {
    const res = await window.api.compositions.delete(id);
    if (!res.ok) throw new Error(res.error);
    if (currentCompositionId === id) {
      currentCompositionId = null;
      document.getElementById('composition-name').value = '';
    }
    showToast('Composition supprimée');
    loadCompositionsList();
  } catch (err) {
    showToast('Erreur : ' + err.message);
  }
}

// ── Chargement des produits du catalogue ──────────────────────────────────────

async function loadProducts() {
  const sel = document.getElementById('product-select');
  try {
    const res = await window.api.products.getAll();
    sel.innerHTML = '<option value="">— Produit (optionnel) —</option>';
    if (!res.ok || !res.data?.length) {
      if (!res.ok) {
        const opt = document.createElement('option');
        opt.disabled = true;
        opt.textContent = '⚠ Catalogue non disponible';
        sel.appendChild(opt);
      }
      return;
    }
    // Regrouper par fournisseur
    const bySupplier = {};
    res.data.forEach(p => {
      const sup = p.supplier_name || 'Autres';
      if (!bySupplier[sup]) bySupplier[sup] = [];
      bySupplier[sup].push(p);
    });
    Object.entries(bySupplier).sort(([a],[b]) => a.localeCompare(b)).forEach(([sup, products]) => {
      const grp = document.createElement('optgroup');
      grp.label = sup;
      products.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name + (p.collection ? ` — ${p.collection}` : '');
        grp.appendChild(opt);
      });
      sel.appendChild(grp);
    });
    // Synchroniser avec le champ texte + stocker les données complètes du produit
    sel.addEventListener('change', () => {
      const chosen = res.data.find(p => p.id === sel.value);
      selectedProductData = chosen || null;
      if (chosen) {
        document.getElementById('composition-product').value =
          chosen.name + (chosen.collection ? ` — ${chosen.collection}` : '');
        // Debug : afficher les gammes dans la console
        console.log('[Compositions] Produit sélectionné :', chosen.name);
        console.log('[Compositions] Gammes :', JSON.stringify(chosen.ranges?.map(r => ({
          name: r.name, dimensions: r.dimensions
        })), null, 2));
      } else {
        document.getElementById('composition-product').value = '';
      }
    });
  } catch (e) {
    sel.innerHTML = '<option value="">— Produit (optionnel) —</option>';
    console.warn('loadProducts:', e.message);
  }
}

// ── Toast ──────────────────────────────────────────────────────────────────────

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2500);
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Init ───────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  buildPaletteGrid('palette-sofas',   SOFA_DEFS);
  buildPaletteGrid('palette-corners', CORNER_DEFS);
  buildPaletteGrid('palette-tables',  TABLE_DEFS);

  applyTransform();
  initPanZoom();

  document.getElementById('btn-save').addEventListener('click', saveComposition);
  document.getElementById('btn-clear-canvas').addEventListener('click', clearCanvas);

  // Modal boutons
  document.getElementById('places-modal-ok').addEventListener('click', confirmDimsModal);
  document.getElementById('places-modal-cancel').addEventListener('click', hideDimsModal);

  // Raccourcis clavier modal
  document.getElementById('places-modal').addEventListener('keydown', e => {
    if (e.key === 'Enter')  confirmDimsModal();
    if (e.key === 'Escape') hideDimsModal();
  });

  // Clic fond = annuler
  document.getElementById('places-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('places-modal')) hideDimsModal();
  });

  // Auto-calcul largeur quand le nombre de places change
  document.getElementById('places-modal-input').addEventListener('input', () => {
    const n = parseInt(document.getElementById('places-modal-input').value);
    if (!isNaN(n) && _modalType) {
      const dims = defaultDims(_modalType, n);
      document.getElementById('modal-width').value = dims.w;
    }
  });

  loadProducts();
  loadCompositionsList();
});
