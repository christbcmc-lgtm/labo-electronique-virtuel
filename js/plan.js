/* ==========================================================================
   PLAN BÂTIMENT — éditeur de plan d'architecture et d'électricité, intégré
   à partir d'un prototype autonome fourni par le client (référence à
   analyser/adapter, pas une architecture définitive imposée — voir §29/§34
   des mises à jour reçues). Rendu 2D en SVG, unité interne : mm, accrochages
   et commandes façon CAO (murs, ouvertures, symboles électriques, circuits,
   cotation, exports SVG/PNG/PDF).
   --------------------------------------------------------------------------
   Tout le moteur (état, géométrie, rendu, outils, interactions) est isolé
   dans une IIFE : le prototype d'origine définissait `esc`, `uid`, `toast`,
   `$`... au top niveau d'un script classique, des noms déjà utilisés par
   js/config.js, js/backend.js, js/app.js — sans cette IIFE, le chargement
   provoquerait une SyntaxError ("Identifier has already been declared") et
   casserait toute l'application. Seule une petite API publique est exposée :
   window.AtelierPlanEditor.mount(root, storage, opts) / .unmount().
   Persistance : par projet (db.getPlan/db.savePlan, même principe que le
   devis — voir js/backend.js et §22/§23). viewPlan()/afterPlanView() tout en
   bas de ce fichier branchent ce module sur le routeur SPA (js/app.js), sur
   le même modèle que js/devis.js et js/dimensionnement.js.
   ========================================================================== */
(function(){
'use strict';

/* =====================================================================
   1. CONSTANTES — toutes les valeurs de conception sont modifiables ici
   ===================================================================== */
const CONFIG = {
  unit: 'mm',
  paperScales: [20, 50, 100, 200],
  defaultScale: 50,
  grid: { minor: 100, major: 1000 },
  snapPx: 10,
  polarAngles: [0, 15, 30, 45, 60, 75, 90],
  paper: { symbol: 6, text: 2.5, tick: 1.5, north: 15 },
  lineweight: { fine: 0.13, normal: 0.25, medium: 0.35, thick: 0.5, cut: 0.7 },
  wall:   { exterieur: { t: 250 }, porteur: { t: 200 }, cloison: { t: 100 }, height: 2800 },
  door:   { interieure: { w: 900, h: 2100 }, wc: { w: 800, h: 2100 }, entree: { w: 1000, h: 2100 },
            double: { w: 1400, h: 2100 }, coulissante: { w: 1500, h: 2100 } },
  window: { standard: { w: 1200, h: 1200, sill: 900 }, petite: { w: 600, h: 600, sill: 1500 },
            baie: { w: 1800, h: 2200, sill: 0 } },
  column: { sizes: [200, 250, 300], height: 2800 },
  beam:   { b: 200, h: 400 },
  slab:   { t: 150 },
  stair:  { width: 1000, riser: 175, tread: 270 },
  elecHeights: { prise: 300, prisePlanTravail: 1100, interrupteur: 1100, tableau: 1500, applique: 1900, plafond: 2500 },
  sheets: { A3: { w: 420, h: 297 }, A4: { w: 297, h: 210 } },
};

// Règles indicatives (NF C 15-100, référence courante en Afrique francophone) — à valider avec la
// réglementation locale ; jamais présentées comme une certitude réglementaire dans l'interface.
const RULES = {
  circuits: {
    eclairage:  { label: 'Éclairage',              prot: 16, section: 1.5, maxPoints: 8 },
    prises16:   { label: 'Prises 16 A',            prot: 16, section: 1.5, maxSocles: 5 },
    prises20:   { label: 'Prises 20 A',            prot: 20, section: 2.5, maxSocles: 8 },
    specialise: { label: 'Spécialisé (LL, LV, FO…)', prot: 20, section: 2.5 },
    cuisson:    { label: 'Cuisson',                prot: 32, section: 6 },
    chauffeEau: { label: 'Chauffe-eau',            prot: 20, section: 2.5 },
    vmc:        { label: 'VMC',                    prot: 2,  section: 1.5 },
  },
  prisesMin: { sejour: 5, chambre: 3, cuisine: 6, salle_eau: 1, entree: 1, couloir: 1 },
  cuisinePlanTravailMin: 4,
  volt: 230,
};
const TAG_POWER = { LL: 2500, LV: 2500, SL: 2500, FO: 3000, CG: 150, CE: 2000, CUIS: 7000 };
const CIRCUIT_COLORS = ['#ec407a', '#ffb300', '#26c6da', '#66bb6a', '#ab47bc', '#ff7043', '#42a5f5', '#d4e157'];

const OPT = {
  wallKind: [['exterieur', 'Extérieur'], ['porteur', 'Porteur'], ['cloison', 'Cloison']],
  openKind: [['porte', 'Porte battante'], ['double', 'Porte double'], ['coulissante', 'Coulissante'], ['fenetre', 'Fenêtre'], ['baie', 'Baie / porte-fenêtre']],
  swing: [['left', 'Gond à gauche'], ['right', 'Gond à droite']],
  side: [[1, 'Côté +'], [-1, 'Côté −']],
  roomKind: [['sejour', 'Séjour'], ['chambre', 'Chambre'], ['cuisine', 'Cuisine'], ['salle_eau', "Salle d'eau"], ['wc', 'WC'], ['entree', 'Entrée'], ['couloir', 'Couloir'], ['autre', 'Autre']],
  furn: [['wc', 'WC'], ['lavabo', 'Lavabo'], ['douche', 'Douche'], ['baignoire', 'Baignoire'], ['evier', 'Évier'], ['lit', 'Lit'], ['table', 'Table'], ['canape', 'Canapé'], ['armoire', 'Armoire']],
};
const FURN_SIZE = { wc: [380, 700], lavabo: [600, 450], douche: [900, 900], baignoire: [1700, 700], evier: [1200, 600], lit: [1400, 1900], table: [1200, 800], canape: [2000, 900], armoire: [1200, 600] };

const LAYERS0 = [
  ['A-MUR', 'Murs', '#f0f0f0', 'thick', 'continu', '#000000'],
  ['A-CLOISON', 'Cloisons', '#cfcfcf', 'medium', 'continu', '#333333'],
  ['A-OUVERTURE', 'Ouvertures', '#4fc3f7', 'normal', 'continu', '#0b5c8a'],
  ['A-ESCALIER', 'Escaliers', '#b0bec5', 'normal', 'continu', '#455a64'],
  ['A-MOBILIER', 'Mobilier', '#8d8d8d', 'fine', 'continu', '#666666'],
  ['A-PIECE', 'Pièces', '#ffd54f', 'fine', 'continu', '#7a5c00'],
  ['A-COTE', 'Cotes', '#81c784', 'fine', 'continu', '#2e7d32'],
  ['A-AXE', 'Axes', '#ef5350', 'fine', 'mixte', '#c62828'],
  ['A-TEXTE', 'Textes', '#ffffff', 'fine', 'continu', '#000000'],
  ['A-GEN', 'Général', '#e0e0e0', 'normal', 'continu', '#000000'],
  ['S-POTEAU', 'Poteaux', '#ff9800', 'thick', 'continu', '#000000'],
  ['S-POUTRE', 'Poutres', '#ff9800', 'medium', 'tirets', '#555555'],
  ['S-DALLE', 'Dalles', '#a1887f', 'normal', 'mixte', '#6d4c41'],
  ['E-ECLAIRAGE', 'Éclairage', '#ffee58', 'normal', 'continu', '#8a6d00'],
  ['E-COMMANDE', 'Commandes', '#26c6da', 'normal', 'continu', '#00727f'],
  ['E-PRISE', 'Prises', '#ec407a', 'normal', 'continu', '#ad1457'],
  ['E-TABLEAU', 'Tableau / équipements', '#ffffff', 'medium', 'continu', '#000000'],
  ['E-CABLE', 'Câbles', '#9e9e9e', 'fine', 'continu', '#555555'],
];

const TXT = (t, y, fs) => `<text y="${y===undefined?0.9:y}" font-size="${fs||2.6}" text-anchor="middle" fill="currentColor" stroke="none" font-family="Arial,sans-serif">${t}</text>`;
const X3 = '<path d="M-2.1-2.1L2.1 2.1M-2.1 2.1L2.1-2.1"/>';
const SYMBOLS = {
  lum_plafond:    { cat: 'Éclairage', label: 'Point lumineux plafond', layer: 'E-ECLAIRAGE', attach: 'ceiling', h: 2500, power: 100, svg: `<circle r="3"/>${X3}` },
  applique:       { cat: 'Éclairage', label: 'Applique murale', layer: 'E-ECLAIRAGE', attach: 'wall', h: 1900, power: 60, svg: '<circle r="3"/><path d="M-4.5-3V3M-4.5 0H-3"/>' },
  spot:           { cat: 'Éclairage', label: 'Spot encastré', layer: 'E-ECLAIRAGE', attach: 'ceiling', h: 2500, power: 35, svg: '<circle r="3"/><circle r="1" fill="currentColor"/>' },
  reglette:       { cat: 'Éclairage', label: 'Réglette', layer: 'E-ECLAIRAGE', attach: 'ceiling', h: 2500, power: 36, svg: '<rect x="-5" y="-1.5" width="10" height="3"/>' },
  projecteur_ext: { cat: 'Éclairage', label: 'Projecteur extérieur', layer: 'E-ECLAIRAGE', attach: 'wall', h: 2500, power: 150, svg: `<circle r="3"/>${X3}<path d="M-4.6-3A5 5 0 0 0-4.6 3" />` },
  baes:           { cat: 'Éclairage', label: 'Éclairage de secours', layer: 'E-ECLAIRAGE', attach: 'wall', h: 2200, power: 5, svg: '<rect x="-4" y="-2.5" width="8" height="5"/><path d="M-4-2.5H4L-4 2.5Z" fill="currentColor"/>' },
  inter_simple:   { cat: 'Commandes', label: 'Interrupteur simple', layer: 'E-COMMANDE', attach: 'wall', h: 1100, power: 0, svg: '<circle r="1.6" fill="currentColor"/><path d="M0 0L4-4M3.2-4.8L4.8-3.2"/>' },
  inter_double:   { cat: 'Commandes', label: 'Interrupteur double', layer: 'E-COMMANDE', attach: 'wall', h: 1100, power: 0, svg: '<circle r="1.6" fill="currentColor"/><path d="M0 0L4-4M3.2-4.8L4.8-3.2M1.8-3.4L3.4-1.8"/>' },
  va_et_vient:    { cat: 'Commandes', label: 'Va-et-vient', layer: 'E-COMMANDE', attach: 'wall', h: 1100, power: 0, svg: '<circle r="1.6" fill="currentColor"/><path d="M0 0L4-4M3.2-4.8L4.8-3.2M0 0L-4 4M-4.8 3.2L-3.2 4.8"/>' },
  variateur:      { cat: 'Commandes', label: 'Variateur', layer: 'E-COMMANDE', attach: 'wall', h: 1100, power: 0, svg: '<circle r="1.6" fill="currentColor"/><path d="M0 0L4-4M3.2-4.8L4.8-3.2M-1.6 4H1.6L0 1.8Z"/>' },
  bp:             { cat: 'Commandes', label: 'Bouton-poussoir', layer: 'E-COMMANDE', attach: 'wall', h: 1100, power: 0, svg: `<circle r="3"/>${TXT('BP')}` },
  detecteur:      { cat: 'Commandes', label: 'Détecteur de présence', layer: 'E-COMMANDE', attach: 'wall', h: 2200, power: 5, svg: `<circle r="3"/>${TXT('D')}` },
  prise16:        { cat: 'Prises', label: 'Prise 2P+T 16 A', layer: 'E-PRISE', attach: 'wall', h: 300, power: 200, svg: '<circle r="3"/><path d="M0-3A3 3 0 0 1 0 3Z" fill="currentColor"/>' },
  prise20:        { cat: 'Prises', label: 'Prise 20 A', layer: 'E-PRISE', attach: 'wall', h: 300, power: 300, tag: '20', svg: '<circle r="3"/><path d="M0-3A3 3 0 0 1 0 3Z" fill="currentColor"/>' },
  prise_specialisee: { cat: 'Prises', label: 'Prise spécialisée', layer: 'E-PRISE', attach: 'wall', h: 300, power: 2500, tag: 'LL', svg: '<circle r="3"/><path d="M0-3A3 3 0 0 1 0 3Z" fill="currentColor"/>' },
  prise_plan_travail: { cat: 'Prises', label: 'Prise plan de travail', layer: 'E-PRISE', attach: 'wall', h: 1100, power: 300, svg: '<circle r="3"/><path d="M0-3A3 3 0 0 1 0 3Z" fill="currentColor"/>' },
  prise_etanche:  { cat: 'Prises', label: 'Prise étanche', layer: 'E-PRISE', attach: 'wall', h: 300, power: 200, tag: 'IP', svg: '<circle r="3"/><path d="M0-3A3 3 0 0 1 0 3Z" fill="currentColor"/>' },
  sortie_cable:   { cat: 'Prises', label: 'Sortie de câble', layer: 'E-PRISE', attach: 'wall', h: 300, power: 7000, tag: 'CUIS', svg: `<circle r="3"/>${X3.replace('/>', ' stroke-width="0.55"/>')}` },
  rj45:           { cat: 'Prises', label: 'Prise RJ45', layer: 'E-PRISE', attach: 'wall', h: 300, power: 0, nocirc: true, svg: `<rect x="-3" y="-3" width="6" height="6"/>${TXT('RJ', 0.85, 2.3)}` },
  tv:             { cat: 'Prises', label: 'Prise TV', layer: 'E-PRISE', attach: 'wall', h: 300, power: 0, nocirc: true, svg: `<rect x="-3" y="-3" width="6" height="6"/>${TXT('TV', 0.85, 2.3)}` },
  tableau:        { cat: 'Distribution', label: 'Tableau de répartition', layer: 'E-TABLEAU', attach: 'wall', h: 1500, power: 0, nocirc: true, svg: '<rect x="-5" y="-3.5" width="10" height="7" fill="currentColor"/>' },
  coffret_com:    { cat: 'Distribution', label: 'Coffret de communication', layer: 'E-TABLEAU', attach: 'wall', h: 1500, power: 0, nocirc: true, svg: `<rect x="-5" y="-3.5" width="10" height="7"/>${TXT('GTL', 0.85, 2.4)}` },
  compteur:       { cat: 'Distribution', label: 'Compteur / disjoncteur de branchement', layer: 'E-TABLEAU', attach: 'wall', h: 1500, power: 0, nocirc: true, svg: `<rect x="-5" y="-3.5" width="10" height="7"/>${TXT('CPT', 0.85, 2.4)}` },
  boite_derivation: { cat: 'Distribution', label: 'Boîte de dérivation', layer: 'E-TABLEAU', attach: 'ceiling', h: 2500, power: 0, nocirc: true, svg: '<rect x="-2.5" y="-2.5" width="5" height="5"/><circle r="0.7" fill="currentColor"/>' },
  vmc:            { cat: 'Équipements', label: 'VMC', layer: 'E-TABLEAU', attach: 'ceiling', h: 2500, power: 30, svg: `<circle r="3"/>${TXT('V')}` },
  ventilateur:    { cat: 'Équipements', label: 'Ventilateur', layer: 'E-TABLEAU', attach: 'wall', h: 2200, power: 40, svg: '<circle r="3"/><path d="M0-2.2V2.2M-2.2 0H2.2"/>' },
  chauffe_eau:    { cat: 'Équipements', label: 'Chauffe-eau', layer: 'E-TABLEAU', attach: 'wall', h: 1800, power: 2000, svg: `<rect x="-4" y="-3" width="8" height="6"/>${TXT('CE', 0.85, 2.4)}` },
  clim:           { cat: 'Équipements', label: 'Climatiseur', layer: 'E-TABLEAU', attach: 'wall', h: 2200, power: 1500, svg: `<rect x="-5" y="-2.5" width="10" height="5"/>${TXT('AC', 0.85, 2.4)}` },
  radiateur:      { cat: 'Équipements', label: 'Radiateur', layer: 'E-TABLEAU', attach: 'wall', h: 300, power: 1500, svg: '<rect x="-5" y="-2" width="10" height="4"/><path d="M-2.5-2V2M0-2V2M2.5-2V2"/>' },
  daaf:           { cat: 'Équipements', label: 'Détecteur de fumée', layer: 'E-TABLEAU', attach: 'ceiling', h: 2500, power: 0, nocirc: true, svg: `<circle r="3"/>${TXT('F')}` },
  terre:          { cat: 'Équipements', label: 'Prise de terre', layer: 'E-TABLEAU', attach: 'free', h: 0, power: 0, nocirc: true, svg: '<path d="M0-3V0M-3 0H3M-2 1.5H2M-1 3H1"/>' },
};
const SYM_CATS = ['Éclairage', 'Commandes', 'Prises', 'Distribution', 'Équipements'];
const LIGHT_SYMS = ['lum_plafond', 'applique', 'spot', 'reglette', 'projecteur_ext'];
const SOCKET_SYMS = ['prise16', 'prise20', 'prise_specialisee', 'prise_plan_travail', 'prise_etanche'];
const PRISE_COUNT_SYMS = ['prise16', 'prise20', 'prise_plan_travail', 'prise_etanche'];

/* =====================================================================
   2. UTILITAIRES (fonctions pures, aucun accès DOM)
   ===================================================================== */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => (p || 'e') + '_' + Math.random().toString(36).slice(2, 8);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const vlen = a => Math.hypot(a.x, a.y);
const unit = a => { const l = vlen(a); return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 1, y: 0 }; };
const normal = u => ({ x: -u.y, y: u.x });
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const cp = p => ({ x: p.x, y: p.y });
const num = (v, d) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : (d === undefined ? 0 : d); };
const fr = (n, d) => n.toFixed(d === undefined ? 2 : d).replace('.', ',');
const rotP = (p, c, a) => { const co = Math.cos(a), si = Math.sin(a), x = p.x - c.x, y = p.y - c.y; return { x: c.x + x * co - y * si, y: c.y + x * si + y * co }; };

function distPtSeg(p, a, b) {
  const v = sub(b, a), l2 = v.x * v.x + v.y * v.y;
  let t = l2 ? dot(sub(p, a), v) / l2 : 0; t = clamp(t, 0, 1);
  const q = { x: a.x + v.x * t, y: a.y + v.y * t };
  return { d: dist(p, q), t, q };
}
function segInter(a, b, c, d) {
  const r = sub(b, a), s = sub(d, c), den = cross(r, s);
  if (Math.abs(den) < 1e-9) return null;
  const qp = sub(c, a), t = cross(qp, s) / den, u = cross(qp, r) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { x: a.x + r.x * t, y: a.y + r.y * t, t, u };
}
function lineInter(p1, d1, p2, d2) {
  const den = cross(d1, d2); if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(p2, p1), d2) / den;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
}
function polyArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } return a / 2; }
function centroid(pts) {
  const A = polyArea(pts);
  if (Math.abs(A) < 1e-6) return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  let cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length], f = p.x * q.y - q.x * p.y; cx += (p.x + q.x) * f; cy += (p.y + q.y) * f; }
  return { x: cx / (6 * A), y: cy / (6 * A) };
}
function pointInPoly(p, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
function distPoly(p, pts, closed) {
  let m = Infinity; const n = pts.length;
  for (let i = 0; i < n - (closed ? 0 : 1); i++) m = Math.min(m, distPtSeg(p, pts[i], pts[(i + 1) % n]).d);
  return m;
}
function bboxPts(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
}
function download(name, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* =====================================================================
   3. ÉTAT — recréé à chaque mount() (voir tout en bas), afin qu'ouvrir un
   autre projet reparte toujours d'un état propre plutôt que de fusionner
   avec un plan précédemment ouvert dans la même session.
   ===================================================================== */
function newProject() {
  return {
    version: 1,
    meta: { name: 'Nouveau plan', scale: CONFIG.defaultScale, sheet: 'A3', projet: '', titre: 'Plan électrique', auteur: '',
            date: new Date().toISOString().slice(0, 10), indice: 'A', planche: '1/1', sheetOrigin: null, dimUnit: 'mm' },
    levels: [{ id: 'L0', name: 'RDC', elevation: 0, height: CONFIG.wall.height }],
    layers: LAYERS0.map(([id, name, color, lw, lt, pc]) => ({ id, name, color, lw, lt, pc, visible: true, locked: false })),
    circuits: [],
    entities: [],
  };
}
// `S` référencé par (presque) toutes les fonctions ci-dessous via fermeture sur ce `let` — mount()
// lui réassigne un objet frais à chaque montage, ce que toutes ces fonctions voient automatiquement.
let S = null;
function freshState() {
  return {
    P: newProject(), view: { x: 0, y: 0, z: 0.08 }, level: 'L0', layer: 'A-GEN',
    tool: 'select', toolArg: null, draft: null, sel: new Set(),
    snap: { grid: true, ortho: false, osnap: true, polar: false },
    cursorRaw: { x: 0, y: 0 }, cursor: { x: 0, y: 0 }, snapHit: null, ref: null,
    undo: [], redo: [], activeCircuit: null, showSheet: false,
    opts: { wallKind: 'porteur', roomKind: 'sejour', cableCurve: true, colSize: 200, furn: 'lit', tmpRot: 0, swing: 'left', offsetDist: 500, chain: false },
    spaceDown: false, panMode: false, geoVer: 0, lastCmd: null, clip: null, tab: 'props',
    tabRibbon: 'archi', dirty: false, shift: false, readOnly: false,
  };
}

let idxVer = -1, idxMap = new Map();
const idx = () => { if (idxVer !== S.geoVer) { idxMap = new Map(S.P.entities.map(e => [e.id, e])); idxVer = S.geoVer; } return idxMap; };
const byId = id => idx().get(id);
const touch = () => { S.geoVer++; };
const lay = id => S.P.layers.find(l => l.id === id) || S.P.layers.find(l => l.id === 'A-GEN') || S.P.layers[0];
const layerVis = id => { const l = S.P.layers.find(x => x.id === id); return !l || l.visible; };
const layerLocked = id => { const l = S.P.layers.find(x => x.id === id); return !!(l && l.locked); };
const curLevel = () => S.P.levels.find(l => l.id === S.level) || S.P.levels[0];
const circuitOf = id => S.P.circuits.find(c => c.id === id) || null;
const SC = () => S.P.meta.scale;
const visibleEnts = () => S.P.entities.filter(e => e.level === S.level && layerVis(e.layer));
const selectable = e => e.level === S.level && layerVis(e.layer) && !layerLocked(e.layer) && !S.readOnly;
const selEnts = () => [...S.sel].map(byId).filter(Boolean);
function mk(type, props, layer) { return { id: uid(), type, level: S.level, layer: layer || S.layer, ...props }; }

/* =====================================================================
   4. GÉOMÉTRIE DES ENTITÉS
   ===================================================================== */
function wallDir(w) { return unit(sub(w.b, w.a)); }
function wallLen(w) { return dist(w.a, w.b); }
function openingSeg(o) {
  const w = byId(o.wall); if (!w) return null;
  const u = wallDir(w);
  return { w, u, p1: add(w.a, mul(u, o.offset)), p2: add(w.a, mul(u, o.offset + o.w)) };
}
function fixOpening(o) {
  const w = byId(o.wall); if (!w) return;
  const L = wallLen(w);
  o.w = clamp(o.w, 100, Math.max(100, L));
  o.offset = clamp(o.offset, 0, Math.max(0, L - o.w));
}
function fixOpeningsOf(wallId) { S.P.entities.forEach(e => { if (e.type === 'opening' && e.wall === wallId) fixOpening(e); }); }

function stairLen(e) { return e.n * e.tread; }
function stairCorners(e) {
  const c = { x: e.x, y: e.y }, a = rad(e.rot || 0), L = stairLen(e), W = e.w;
  return [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: W }, { x: 0, y: W }].map(p => rotP({ x: e.x + p.x, y: e.y + p.y }, c, a));
}
function furnCorners(e) {
  const c = { x: e.x, y: e.y }, a = rad(e.rot || 0);
  return [[-e.w / 2, -e.h / 2], [e.w / 2, -e.h / 2], [e.w / 2, e.h / 2], [-e.w / 2, e.h / 2]].map(([x, y]) => rotP({ x: e.x + x, y: e.y + y }, c, a));
}
function columnCorners(e) {
  const c = { x: e.x, y: e.y }, a = rad(e.rot || 0), h = e.s / 2;
  return [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, y]) => rotP({ x: e.x + x, y: e.y + y }, c, a));
}
function dimGeom(e) {
  const d = unit(sub(e.p2, e.p1)), n = normal(d);
  return { d, n, q1: add(e.p1, mul(n, e.off)), q2: add(e.p2, mul(n, e.off)) };
}
function textBox(e) {
  const sc = SC(), h = (e.size || CONFIG.paper.text) * sc, lines = String(e.text).split('\n');
  const w = Math.max(...lines.map(l => l.length)) * h * 0.58;
  return { w, h: h * lines.length * 1.2 };
}
function bboxOf(e) {
  switch (e.type) {
    case 'wall': { const b = bboxPts([e.a, e.b]), t = e.t / 2; return { x0: b.x0 - t, y0: b.y0 - t, x1: b.x1 + t, y1: b.y1 + t }; }
    case 'beam': { const b = bboxPts([e.a, e.b]), t = e.bw / 2; return { x0: b.x0 - t, y0: b.y0 - t, x1: b.x1 + t, y1: b.y1 + t }; }
    case 'line': case 'axis': return bboxPts([e.a, e.b]);
    case 'polyline': case 'room': case 'slab': case 'cable': return bboxPts(e.pts);
    case 'circle': return { x0: e.c.x - e.r, y0: e.c.y - e.r, x1: e.c.x + e.r, y1: e.c.y + e.r };
    case 'column': return bboxPts(columnCorners(e));
    case 'stair': return bboxPts(stairCorners(e));
    case 'furniture': return bboxPts(furnCorners(e));
    case 'symbol': { const r = 5 * SC(); return { x0: e.x - r, y0: e.y - r, x1: e.x + r, y1: e.y + r }; }
    case 'opening': { const g = openingSeg(e); if (!g) return { x0: 0, y0: 0, x1: 0, y1: 0 }; const b = bboxPts([g.p1, g.p2]), t = g.w.t / 2; return { x0: b.x0 - t, y0: b.y0 - t, x1: b.x1 + t, y1: b.y1 + t }; }
    case 'dim': { const g = dimGeom(e); return bboxPts([e.p1, e.p2, g.q1, g.q2]); }
    case 'text': { const b = textBox(e); return { x0: e.x, y0: e.y - b.h, x1: e.x + b.w, y1: e.y + b.h * 0.2 }; }
  }
  return { x0: 0, y0: 0, x1: 0, y1: 0 };
}
const HIT_RANK = { symbol: 0, opening: 1, text: 1, dim: 2, cable: 3, column: 3, wall: 4, beam: 4, stair: 4, furniture: 4, line: 5, polyline: 5, circle: 5, axis: 5, room: 8, slab: 9 };
function hitDist(e, p) {
  switch (e.type) {
    case 'wall': return Math.max(0, distPtSeg(p, e.a, e.b).d - e.t / 2);
    case 'beam': return Math.max(0, distPtSeg(p, e.a, e.b).d - e.bw / 2);
    case 'line': case 'axis': return distPtSeg(p, e.a, e.b).d;
    case 'polyline': return e.closed ? distPoly(p, e.pts, true) : distPoly(p, e.pts, false);
    case 'cable': return distPoly(p, e.pts, false);
    case 'circle': return Math.abs(dist(p, e.c) - e.r);
    case 'symbol': return Math.max(0, dist(p, e) - 3.5 * SC());
    case 'column': return pointInPoly(p, columnCorners(e)) ? 0 : distPoly(p, columnCorners(e), true);
    case 'stair': return pointInPoly(p, stairCorners(e)) ? 0 : distPoly(p, stairCorners(e), true);
    case 'furniture': return pointInPoly(p, furnCorners(e)) ? 0 : distPoly(p, furnCorners(e), true);
    case 'room': case 'slab': return pointInPoly(p, e.pts) ? 0 : distPoly(p, e.pts, true);
    case 'opening': { const g = openingSeg(e); return g ? Math.max(0, distPtSeg(p, g.p1, g.p2).d - g.w.t / 2) : Infinity; }
    case 'dim': { const g = dimGeom(e); return Math.min(distPtSeg(p, g.q1, g.q2).d, distPtSeg(p, e.p1, g.q1).d, distPtSeg(p, e.p2, g.q2).d); }
    case 'text': { const b = textBox(e); return (p.x >= e.x && p.x <= e.x + b.w && p.y >= e.y - b.h && p.y <= e.y + b.h * 0.2) ? 0 : Infinity; }
  }
  return Infinity;
}
function pickAt(p, tol, types) {
  let best = null;
  for (const e of S.P.entities) {
    if (!selectable(e) || (types && !types.includes(e.type))) continue;
    const d = hitDist(e, p);
    if (d > tol) continue;
    const rank = HIT_RANK[e.type] ?? 6;
    if (!best || rank < best.rank || (rank === best.rank && d <= best.d)) best = { e, d, rank };
  }
  return best ? best.e : null;
}

function gripsOf(e) {
  const g = [];
  const G = (x, y, fn, k) => g.push({ x, y, fn, k: k || 'pt' });
  switch (e.type) {
    case 'wall': case 'line': case 'beam': case 'axis': {
      const a0 = cp(e.a), b0 = cp(e.b), m = mid(a0, b0);
      G(a0.x, a0.y, p => { e.a = cp(p); });
      G(b0.x, b0.y, p => { e.b = cp(p); });
      G(m.x, m.y, p => { const dx = p.x - m.x, dy = p.y - m.y; e.a = { x: a0.x + dx, y: a0.y + dy }; e.b = { x: b0.x + dx, y: b0.y + dy }; }, 'mid');
      break;
    }
    case 'polyline': case 'room': case 'slab': case 'cable':
      e.pts.forEach((pt, i) => G(pt.x, pt.y, p => { e.pts[i] = cp(p); }));
      break;
    case 'circle': G(e.c.x, e.c.y, p => { e.c = cp(p); }); G(e.c.x + e.r, e.c.y, p => { e.r = Math.max(1, dist(p, e.c)); }); break;
    case 'column': case 'symbol': case 'furniture': case 'text': case 'stair':
      G(e.x, e.y, p => { e.x = p.x; e.y = p.y; }, 'mid'); break;
    case 'opening': {
      const s = openingSeg(e); if (!s) break; const c = mid(s.p1, s.p2);
      G(c.x, c.y, p => { e.offset = dot(sub(p, s.w.a), s.u) - e.w / 2; fixOpening(e); }, 'mid'); break;
    }
    case 'dim': {
      const d = dimGeom(e), m = mid(d.q1, d.q2);
      G(e.p1.x, e.p1.y, p => { e.p1 = cp(p); }); G(e.p2.x, e.p2.y, p => { e.p2 = cp(p); });
      G(m.x, m.y, p => { const dd = dimGeom(e); e.off = dot(sub(p, e.p1), dd.n); }, 'mid'); break;
    }
  }
  return g;
}

function xform(e, m) {
  const mp = m.p;
  switch (e.type) {
    case 'wall': case 'line': case 'beam': case 'axis': e.a = mp(e.a); e.b = mp(e.b); break;
    case 'polyline': case 'room': case 'slab': case 'cable': e.pts = e.pts.map(mp); break;
    case 'circle': e.c = mp(e.c); if (m.k) e.r *= m.k; break;
    case 'column': case 'symbol': case 'furniture': case 'stair': case 'text': {
      const q = mp({ x: e.x, y: e.y }); e.x = q.x; e.y = q.y;
      e.rot = m.rot ? m.rot(e.rot || 0) : (e.rot || 0);
      break;
    }
    case 'dim': e.p1 = mp(e.p1); e.p2 = mp(e.p2); if (m.flip) e.off = -e.off; if (m.k) e.off *= m.k; break;
  }
}
function applyXform(ents, m) {
  const ids = new Set(ents.map(e => e.id));
  for (const e of ents) if (e.type !== 'opening') xform(e, m);
  for (const e of S.P.entities) {
    if (e.type !== 'opening') continue;
    if (ids.has(e.wall)) { if (m.flip) e.side = -e.side; if (m.k) e.offset *= m.k; fixOpening(e); }
    else if (ids.has(e.id) && m.delta) { const s = openingSeg(e); if (s) { e.offset += dot(m.delta, s.u); fixOpening(e); } }
  }
}
function cloneSet(ents, keepIds) {
  const map = new Map(), out = [];
  for (const e of ents) if (e.type !== 'opening') { const c = JSON.parse(JSON.stringify(e)); if (!keepIds) c.id = uid(); map.set(e.id, c.id); out.push(c); }
  for (const o of S.P.entities) if (o.type === 'opening' && map.has(o.wall)) { const c = JSON.parse(JSON.stringify(o)); if (!keepIds) c.id = uid(); c.wall = map.get(o.wall); out.push(c); }
  return out;
}

function offsetPoly(pts, closed, d) {
  const n = pts.length, segs = [];
  const cnt = closed ? n : n - 1;
  for (let i = 0; i < cnt; i++) {
    const a = pts[i], b = pts[(i + 1) % n], u = unit(sub(b, a)), nn = normal(u);
    segs.push({ p: add(a, mul(nn, d)), u });
  }
  const out = [];
  if (!closed) out.push(add(pts[0], mul(normal(segs[0].u), d)));
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
    const s0 = segs[(i - 1 + segs.length) % segs.length], s1 = segs[i % segs.length];
    const q = lineInter(s0.p, s0.u, s1.p, s1.u);
    out.push(q || add(pts[i], mul(normal(s1.u), d)));
  }
  if (!closed) out.push(add(pts[n - 1], mul(normal(segs[segs.length - 1].u), d)));
  return out;
}

/* =====================================================================
   5. RENDU DE LA SCÈNE (SVG) — fonctions pures (construisent des chaînes),
   tailles définies sur le papier × échelle.
   ===================================================================== */
function ctxLive(pid) {
  return { pid: pid || 'L', print: false, mono: false, scale: SC(), minW: 1.3 / S.view.z, bg: '#1b1e24', ink: '#e6e6e6', wallFill: '#565c68', level: S.level };
}
function ctxPrint(mono) {
  return { pid: 'S', print: true, mono: !!mono, scale: SC(), minW: 0, bg: '#ffffff', ink: '#000000', wallFill: mono ? '#dcdcdc' : '#cfd3d8', level: S.level };
}
const col = (ctx, layerId) => ctx.mono ? '#000000' : (ctx.print ? lay(layerId).pc : lay(layerId).color);
const LW = (ctx, key) => Math.max(CONFIG.lineweight[key] * ctx.scale, ctx.minW);
const lwOf = (ctx, layerId) => LW(ctx, lay(layerId).lw || 'normal');
function dashOf(ctx, lt) {
  const s = ctx.scale;
  if (lt === 'tirets') return ` stroke-dasharray="${4 * s} ${2 * s}"`;
  if (lt === 'mixte') return ` stroke-dasharray="${10 * s} ${2 * s} ${2 * s} ${2 * s}"`;
  return '';
}
const FONT = 'font-family="Arial,Helvetica,sans-serif"';
function TX(ctx, x, y, str, o) {
  o = o || {};
  const fs = (o.size || CONFIG.paper.text) * ctx.scale;
  const rot = o.rot ? ` transform="rotate(${o.rot} ${x} ${y})"` : '';
  return `<text x="${x}" y="${y}" font-size="${fs}" fill="${o.fill || ctx.ink}" text-anchor="${o.anchor || 'middle'}" dominant-baseline="${o.base || 'central'}" ${FONT}${rot}>${esc(str)}</text>`;
}
function readable(angDeg) { let a = angDeg; while (a > 90) a -= 180; while (a <= -90) a += 180; return { a, up: { x: Math.sin(rad(a)), y: -Math.cos(rad(a)) } }; }

function sceneSVG(ctx, override) {
  const ents = override || S.P.entities.filter(e => e.level === ctx.level && layerVis(e.layer));
  const of = t => ents.filter(e => e.type === t);
  const sc = ctx.scale;
  let o = `<defs><pattern id="hb${ctx.pid}" patternUnits="userSpaceOnUse" width="${2 * sc}" height="${2 * sc}" patternTransform="rotate(45)">` +
          `<rect width="${2 * sc}" height="${2 * sc}" fill="${ctx.wallFill}"/><line x1="0" y1="0" x2="0" y2="${2 * sc}" stroke="${ctx.print ? '#000' : '#f0f0f0'}" stroke-width="${Math.max(0.13 * sc, ctx.minW * 0.6)}"/></pattern></defs>`;
  o += of('slab').map(e => slabSVG(e, ctx)).join('');
  o += of('room').map(e => roomFill(e, ctx)).join('');
  o += of('furniture').map(e => furnSVG(e, ctx)).join('');
  o += wallsSVG(of('wall'), of('opening'), ctx);
  o += of('column').map(e => columnSVG(e, ctx)).join('');
  o += of('beam').map(e => beamSVG(e, ctx)).join('');
  o += of('stair').map(e => stairSVG(e, ctx)).join('');
  o += ents.filter(e => e.type === 'line' || e.type === 'polyline' || e.type === 'circle').map(e => genericSVG(e, ctx)).join('');
  o += of('axis').map(e => axisSVG(e, ctx)).join('');
  o += of('cable').map(e => cableSVG(e, ctx)).join('');
  o += of('symbol').map(e => symbolSVG(e, ctx)).join('');
  o += of('dim').map(e => dimSVG(e, ctx)).join('');
  o += of('room').map(e => roomLabel(e, ctx)).join('');
  o += of('text').map(e => textSVG(e, ctx)).join('');
  return o;
}

function wallsSVG(walls, opens, ctx) {
  if (!walls.length && !opens.length) return '';
  const lwT = LW(ctx, 'thick');
  const fillOf = w => w.kind === 'porteur' ? `url(#hb${ctx.pid})` : ctx.wallFill;
  const map = new Map();
  for (const w of walls) for (const p of [w.a, w.b]) {
    const k = Math.round(p.x) + ',' + Math.round(p.y);
    if (!map.has(k)) map.set(k, { p, ws: [] });
    map.get(k).ws.push(w);
  }
  const fillers = [];
  map.forEach(v => { if (v.ws.length >= 2) fillers.push({ p: v.p, s: Math.max(...v.ws.map(w => w.t)), w: v.ws[0] }); });
  let p1 = '', p2 = '';
  for (const w of walls) p1 += `<line x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="${col(ctx, w.layer)}" stroke-width="${w.t + 2 * lwT}"/>`;
  for (const f of fillers) p1 += `<rect x="${f.p.x - f.s / 2 - lwT}" y="${f.p.y - f.s / 2 - lwT}" width="${f.s + 2 * lwT}" height="${f.s + 2 * lwT}" fill="${col(ctx, f.w.layer)}"/>`;
  for (const w of walls) p2 += `<line x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="${fillOf(w)}" stroke-width="${w.t}"/>`;
  for (const f of fillers) p2 += `<rect x="${f.p.x - f.s / 2}" y="${f.p.y - f.s / 2}" width="${f.s}" height="${f.s}" fill="${fillOf(f.w)}"/>`;
  let p3 = '';
  for (const o of opens) { const w = byId(o.wall); if (w) p3 += openingSVG(o, w, ctx); }
  return `<g>${p1}${p2}${p3}</g>`;
}
function doorLeaf(o) {
  const dir = o.swing === 'left' ? 1 : -1;
  const hinge = dir === 1 ? o.offset : o.offset + o.w;
  const free = dir === 1 ? o.offset + o.w : o.offset;
  const sweep = dir * o.side > 0 ? 1 : 0;
  const tip = o.side * o.w;
  return `<line x1="${hinge}" y1="0" x2="${hinge}" y2="${tip}"/><path d="M${free} 0 A${o.w} ${o.w} 0 0 ${sweep} ${hinge} ${tip}"/>`;
}
function openingSVG(o, w, ctx) {
  const lwT = LW(ctx, 'thick'), ln = LW(ctx, 'normal');
  const ang = deg(Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x));
  const t = w.t, x0 = o.offset, x1 = o.offset + o.w, c = col(ctx, 'A-OUVERTURE');
  const cut = `<rect x="${x0}" y="${-t / 2 - lwT}" width="${o.w}" height="${t + 2 * lwT}" fill="${ctx.bg}"/>`;
  const jambs = `<path d="M${x0} ${-t / 2}V${t / 2}M${x1} ${-t / 2}V${t / 2}"/>`;
  let body;
  if (o.kind === 'fenetre' || o.kind === 'baie') body = `<path d="M${x0} ${-t / 2}H${x1}M${x0} 0H${x1}M${x0} ${t / 2}H${x1}"/>`;
  else if (o.kind === 'double') { const h = o.w / 2; body = doorLeaf({ ...o, w: h, offset: x0, swing: 'left' }) + doorLeaf({ ...o, w: h, offset: x0 + h, swing: 'right' }); }
  else if (o.kind === 'coulissante') body = `<rect x="${x0}" y="${-t / 4}" width="${o.w * 0.55}" height="${t / 4}"/><rect x="${x0 + o.w * 0.45}" y="0" width="${o.w * 0.55}" height="${t / 4}"/>`;
  else body = doorLeaf(o);
  return `<g transform="translate(${w.a.x} ${w.a.y}) rotate(${ang})">${cut}<g fill="none" stroke="${c}" stroke-width="${ln}">${jambs}${body}</g></g>`;
}

function columnSVG(e, ctx) {
  const c = col(ctx, e.layer);
  return `<rect x="${e.x - e.s / 2}" y="${e.y - e.s / 2}" width="${e.s}" height="${e.s}" fill="${c}" stroke="${c}" stroke-width="${lwOf(ctx, e.layer)}" transform="rotate(${e.rot || 0} ${e.x} ${e.y})"/>`;
}
function beamSVG(e, ctx) {
  const sc = ctx.scale, c = col(ctx, e.layer), u = unit(sub(e.b, e.a)), n = normal(u), h = e.bw / 2;
  const ln = `stroke="${c}" stroke-width="${lwOf(ctx, e.layer)}" stroke-dasharray="${4 * sc} ${2 * sc}"`;
  const m = mid(e.a, e.b), r = readable(deg(Math.atan2(u.y, u.x)));
  const label = e.label || `PA ${e.bw / 10}×${e.bh / 10}`;
  return `<line x1="${e.a.x + n.x * h}" y1="${e.a.y + n.y * h}" x2="${e.b.x + n.x * h}" y2="${e.b.y + n.y * h}" ${ln}/>` +
         `<line x1="${e.a.x - n.x * h}" y1="${e.a.y - n.y * h}" x2="${e.b.x - n.x * h}" y2="${e.b.y - n.y * h}" ${ln}/>` +
         TX(ctx, m.x + r.up.x * (h + 2 * sc), m.y + r.up.y * (h + 2 * sc), label, { size: 2, rot: r.a, fill: c });
}
function slabSVG(e, ctx) {
  const c = col(ctx, e.layer), cen = centroid(e.pts);
  return `<polygon points="${e.pts.map(p => p.x + ',' + p.y).join(' ')}" fill="${c}" fill-opacity="0.05" stroke="${c}" stroke-width="${lwOf(ctx, e.layer)}"${dashOf(ctx, 'mixte')}/>` +
         TX(ctx, cen.x, cen.y, `Dalle ép. ${e.t / 10} cm`, { size: 2, fill: c });
}
function roomFill(e, ctx) {
  const c = col(ctx, e.layer);
  return `<polygon points="${e.pts.map(p => p.x + ',' + p.y).join(' ')}" fill="${c}" fill-opacity="${ctx.print ? 0.06 : 0.07}" stroke="none"/>`;
}
function roomLabel(e, ctx) {
  const c = col(ctx, e.layer), cen = centroid(e.pts), a = Math.abs(polyArea(e.pts)) / 1e6, sc = ctx.scale;
  return TX(ctx, cen.x, cen.y - 1.6 * sc, e.name, { size: 3, fill: c }) + TX(ctx, cen.x, cen.y + 2 * sc, fr(a) + ' m²', { size: 2.5, fill: c });
}
function stairSVG(e, ctx) {
  const sc = ctx.scale, c = col(ctx, e.layer), L = stairLen(e), W = e.w, ln = lwOf(ctx, e.layer);
  let s = `<rect x="0" y="0" width="${L}" height="${W}"/>`;
  for (let i = 1; i < e.n; i++) s += `<line x1="${i * e.tread}" y1="0" x2="${i * e.tread}" y2="${W}"/>`;
  const x0 = e.tread * 0.5, x1 = L - e.tread * 0.5, h = 1.6 * sc;
  s += `<line x1="${x0}" y1="${W / 2}" x2="${x1}" y2="${W / 2}"/><path d="M${x1 - h * 1.6} ${W / 2 - h}L${x1} ${W / 2}L${x1 - h * 1.6} ${W / 2 + h}"/>`;
  s += `<path d="M${L * 0.6} 0L${L * 0.6 + e.tread * 0.4} ${W * 0.4}L${L * 0.6 - e.tread * 0.2} ${W * 0.6}L${L * 0.6 + e.tread * 0.2} ${W}" stroke-width="${ln * 1.4}"/>`;
  return `<g transform="translate(${e.x} ${e.y}) rotate(${e.rot || 0})"><g fill="none" stroke="${c}" stroke-width="${ln}">${s}</g>` +
         TX(ctx, L / 2, W / 2 - 2.6 * sc, 'MONTE', { size: 2, fill: c }) + '</g>';
}
function furnSVG(e, ctx) {
  const c = col(ctx, e.layer), ln = lwOf(ctx, e.layer), w = e.w, h = e.h, x = -w / 2, y = -h / 2;
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  switch (e.kind) {
    case 'wc': s += `<rect x="${x + w * 0.1}" y="${y}" width="${w * 0.8}" height="${h * 0.26}"/><ellipse cx="0" cy="${h * 0.12}" rx="${w * 0.42}" ry="${h * 0.32}"/>`; break;
    case 'lavabo': s += `<ellipse cx="0" cy="${h * 0.05}" rx="${w * 0.36}" ry="${h * 0.3}"/><circle cx="0" cy="${y + h * 0.1}" r="${Math.min(w, h) * 0.04}"/>`; break;
    case 'douche': s += `<path d="M${x} ${y}L${-x} ${-y}M${-x} ${y}L${x} ${-y}"/><circle cx="0" cy="0" r="${Math.min(w, h) * 0.06}"/>`; break;
    case 'baignoire': s += `<rect x="${x + 60}" y="${y + 60}" width="${w - 120}" height="${h - 120}" rx="${Math.min(w, h) * 0.2}"/>`; break;
    case 'evier': { const bw = (w - 200) / 2; s += `<rect x="${x + 60}" y="${y + 60}" width="${bw}" height="${h - 120}" rx="30"/><rect x="${x + 140 + bw}" y="${y + 60}" width="${bw}" height="${h - 120}" rx="30"/>`; break; }
    case 'lit': { const two = w > 1000, pw = two ? (w - 180) / 2 : w - 120; s += `<rect x="${x + 60}" y="${y + 60}" width="${pw}" height="${h * 0.16}" rx="40"/>` + (two ? `<rect x="${x + 120 + pw}" y="${y + 60}" width="${pw}" height="${h * 0.16}" rx="40"/>` : '') + `<path d="M${x} ${y + h * 0.32}H${-x}"/>`; break; }
    case 'canape': s += `<rect x="${x}" y="${y}" width="${w}" height="${h * 0.28}"/><rect x="${x}" y="${y}" width="${w * 0.08}" height="${h}"/><rect x="${-x - w * 0.08}" y="${y}" width="${w * 0.08}" height="${h}"/>`; break;
    case 'armoire': s += `<path d="M${x} ${y}L${-x} ${-y}M${-x} ${y}L${x} ${-y}"/>`; break;
  }
  return `<g transform="translate(${e.x} ${e.y}) rotate(${e.rot || 0})" fill="none" stroke="${c}" stroke-width="${ln}" stroke-linejoin="round">${s}</g>`;
}
function genericSVG(e, ctx) {
  const l = lay(e.layer), c = col(ctx, e.layer), a = `stroke="${c}" stroke-width="${lwOf(ctx, e.layer)}"${dashOf(ctx, l.lt)} fill="none"`;
  if (e.type === 'line') return `<line x1="${e.a.x}" y1="${e.a.y}" x2="${e.b.x}" y2="${e.b.y}" ${a}/>`;
  if (e.type === 'circle') return `<circle cx="${e.c.x}" cy="${e.c.y}" r="${e.r}" ${a}/>`;
  const pts = e.pts.map(p => p.x + ',' + p.y).join(' ');
  return e.closed ? `<polygon points="${pts}" ${a} stroke-linejoin="round"/>` : `<polyline points="${pts}" ${a} stroke-linejoin="round"/>`;
}
function axisSVG(e, ctx) {
  const sc = ctx.scale, c = col(ctx, e.layer), u = unit(sub(e.b, e.a)), r = 4 * sc, cen = add(e.b, mul(u, r));
  return `<line x1="${e.a.x}" y1="${e.a.y}" x2="${e.b.x}" y2="${e.b.y}" stroke="${c}" stroke-width="${lwOf(ctx, e.layer)}"${dashOf(ctx, 'mixte')}/>` +
         `<circle cx="${cen.x}" cy="${cen.y}" r="${r}" fill="none" stroke="${c}" stroke-width="${lwOf(ctx, e.layer)}"/>` + TX(ctx, cen.x, cen.y, e.label, { size: 3.2, fill: c });
}

function symbolSVG(e, ctx) {
  const d = SYMBOLS[e.sym]; if (!d) return '';
  const c = col(ctx, e.layer || d.layer);
  const tag = e.tag ? `<text transform="rotate(${-(e.rot || 0)}) translate(0 -4.6)" font-size="2.2" text-anchor="middle" fill="currentColor" stroke="none" ${FONT}>${esc(e.tag)}</text>` : '';
  return `<g transform="translate(${e.x} ${e.y}) rotate(${e.rot || 0}) scale(${ctx.scale})" color="${c}" fill="none" stroke="currentColor" stroke-width="${Math.max(CONFIG.lineweight.normal, ctx.minW / ctx.scale)}" stroke-linecap="round" stroke-linejoin="round">${d.svg}${tag}</g>`;
}
function cablePath(e) {
  const pts = e.pts;
  if (S.opts.cableCurve && pts.length === 2) {
    const a = pts[0], b = pts[1], m = mid(a, b), n = normal(unit(sub(b, a))), k = dist(a, b) * 0.18;
    const c = { x: m.x + n.x * k, y: m.y + n.y * k };
    return { d: `M${a.x} ${a.y}Q${c.x} ${c.y} ${b.x} ${b.y}`, mid: { x: 0.25 * a.x + 0.5 * c.x + 0.25 * b.x, y: 0.25 * a.y + 0.5 * c.y + 0.25 * b.y }, dir: unit(sub(b, a)) };
  }
  let best = 0, bi = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = dist(pts[i], pts[i + 1]); if (l > best) { best = l; bi = i; } }
  return { d: 'M' + pts.map(p => p.x + ' ' + p.y).join('L'), mid: mid(pts[bi], pts[bi + 1]), dir: unit(sub(pts[bi + 1], pts[bi])) };
}
function cableSVG(e, ctx) {
  if (!e.pts || e.pts.length < 2) return '';
  const sc = ctx.scale, cir = circuitOf(e.circuit);
  const c = ctx.mono ? '#000' : (cir ? cir.color : col(ctx, 'E-CABLE'));
  const lw = LW(ctx, 'fine') * 1.4, P = cablePath(e), n = normal(P.dir);
  let s = `<path d="${P.d}" fill="none" stroke="${c}" stroke-width="${lw}" stroke-linejoin="round"/>`;
  const k = clamp(Math.round(e.conductors || 3), 1, 6), v = unit({ x: n.x * Math.cos(rad(25)) + P.dir.x * Math.sin(rad(25)), y: n.y * Math.cos(rad(25)) + P.dir.y * Math.sin(rad(25)) });
  for (let i = 0; i < k; i++) {
    const off = (i - (k - 1) / 2) * 1.3 * sc, q = add(P.mid, mul(P.dir, off));
    s += `<line x1="${q.x - v.x * 1.5 * sc}" y1="${q.y - v.y * 1.5 * sc}" x2="${q.x + v.x * 1.5 * sc}" y2="${q.y + v.y * 1.5 * sc}" stroke="${c}" stroke-width="${lw}"/>`;
  }
  if (cir) {
    const r = readable(deg(Math.atan2(P.dir.y, P.dir.x))), p = add(P.mid, mul(r.up, 3.4 * sc));
    s += TX(ctx, p.x, p.y, `${cir.code} · ${k}G${String(cir.section).replace('.', ',')}`, { size: 2, rot: r.a, fill: c });
  }
  return s;
}

function fmtDim(len) { return S.P.meta.dimUnit === 'm' ? fr(len / 1000) : String(Math.round(len)); }
function dimSVG(e, ctx) {
  const sc = ctx.scale, c = col(ctx, e.layer), g = dimGeom(e), ln = LW(ctx, 'fine'), sg = e.off >= 0 ? 1 : -1;
  const gap = 1 * sc, over = 1.5 * sc, tk = CONFIG.paper.tick * sc, v = unit({ x: g.d.x + g.n.x, y: g.d.y + g.n.y });
  const ext = (p, q) => { const u = mul(g.n, sg); return `<line x1="${p.x + u.x * gap}" y1="${p.y + u.y * gap}" x2="${q.x + u.x * over}" y2="${q.y + u.y * over}"/>`; };
  const tick = q => `<line x1="${q.x - v.x * tk}" y1="${q.y - v.y * tk}" x2="${q.x + v.x * tk}" y2="${q.y + v.y * tk}" stroke-width="${ln * 2}"/>`;
  const m = mid(g.q1, g.q2), r = readable(deg(Math.atan2(g.d.y, g.d.x))), tp = add(m, mul(r.up, 1.4 * sc));
  return `<g stroke="${c}" stroke-width="${ln}" fill="none">${ext(e.p1, g.q1)}${ext(e.p2, g.q2)}<line x1="${g.q1.x}" y1="${g.q1.y}" x2="${g.q2.x}" y2="${g.q2.y}"/>${tick(g.q1)}${tick(g.q2)}</g>` +
         TX(ctx, tp.x, tp.y, fmtDim(dist(e.p1, e.p2)), { size: 2.5, rot: r.a, fill: c });
}
function textSVG(e, ctx) {
  const fs = (e.size || CONFIG.paper.text) * ctx.scale, lines = String(e.text).split('\n');
  const tsp = lines.map((l, i) => `<tspan x="${e.x}" dy="${i ? fs * 1.2 : 0}">${esc(l)}</tspan>`).join('');
  return `<text x="${e.x}" y="${e.y}" font-size="${fs}" fill="${col(ctx, e.layer)}" ${FONT}${e.rot ? ` transform="rotate(${e.rot} ${e.x} ${e.y})"` : ''}>${tsp}</text>`;
}

/* =====================================================================
   6. MONT/DÉMONTAGE — point d'entrée public. Tout ce qui touche le DOM
   (sections « VUE » à « PLANCHE/EXPORTS » du prototype d'origine) vit à
   l'intérieur de mount(), fermé sur `root` : rouvrir la vue #/plan/:id
   appelle unmount() puis reconstruit tout proprement plutôt que d'empiler
   des gestionnaires globaux à chaque navigation (même principe que
   window.__wireEscBound dans js/editor.js, en plus explicite ici).
   ===================================================================== */
let _root = null, _kd = null, _ku = null, _ro = null;

function unmount() {
  if (_kd) { window.removeEventListener('keydown', _kd); _kd = null; }
  if (_ku) { window.removeEventListener('keyup', _ku); _ku = null; }
  if (_ro) { try { _ro.disconnect(); } catch (e) {} _ro = null; }
  _root = null;
}

function mount(root, storageAdapter, opts) {
  unmount();
  _root = root;
  opts = opts || {};
  S = freshState();
  S.readOnly = !!opts.readOnly;
  if (opts.title) { S.P.meta.name = opts.title; S.P.meta.projet = opts.title; }
  idxVer = -1;

  const $ = (s, r) => (r || root).querySelector(s);
  const $$ = (s, r) => [...(r || root).querySelectorAll(s)];

  const storage = storageAdapter || {
    load() { try { return localStorage.getItem('atelier_plan_standalone_v1'); } catch (e) { return null; } },
    save(json) { try { localStorage.setItem('atelier_plan_standalone_v1', json); } catch (e) {} },
  };

/* =====================================================================
   VUE, GRILLE, ACCROCHAGES, SURCOUCHE
   ===================================================================== */
const svg = $('#cv');
svg.innerHTML = `<defs><pattern id="gp" patternUnits="userSpaceOnUse"><circle id="gpc" cx="0" cy="0" r="1" fill="#3b4453"/></pattern>
<pattern id="gp2" patternUnits="userSpaceOnUse"><path id="gp2p" d="" stroke="#5b667a" fill="none"/></pattern></defs>
<g id="vp"><rect id="gr1" fill="url(#gp)"/><rect id="gr2" fill="url(#gp2)"/><g id="sheetG"></g><g id="scene"></g><g id="ov"></g></g>`;
const vpG = $('#vp'), sceneG = $('#scene'), ovG = $('#ov'), sheetG = $('#sheetG');
const stage = $('#stage');

function gridStep() {
  const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  for (const s of steps) if (s * S.view.z >= 7) return s;
  return 50000;
}
function updateGrid() {
  const { x, y, z } = S.view, W = stage.clientWidth, H = stage.clientHeight, st = gridStep();
  const x0 = -x / z - st, y0 = -y / z - st, w = W / z + 2 * st, h = H / z + 2 * st;
  const px = 1 / z;
  $('#gp').setAttribute('width', st); $('#gp').setAttribute('height', st);
  $('#gpc').setAttribute('r', 0.9 * px);
  const big = st * 10, a = 4 * px;
  $('#gp2').setAttribute('width', big); $('#gp2').setAttribute('height', big);
  $('#gp2p').setAttribute('d', `M${-a} 0H${a}M0 ${-a}V${a}`); $('#gp2p').setAttribute('stroke-width', px);
  for (const id of ['gr1', 'gr2']) { const r = $('#' + id); r.setAttribute('x', x0); r.setAttribute('y', y0); r.setAttribute('width', w); r.setAttribute('height', h); }
}
function applyView() { vpG.setAttribute('transform', `translate(${S.view.x} ${S.view.y}) scale(${S.view.z})`); updateGrid(); }
const toWorld = (sx, sy) => ({ x: (sx - S.view.x) / S.view.z, y: (sy - S.view.y) / S.view.z });
const toScreen = p => ({ x: p.x * S.view.z + S.view.x, y: p.y * S.view.z + S.view.y });
function evWorld(ev) { const r = svg.getBoundingClientRect(); return toWorld(ev.clientX - r.left, ev.clientY - r.top); }
let rafPending = false;
function renderSoon() { if (rafPending) return; rafPending = true; requestAnimationFrame(() => { rafPending = false; render(); }); }
function zoomAt(cx, cy, f) {
  const v = S.view, wx = (cx - v.x) / v.z, wy = (cy - v.y) / v.z, z = clamp(v.z * f, 0.002, 4);
  v.x = cx - wx * z; v.y = cy - wy * z; v.z = z; applyView(); renderSoon();
}
function fitView(box) {
  const W = stage.clientWidth || 800, H = stage.clientHeight || 500;
  if (!box || !isFinite(box.x0)) box = { x0: -1000, y0: -1000, x1: 11000, y1: 8000 };
  const bw = Math.max(box.x1 - box.x0, 500), bh = Math.max(box.y1 - box.y0, 500), pad = 50;
  const z = clamp(Math.min((W - 2 * pad) / bw, (H - 2 * pad) / bh), 0.002, 4);
  S.view.z = z; S.view.x = W / 2 - ((box.x0 + box.x1) / 2) * z; S.view.y = H / 2 - ((box.y0 + box.y1) / 2) * z;
  applyView(); render();
}
function extents() {
  const ents = visibleEnts(); if (!ents.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of ents) { const b = bboxOf(e); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
  return { x0, y0, x1, y1 };
}

let geoCache = { key: '', segs: [], pts: [] };
function segRec(a, b, face) { return { a, b, face: !!face, minx: Math.min(a.x, b.x), maxx: Math.max(a.x, b.x), miny: Math.min(a.y, b.y), maxy: Math.max(a.y, b.y) }; }
function geo() {
  const key = S.geoVer + '|' + S.level + '|' + S.P.layers.map(l => l.visible ? 1 : 0).join('');
  if (geoCache.key === key) return geoCache;
  const segs = [], pts = [];
  for (const e of visibleEnts()) {
    switch (e.type) {
      case 'wall': {
        segs.push(segRec(e.a, e.b));
        const n = mul(normal(wallDir(e)), e.t / 2);
        segs.push(segRec(add(e.a, n), add(e.b, n), true), segRec(sub(e.a, n), sub(e.b, n), true));
        break;
      }
      case 'line': case 'axis': case 'beam': segs.push(segRec(e.a, e.b)); break;
      case 'polyline': case 'room': case 'slab': {
        const closed = e.type !== 'polyline' || e.closed, n = e.pts.length;
        for (let i = 0; i < n - (closed ? 0 : 1); i++) segs.push(segRec(e.pts[i], e.pts[(i + 1) % n]));
        break;
      }
      case 'column': { const c = columnCorners(e); c.forEach(p => pts.push({ x: p.x, y: p.y, type: 'extremite', pr: 1 })); pts.push({ x: e.x, y: e.y, type: 'centre', pr: 3 }); break; }
      case 'symbol': pts.push({ x: e.x, y: e.y, type: 'centre', pr: 3 }); break;
      case 'circle': pts.push({ x: e.c.x, y: e.c.y, type: 'centre', pr: 3 }); break;
      case 'stair': stairCorners(e).forEach(p => pts.push({ x: p.x, y: p.y, type: 'extremite', pr: 1 })); break;
      case 'furniture': furnCorners(e).forEach(p => pts.push({ x: p.x, y: p.y, type: 'extremite', pr: 1 })); break;
    }
  }
  geoCache = { key, segs, pts };
  return geoCache;
}
function computeSnap(raw) {
  const tol = CONFIG.snapPx / S.view.z; let best = null;
  const cand = (x, y, type, pr) => {
    const d = Math.hypot(x - raw.x, y - raw.y);
    if (d <= tol && (!best || pr < best.pr || (pr === best.pr && d < best.d))) best = { x, y, type, pr, d };
  };
  if (!S.snap.osnap) return null;
  const G = geo(), near = [];
  for (const s of G.segs) { if (raw.x < s.minx - tol || raw.x > s.maxx + tol || raw.y < s.miny - tol || raw.y > s.maxy + tol) continue; near.push(s); }
  for (const s of near) { cand(s.a.x, s.a.y, 'extremite', 1); cand(s.b.x, s.b.y, 'extremite', 1); if (!s.face) { const m = mid(s.a, s.b); cand(m.x, m.y, 'milieu', 2); } }
  for (const p of G.pts) cand(p.x, p.y, p.type, p.pr);
  if (near.length <= 60) for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
    const q = segInter(near[i].a, near[i].b, near[j].a, near[j].b); if (q) cand(q.x, q.y, 'intersection', 0);
  }
  if (S.ref) for (const s of near) {
    const v = sub(s.b, s.a), l2 = dot(v, v); if (!l2) continue;
    const t = dot(sub(S.ref, s.a), v) / l2;
    if (t >= 0 && t <= 1) cand(s.a.x + v.x * t, s.a.y + v.y * t, 'perpendiculaire', 4);
  }
  for (const s of near) { const r = distPtSeg(raw, s.a, s.b); if (r.d <= tol) cand(r.q.x, r.q.y, 'proche', 5); }
  return best;
}
const POLAR = [...new Set(CONFIG.polarAngles.flatMap(a => [a, -a, 180 - a, a - 180]))];
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
function updateCursor(raw, shift) {
  S.cursorRaw = raw; S.shift = !!shift;
  const hit = computeSnap(raw), r = S.ref;
  if (hit) { S.cursor = { x: hit.x, y: hit.y }; S.snapHit = hit; }
  else {
    S.snapHit = null; const p = cp(raw), st = gridStep();
    if (r && (S.snap.ortho || shift)) {
      if (Math.abs(p.x - r.x) >= Math.abs(p.y - r.y)) { p.y = r.y; if (S.snap.grid) p.x = Math.round(p.x / st) * st; }
      else { p.x = r.x; if (S.snap.grid) p.y = Math.round(p.y / st) * st; }
    } else if (r && S.snap.polar) {
      const dx = p.x - r.x, dy = p.y - r.y, a = deg(Math.atan2(dy, dx)); let L = Math.hypot(dx, dy), pick = null;
      for (const t of POLAR) if (angDiff(a, t) < 4 && (pick === null || angDiff(a, t) < angDiff(a, pick))) pick = t;
      if (pick !== null) { if (S.snap.grid) L = Math.round(L / st) * st; p.x = r.x + L * Math.cos(rad(pick)); p.y = r.y + L * Math.sin(rad(pick)); }
      else if (S.snap.grid) { p.x = Math.round(p.x / st) * st; p.y = Math.round(p.y / st) * st; }
    } else if (S.snap.grid) { p.x = Math.round(p.x / st) * st; p.y = Math.round(p.y / st) * st; }
    S.cursor = p;
  }
  const coordsEl = $('#coords');
  if (coordsEl) coordsEl.textContent = `X ${Math.round(S.cursor.x)}   Y ${Math.round(-S.cursor.y)}`;
}

const PV = '#ffb74d', HL = '#00e5ff';
function pvStyle(px) { return `fill="none" stroke="${PV}" stroke-width="${1.5 * px}" stroke-dasharray="${6 * px} ${4 * px}"`; }
function hiliteSVG(e, px) {
  const st = `fill="none" stroke="${HL}" stroke-width="${2.4 * px}" stroke-linejoin="round"`;
  const poly = (pts, closed) => `<${closed ? 'polygon' : 'polyline'} points="${pts.map(p => p.x + ',' + p.y).join(' ')}" ${st}/>`;
  switch (e.type) {
    case 'wall': return `<line x1="${e.a.x}" y1="${e.a.y}" x2="${e.b.x}" y2="${e.b.y}" stroke="${HL}" stroke-opacity="0.35" stroke-width="${e.t + 6 * px}"/>`;
    case 'beam': return `<line x1="${e.a.x}" y1="${e.a.y}" x2="${e.b.x}" y2="${e.b.y}" stroke="${HL}" stroke-opacity="0.3" stroke-width="${e.bw + 4 * px}"/>`;
    case 'line': case 'axis': return `<line x1="${e.a.x}" y1="${e.a.y}" x2="${e.b.x}" y2="${e.b.y}" stroke="${HL}" stroke-width="${3 * px}" stroke-opacity="0.8"/>`;
    case 'polyline': return poly(e.pts, e.closed);
    case 'cable': return poly(e.pts, false);
    case 'room': case 'slab': return poly(e.pts, true);
    case 'circle': return `<circle cx="${e.c.x}" cy="${e.c.y}" r="${e.r}" ${st}/>`;
    case 'column': return poly(columnCorners(e), true);
    case 'stair': return poly(stairCorners(e), true);
    case 'furniture': return poly(furnCorners(e), true);
    case 'symbol': return `<circle cx="${e.x}" cy="${e.y}" r="${4.6 * SC()}" ${st}/>`;
    case 'dim': { const g = dimGeom(e); return `<line x1="${g.q1.x}" y1="${g.q1.y}" x2="${g.q2.x}" y2="${g.q2.y}" stroke="${HL}" stroke-width="${3 * px}" stroke-opacity="0.8"/>`; }
    default: { const b = bboxOf(e); return `<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" ${st} stroke-dasharray="${5 * px} ${3 * px}"/>`; }
  }
}
function markerSVG(hit, px) {
  if (!hit) return '';
  const r = 5.5 * px, sw = `fill="none" stroke="#00e676" stroke-width="${1.8 * px}"`, { x, y } = hit;
  let s = '';
  switch (hit.type) {
    case 'extremite': s = `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" ${sw}/>`; break;
    case 'milieu': s = `<path d="M${x - r} ${y + r}L${x} ${y - r}L${x + r} ${y + r}Z" ${sw}/>`; break;
    case 'centre': s = `<circle cx="${x}" cy="${y}" r="${r}" ${sw}/>`; break;
    case 'intersection': s = `<path d="M${x - r} ${y - r}L${x + r} ${y + r}M${x - r} ${y + r}L${x + r} ${y - r}" ${sw}/>`; break;
    case 'perpendiculaire': s = `<path d="M${x - r} ${y + r}V${y - r}M${x - r} ${y + r}H${x + r}" ${sw}/>`; break;
    default: s = `<path d="M${x - r} ${y - r}H${x + r}L${x - r} ${y + r}H${x + r}Z" ${sw}/>`;
  }
  return s;
}
const SNAP_LABEL = { extremite: 'Extrémité', milieu: 'Milieu', centre: 'Centre', intersection: 'Intersection', perpendiculaire: 'Perpendiculaire', proche: 'Proche' };
function renderOverlay() {
  const px = 1 / S.view.z; let o = '';
  if (S.previewSVG) o += `<g opacity="0.75" pointer-events="none">${S.previewSVG}</g>`;
  const sel = selEnts();
  for (const e of sel) o += hiliteSVG(e, px);
  if (sel.length === 1 && (S.tool === 'select' || (S.draft && S.draft.stage === 0))) {
    for (const g of gripsOf(sel[0])) {
      const r = 4 * px;
      o += `<rect x="${g.x - r}" y="${g.y - r}" width="${2 * r}" height="${2 * r}" fill="${g.k === 'mid' ? HL : '#fff'}" stroke="#0a4a58" stroke-width="${px}"/>`;
    }
  }
  if (G.box) {
    const b = G.box, x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1), w = Math.abs(b.x1 - b.x0), h = Math.abs(b.y1 - b.y0), crossing = b.x1 < b.x0;
    const c = crossing ? '#66bb6a' : '#4fc3f7';
    o += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" fill-opacity="0.12" stroke="${c}" stroke-width="${px}" ${crossing ? `stroke-dasharray="${5 * px} ${3 * px}"` : ''}/>`;
  }
  if (S.snapHit && !G.box) o += markerSVG(S.snapHit, px);
  ovG.innerHTML = o;
}
function render() {
  sceneG.innerHTML = sceneSVG(ctxLive());
  renderSheetOverlay();
  renderOverlay();
}

let toastT;
function toastMsg(msg, ms) {
  const t = $('#plan-toast'); if (!t) return;
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms || 2600);
}
function setHint() {
  const t = TOOLS[S.tool], h = t ? (typeof t.hint === 'function' ? t.hint() : t.hint) : '';
  const hintEl = $('#hint'), promptEl = $('#prompt');
  if (hintEl) hintEl.textContent = h;
  if (promptEl) promptEl.textContent = (t && t.title ? t.title : 'Commande') + ' :';
}
function updateHud() {
  const h = $('#hud'), r = S.ref;
  if (!h) return;
  if (!r || !S.draft) { h.style.display = 'none'; return; }
  const c = S.cursor, L = dist(r, c), a = deg(Math.atan2(-(c.y - r.y), c.x - r.x));
  if (L < 1) { h.style.display = 'none'; return; }
  const s = toScreen(c);
  h.textContent = `${Math.round(L)} mm  ∠ ${a.toFixed(1)}°` + (S.snapHit ? `  · ${SNAP_LABEL[S.snapHit.type] || ''}` : '');
  h.style.left = (s.x + 16) + 'px'; h.style.top = (s.y + 16) + 'px'; h.style.display = 'block';
}

/* =====================================================================
   OUTILS
   ===================================================================== */
function pushUndo() { S.undo.push(JSON.stringify(S.P)); if (S.undo.length > 50) S.undo.shift(); S.redo.length = 0; }
function loadState(json) {
  S.P = JSON.parse(json);
  if (!S.P.levels.some(l => l.id === S.level)) S.level = S.P.levels[0].id;
  touch(); S.sel = new Set([...S.sel].filter(id => byId(id)));
  changed();
}
function undo() { if (!S.undo.length) return toastMsg('Rien à annuler'); S.redo.push(JSON.stringify(S.P)); loadState(S.undo.pop()); }
function redo() { if (!S.redo.length) return toastMsg('Rien à rétablir'); S.undo.push(JSON.stringify(S.P)); loadState(S.redo.pop()); }
function changed(quiet) {
  touch(); S.dirty = true; render();
  if (!quiet) refreshPanels();
  scheduleSave();
}
function addEntities(list) { if (S.readOnly) return; pushUndo(); S.P.entities.push(...list); changed(); }
function deleteEntities(ids) {
  if (S.readOnly) return;
  ids = new Set(ids);
  if (!ids.size) return;
  pushUndo();
  S.P.entities = S.P.entities.filter(e => !ids.has(e.id) && !(e.type === 'opening' && ids.has(e.wall)));
  S.sel = new Set([...S.sel].filter(id => !ids.has(id)));
  changed();
}

let saveT;
function setSaved(state) {
  const s = $('#saveState'); if (!s) return;
  s.textContent = state === 'ok' ? 'Enregistré' : state === 'err' ? 'Échec de sauvegarde' : 'Modifié…';
  s.classList.toggle('dirty', state !== 'ok');
}
function scheduleSave() {
  if (S.readOnly) { setSaved('ok'); return; }
  setSaved('dirty'); clearTimeout(saveT);
  saveT = setTimeout(() => {
    Promise.resolve().then(() => storage.save(JSON.stringify(S.P))).then(() => { S.dirty = false; setSaved('ok'); }).catch(() => setSaved('err'));
  }, 900);
}

const ENT_REQ = {
  wall: ['a', 'b', 't'], opening: ['wall', 'offset', 'w', 'h', 'sill'], column: ['x', 'y', 's'], beam: ['a', 'b', 'bw', 'bh'], slab: ['pts', 't'],
  stair: ['x', 'y', 'w', 'n', 'tread'], room: ['pts', 'name'], axis: ['a', 'b', 'label'], furniture: ['x', 'y', 'w', 'h', 'kind'], symbol: ['x', 'y', 'sym'],
  cable: ['pts'], dim: ['p1', 'p2', 'off'], text: ['x', 'y', 'text'], line: ['a', 'b'], polyline: ['pts'], circle: ['c', 'r'],
};
const isPt = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
function validEntity(e) {
  if (!e || typeof e !== 'object' || !ENT_REQ[e.type] || typeof e.id !== 'string') return false;
  for (const k of ENT_REQ[e.type]) {
    const v = e[k];
    if (v === undefined || v === null) return false;
    if (['a', 'b', 'c', 'p1', 'p2'].includes(k) && !isPt(v)) return false;
    if (k === 'pts' && !(Array.isArray(v) && v.length >= 2 && v.every(isPt))) return false;
    if (['x', 'y', 't', 's', 'w', 'h', 'r', 'n', 'tread', 'off', 'offset', 'sill', 'bw', 'bh'].includes(k) && !Number.isFinite(v)) return false;
  }
  if (e.type === 'symbol' && !SYMBOLS[e.sym]) return false;
  return true;
}
function validateProject(o) {
  if (!o || typeof o !== 'object' || o.version !== 1) throw new Error('Fichier non reconnu (version 1 attendue).');
  const P = newProject(), m = o.meta || {};
  for (const k of ['name', 'projet', 'titre', 'auteur', 'date', 'indice', 'planche']) if (typeof m[k] === 'string') P.meta[k] = m[k].slice(0, 120);
  if (CONFIG.paperScales.includes(m.scale)) P.meta.scale = m.scale;
  if (CONFIG.sheets[m.sheet]) P.meta.sheet = m.sheet;
  if (m.dimUnit === 'm') P.meta.dimUnit = 'm';
  if (m.sheetOrigin && isPt(m.sheetOrigin)) P.meta.sheetOrigin = cp(m.sheetOrigin);
  if (Array.isArray(o.levels) && o.levels.length) P.levels = o.levels.filter(l => l && typeof l.id === 'string').map(l => ({ id: l.id, name: String(l.name || 'Niveau').slice(0, 40), elevation: num(l.elevation), height: num(l.height, 2800) }));
  if (!P.levels.length) P.levels = [{ id: 'L0', name: 'RDC', elevation: 0, height: 2800 }];
  if (Array.isArray(o.layers)) for (const l of o.layers) {
    const t = l && P.layers.find(x => x.id === l.id); if (!t) continue;
    if (typeof l.visible === 'boolean') t.visible = l.visible;
    if (typeof l.locked === 'boolean') t.locked = l.locked;
    if (/^#[0-9a-f]{6}$/i.test(l.color || '')) t.color = l.color;
  }
  if (Array.isArray(o.circuits)) P.circuits = o.circuits.filter(c => c && typeof c.id === 'string' && RULES.circuits[c.kind]).map(c => ({
    id: c.id, code: String(c.code || 'C?').slice(0, 8), name: String(c.name || '').slice(0, 60), kind: c.kind,
    prot: num(c.prot, 16), section: num(c.section, 1.5), color: /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#ec407a' }));
  const lv = new Set(P.levels.map(l => l.id)), lids = new Set(P.layers.map(l => l.id));
  let dropped = 0;
  P.entities = (Array.isArray(o.entities) ? o.entities : []).filter(e => { const ok = validEntity(e) && lv.has(e.level) && lids.has(e.layer); if (!ok) dropped++; return ok; });
  P._dropped = dropped;
  return P;
}

const PX = () => 1 / S.view.z;
const pvLine = (a, b) => `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" ${pvStyle(PX())}/>`;
const pvPoly = (pts, closed) => `<${closed ? 'polygon' : 'polyline'} points="${pts.map(p => p.x + ',' + p.y).join(' ')}" ${pvStyle(PX())}/>`;
const anyDraft = () => !!(S.draft && (S.draft.pts?.length || S.draft.p1 || S.draft.base || S.draft.target || S.draft.c || S.draft.a));

function renderTemp(list) {
  const arr = S.P.entities, n = arr.length; arr.push(...list); idxVer = -1;
  let out = '';
  try { out = sceneSVG(ctxLive('V'), list); } finally { arr.length = n; idxVer = -1; }
  return out;
}
function previewXform(m) {
  const list = cloneSet(selEnts()), arr = S.P.entities, n = arr.length; arr.push(...list); idxVer = -1;
  let out = '';
  try { applyXform(list, m); out = sceneSVG(ctxLive('V'), list); } finally { arr.length = n; idxVer = -1; }
  return out;
}
function setTool(name, arg) {
  S.draft = null; S.ref = null; S.previewSVG = '';
  S.tool = name; S.toolArg = arg === undefined ? null : arg;
  const t = TOOLS[name];
  if (t && t.start) t.start(arg);
  updateRibbonActive(); setHint(); renderOverlay();
}
function cancelDraft() { S.draft = null; S.ref = null; S.previewSVG = ''; }
function pointHere(a, b) { return dist(a, b) < 1; }

const OPEN_PRESETS = {
  porte:       { kind: 'porte',       ...CONFIG.door.interieure, sill: 0, label: 'Porte' },
  double:      { kind: 'double',      ...CONFIG.door.double, sill: 0, label: 'Porte double' },
  coulissante: { kind: 'coulissante', ...CONFIG.door.coulissante, sill: 0, label: 'Porte coulissante' },
  fenetre:     { kind: 'fenetre',     ...CONFIG.window.standard, label: 'Fenêtre' },
  petite:      { kind: 'fenetre',     ...CONFIG.window.petite, label: 'Petite fenêtre' },
  baie:        { kind: 'baie',        ...CONFIG.window.baie, label: 'Baie vitrée' },
};
function nearestWall(p, extra) {
  extra = extra === undefined ? 250 : extra;
  let best = null;
  for (const e of S.P.entities) {
    if (e.type !== 'wall' || !selectable(e)) continue;
    const r = distPtSeg(p, e.a, e.b);
    if (r.d <= e.t / 2 + extra && (!best || r.d < best.r.d)) best = { w: e, r };
  }
  return best;
}
function openingAt(p, preset) {
  const nw = nearestWall(p); if (!nw) return null;
  const { w, r } = nw, u = wallDir(w), L = wallLen(w);
  if (preset.w > L) return null;
  const s = dot(sub(p, w.a), u);
  const offset = clamp(Math.round((s - preset.w / 2) / 50) * 50, 0, L - preset.w);
  let side = dot(sub(p, r.q), normal(u)) >= 0 ? 1 : -1;
  if (S.opts.flipSide) side = -side;
  return mk('opening', { wall: w.id, offset, w: preset.w, h: preset.h, sill: preset.sill, kind: preset.kind, swing: S.opts.swing, side }, 'A-OUVERTURE');
}
function symPlacement(sym, raw, snapped) {
  const d = SYMBOLS[sym], sc = SC();
  if (d.attach === 'wall') {
    const nw = nearestWall(raw, 400);
    if (nw) {
      const { w, r } = nw, u = wallDir(w), L = wallLen(w);
      const s = clamp(Math.round(dot(sub(r.q, w.a), u) / 50) * 50, 0, L);
      const q = add(w.a, mul(u, s)), nn = mul(normal(u), dot(sub(raw, r.q), normal(u)) >= 0 ? 1 : -1);
      const pos = add(q, mul(nn, w.t / 2 + (d.wo || 3.2) * sc));
      return { x: pos.x, y: pos.y, rot: deg(Math.atan2(nn.y, nn.x)) };
    }
  }
  return { x: snapped.x, y: snapped.y, rot: S.opts.tmpRot };
}
function wallLayer(kind) { return kind === 'cloison' ? 'A-CLOISON' : 'A-MUR'; }
function nextAxisLabel(a, b) {
  const vertical = Math.abs(b.x - a.x) < Math.abs(b.y - a.y);
  const same = S.P.entities.filter(e => e.type === 'axis' && e.level === S.level && (Math.abs(e.b.x - e.a.x) < Math.abs(e.b.y - e.a.y)) === vertical).length;
  return vertical ? String(same + 1) : String.fromCharCode(65 + (same % 26));
}

function chainTool(title, first, next, make) {
  return {
    title, hint: () => S.draft ? next + ' — Entrée / clic droit pour terminer' : first,
    click(p) {
      if (!S.draft) { S.draft = { pts: [cp(p)] }; S.ref = cp(p); return; }
      const a = S.draft.pts[0]; if (pointHere(a, p)) return;
      addEntities([make(a, cp(p))]);
      S.draft = { pts: [cp(p)] }; S.ref = cp(p);
    },
    preview(p) { return S.draft ? this.pv(S.draft.pts[0], p) : ''; },
    pv: (a, b) => pvLine(a, b),
    enter() { cancelDraft(); setHint(); },
  };
}
function polyTool(title, min, finish, closedByClick) {
  return {
    title, hint: () => S.draft ? 'Point suivant — Entrée ou clic droit pour terminer' : 'Premier point',
    click(p) {
      if (!S.draft) { S.draft = { pts: [cp(p)] }; S.ref = cp(p); return; }
      const pts = S.draft.pts;
      if (closedByClick && pts.length >= 3 && dist(p, pts[0]) < 12 / S.view.z) { finish(pts, true); cancelDraft(); return; }
      if (pointHere(pts[pts.length - 1], p)) return;
      pts.push(cp(p)); S.ref = cp(p);
    },
    preview(p) { return S.draft ? pvPoly([...S.draft.pts, p], false) : ''; },
    enter() { const pts = S.draft ? S.draft.pts : []; if (pts.length >= min) finish(pts, false); else if (pts.length) toastMsg(`Il faut au moins ${min} points`); cancelDraft(); setHint(); },
  };
}
function modTool(o) {
  const t = Object.assign({}, o);
  t.hint = () => { const s = S.draft ? S.draft.stage : 0; return s === 0 ? 'Sélectionnez les objets (clic ou fenêtre), puis Entrée' : o.hint(S.draft); };
  t.start = () => { S.draft = { stage: S.sel.size ? 1 : 0 }; if (o.start) o.start(); };
  t.enter = () => {
    if (S.draft.stage === 0) { if (S.sel.size) { S.draft.stage = 1; setHint(); } else toastMsg('Aucun objet sélectionné'); }
    else if (o.enter) o.enter(); else setTool('select');
  };
  return t;
}

const TOOLS = {
  select: { title: 'Sélection', hint: () => 'Clic = sélectionner · glisser = déplacer · fenêtre gauche→droite (englobe) / droite→gauche (touche) · Suppr = effacer' },

  line: chainTool('LIGNE', 'Premier point', 'Point suivant', (a, b) => mk('line', { a: cp(a), b: cp(b) }, S.layer)),
  polyline: polyTool('POLYLIGNE', 2, (pts, closed) => addEntities([mk('polyline', { pts: pts.map(cp), closed: !!closed }, S.layer)]), true),
  rect: {
    title: 'RECTANGLE', hint: () => S.draft ? 'Coin opposé' : 'Premier coin',
    click(p) {
      if (!S.draft) { S.draft = { pts: [cp(p)] }; S.ref = cp(p); return; }
      const a = S.draft.pts[0]; if (Math.abs(a.x - p.x) < 1 || Math.abs(a.y - p.y) < 1) return;
      addEntities([mk('polyline', { pts: [a, { x: p.x, y: a.y }, cp(p), { x: a.x, y: p.y }], closed: true }, S.layer)]); cancelDraft();
    },
    preview(p) { if (!S.draft) return ''; const a = S.draft.pts[0]; return pvPoly([a, { x: p.x, y: a.y }, p, { x: a.x, y: p.y }], true); },
  },
  circle: {
    title: 'CERCLE', hint: () => S.draft ? 'Rayon (clic ou tapez la valeur)' : 'Centre',
    click(p) {
      if (!S.draft) { S.draft = { c: cp(p) }; S.ref = cp(p); return; }
      const r = dist(S.draft.c, p); if (r < 1) return;
      addEntities([mk('circle', { c: cp(S.draft.c), r }, S.layer)]); cancelDraft();
    },
    preview(p) { return S.draft ? `<circle cx="${S.draft.c.x}" cy="${S.draft.c.y}" r="${dist(S.draft.c, p)}" ${pvStyle(PX())}/>` : ''; },
  },

  wall: {
    title: 'MUR', hint: () => S.draft ? 'Point suivant du mur — Entrée / clic droit pour terminer' : `Premier point du mur (${(OPT.wallKind.find(k => k[0] === S.opts.wallKind) || [])[1]}, ${CONFIG.wall[S.opts.wallKind].t} mm)`,
    click(p) {
      if (!S.draft) { S.draft = { pts: [cp(p)] }; S.ref = cp(p); return; }
      const a = S.draft.pts[0]; if (pointHere(a, p)) return;
      const k = S.opts.wallKind;
      addEntities([mk('wall', { a: cp(a), b: cp(p), t: CONFIG.wall[k].t, kind: k }, wallLayer(k))]);
      S.draft = { pts: [cp(p)] }; S.ref = cp(p);
    },
    preview(p) {
      if (!S.draft) return ''; const k = S.opts.wallKind, a = S.draft.pts[0];
      if (pointHere(a, p)) return '';
      return renderTemp([mk('wall', { a: cp(a), b: cp(p), t: CONFIG.wall[k].t, kind: k }, wallLayer(k))]);
    },
    enter() { cancelDraft(); setHint(); },
  },
  opening: {
    title: 'OUVERTURE', hint: () => `${OPEN_PRESETS[S.toolArg].label} : survolez un mur et cliquez · Tab = inverser le gond · Maj+Tab = inverser le côté`,
    click() { const o = openingAt(S.cursorRaw, OPEN_PRESETS[S.toolArg]); if (!o) return toastMsg('Placez-vous sur un mur assez long'); addEntities([o]); },
    preview() { const o = openingAt(S.cursorRaw, OPEN_PRESETS[S.toolArg]); return o ? renderTemp([o]) : ''; },
    tab(shift) { if (shift) S.opts.flipSide = !S.opts.flipSide; else S.opts.swing = S.opts.swing === 'left' ? 'right' : 'left'; },
  },
  column: {
    title: 'POTEAU', hint: () => `Cliquez pour placer un poteau ${S.opts.colSize}×${S.opts.colSize} mm`,
    click(p) { addEntities([mk('column', { x: p.x, y: p.y, s: S.opts.colSize, rot: 0 }, 'S-POTEAU')]); },
    preview(p) { return renderTemp([mk('column', { x: p.x, y: p.y, s: S.opts.colSize, rot: 0 }, 'S-POTEAU')]); },
  },
  beam: {
    title: 'POUTRE', hint: () => S.draft ? 'Extrémité de la poutre' : `Début de la poutre (${CONFIG.beam.b}×${CONFIG.beam.h} mm)`,
    click(p) {
      if (!S.draft) { S.draft = { pts: [cp(p)] }; S.ref = cp(p); return; }
      const a = S.draft.pts[0]; if (pointHere(a, p)) return;
      addEntities([mk('beam', { a: cp(a), b: cp(p), bw: CONFIG.beam.b, bh: CONFIG.beam.h }, 'S-POUTRE')]); cancelDraft();
    },
    preview(p) { return S.draft && !pointHere(S.draft.pts[0], p) ? renderTemp([mk('beam', { a: cp(S.draft.pts[0]), b: cp(p), bw: CONFIG.beam.b, bh: CONFIG.beam.h }, 'S-POUTRE')]) : ''; },
  },
  slab: polyTool('DALLE', 3, pts => addEntities([mk('slab', { pts: pts.map(cp), t: CONFIG.slab.t }, 'S-DALLE')]), true),
  stair: {
    title: 'ESCALIER', hint: () => S.draft ? 'Direction de la montée' : "Point de départ de l'escalier",
    click(p) {
      if (!S.draft) { S.draft = { a: cp(p) }; S.ref = cp(p); return; }
      if (pointHere(S.draft.a, p)) return;
      addEntities([this.make(S.draft.a, p)]); cancelDraft();
    },
    make(a, p) {
      const n = Math.max(2, Math.round(curLevel().height / CONFIG.stair.riser));
      return mk('stair', { x: a.x, y: a.y, w: CONFIG.stair.width, n, tread: CONFIG.stair.tread, rot: deg(Math.atan2(p.y - a.y, p.x - a.x)) }, 'A-ESCALIER');
    },
    preview(p) { return S.draft && !pointHere(S.draft.a, p) ? renderTemp([this.make(S.draft.a, p)]) : ''; },
  },
  room: polyTool('PIÈCE', 3, pts => {
    const k = S.opts.roomKind, name = (OPT.roomKind.find(x => x[0] === k) || [k, 'Pièce'])[1];
    addEntities([mk('room', { pts: pts.map(cp), name, kind: k }, 'A-PIECE')]);
  }, true),
  axis: {
    title: 'AXE', hint: () => S.draft ? "Extrémité de l'axe" : "Début de l'axe de trame",
    click(p) {
      if (!S.draft) { S.draft = { pts: [cp(p)] }; S.ref = cp(p); return; }
      const a = S.draft.pts[0]; if (pointHere(a, p)) return;
      addEntities([mk('axis', { a: cp(a), b: cp(p), label: nextAxisLabel(a, p) }, 'A-AXE')]); cancelDraft();
    },
    preview(p) { return S.draft ? pvLine(S.draft.pts[0], p) : ''; },
  },
  furniture: {
    title: 'MOBILIER', hint: () => `Cliquez pour placer : ${(OPT.furn.find(f => f[0] === S.toolArg) || [])[1]} · Tab = pivoter de 90°`,
    make(p) { const [w, h] = FURN_SIZE[S.toolArg]; return mk('furniture', { kind: S.toolArg, x: p.x, y: p.y, w, h, rot: S.opts.tmpRot }, 'A-MOBILIER'); },
    click(p) { addEntities([this.make(p)]); },
    preview(p) { return renderTemp([this.make(p)]); },
    tab() { S.opts.tmpRot = (S.opts.tmpRot + 90) % 360; },
  },

  symbol: {
    title: 'SYMBOLE', hint: () => `${SYMBOLS[S.toolArg].label} — ${SYMBOLS[S.toolArg].attach === 'wall' ? 'survolez un mur (orientation automatique)' : 'cliquez pour placer'} · Tab = pivoter`,
    make(sym, pl) {
      const d = SYMBOLS[sym];
      return mk('symbol', { sym, x: pl.x, y: pl.y, rot: pl.rot, h: d.h, tag: d.tag || '', power: d.power || 0, circuit: d.nocirc ? null : S.activeCircuit }, d.layer);
    },
    click(p) { addEntities([this.make(S.toolArg, symPlacement(S.toolArg, S.cursorRaw, p))]); },
    preview(p) { return renderTemp([this.make(S.toolArg, symPlacement(S.toolArg, S.cursorRaw, p))]); },
    tab() { S.opts.tmpRot = (S.opts.tmpRot + 90) % 360; },
  },
  cable: {
    title: 'CÂBLE', hint: () => S.draft ? 'Point suivant (accrochez-vous aux symboles) — Entrée pour terminer' : (S.activeCircuit ? 'Premier point du câble' : 'Astuce : créez/activez un circuit (onglet Circuits) avant de câbler'),
    click(p) {
      if (!S.draft) { S.draft = { pts: [cp(p)] }; S.ref = cp(p); return; }
      const pts = S.draft.pts; if (pointHere(pts[pts.length - 1], p)) return;
      pts.push(cp(p)); S.ref = cp(p);
    },
    preview(p) { return S.draft ? pvPoly([...S.draft.pts, p], false) : ''; },
    enter() {
      const pts = S.draft ? S.draft.pts : [];
      if (pts.length >= 2) {
        if (S.readOnly) { cancelDraft(); setHint(); return; }
        pushUndo();
        S.P.entities.push(mk('cable', { pts: pts.map(cp), circuit: S.activeCircuit, conductors: 3 }, 'E-CABLE'));
        if (S.activeCircuit) for (const s of S.P.entities) {
          if (s.type === 'symbol' && s.level === S.level && !s.circuit && !SYMBOLS[s.sym].nocirc && pts.some(q => dist(q, s) < 60)) s.circuit = S.activeCircuit;
        }
        changed();
      } else if (pts.length) toastMsg('Il faut au moins 2 points');
      cancelDraft(); setHint();
    },
  },

  dim: dimTool(false),
  dimchain: dimTool(true),
  text: {
    title: 'TEXTE', hint: () => 'Cliquez pour placer le texte',
    click(p) {
      askText('Texte', '', v => { if (v.trim()) addEntities([mk('text', { x: p.x, y: p.y, text: v, size: CONFIG.paper.text, rot: 0 }, 'A-TEXTE')]); });
    },
  },
  sheet: {
    title: 'PLANCHE', hint: () => "Cliquez pour centrer la planche d'impression à cet endroit",
    click(p) {
      const d = sheetDims(), f = frameRect(d), sc = SC();
      S.P.meta.sheetOrigin = { x: p.x - f.w * sc / 2, y: p.y - f.h * sc / 2 };
      S.showSheet = true; changed(); setTool('select');
    },
  },

  move: modTool({
    title: 'DÉPLACER',
    hint: d => d.stage === 1 ? 'Point de base' : 'Point de destination',
    click(p) {
      const d = S.draft;
      if (d.stage === 1) { d.base = cp(p); d.stage = 2; S.ref = cp(p); setHint(); return; }
      if (d.stage === 2) {
        const delta = sub(p, d.base); pushUndo();
        applyXform(selEnts(), { p: q => add(q, delta), rot: r => r, delta }); changed(); setTool('select');
      }
    },
    preview(p) { const d = S.draft; return d.stage === 2 ? previewXform({ p: q => add(q, sub(p, d.base)), rot: r => r }) : ''; },
  }),
  copy: modTool({
    title: 'COPIER',
    hint: d => d.stage === 1 ? 'Point de base' : 'Point de destination (autant de copies que voulu) — Entrée pour terminer',
    click(p) {
      const d = S.draft;
      if (d.stage === 1) { d.base = cp(p); d.stage = 2; S.ref = cp(p); setHint(); return; }
      if (d.stage === 2) {
        const delta = sub(p, d.base), list = cloneSet(selEnts());
        pushUndo(); S.P.entities.push(...list); touch();
        applyXform(list, { p: q => add(q, delta), rot: r => r, delta: null }); changed();
      }
    },
    preview(p) { const d = S.draft; return d.stage === 2 ? previewXform({ p: q => add(q, sub(p, d.base)), rot: r => r }) : ''; },
  }),
  rotate: modTool({
    title: 'PIVOTER',
    hint: d => d.stage === 1 ? 'Point de base' : 'Angle : cliquez, ou tapez des degrés (positif = anti-horaire)',
    click(p) {
      const d = S.draft;
      if (d.stage === 1) { d.base = cp(p); d.stage = 2; S.ref = cp(p); setHint(); return; }
      if (d.stage === 2) this.apply(Math.atan2(p.y - d.base.y, p.x - d.base.x));
    },
    apply(a) { const base = S.draft.base; pushUndo(); applyXform(selEnts(), { p: q => rotP(q, base, a), rot: r => r + deg(a) }); changed(); setTool('select'); },
    typed(n) { if (S.draft.stage === 2) this.apply(-rad(n)); },
    preview(p) { const d = S.draft; if (d.stage !== 2) return ''; const a = Math.atan2(p.y - d.base.y, p.x - d.base.x); return previewXform({ p: q => rotP(q, d.base, a), rot: r => r + deg(a) }); },
  }),
  mirror: modTool({
    title: 'MIROIR',
    hint: d => d.stage === 1 ? "Premier point de l'axe de symétrie" : "Second point de l'axe (les originaux sont conservés)",
    click(p) {
      const d = S.draft;
      if (d.stage === 1) { d.base = cp(p); d.stage = 2; S.ref = cp(p); setHint(); return; }
      if (d.stage === 2) {
        if (pointHere(d.base, p)) return;
        const m = this.mk(d.base, p), list = cloneSet(selEnts());
        pushUndo(); S.P.entities.push(...list); touch(); applyXform(list, m); changed(); setTool('select');
      }
    },
    mk(A, B) {
      const u = unit(sub(B, A)), phi = deg(Math.atan2(u.y, u.x));
      return { flip: true, p: q => { const v = sub(q, A), par = mul(u, dot(v, u)); return add(A, sub(mul(par, 2), v)); }, rot: r => 2 * phi - r };
    },
    preview(p) { const d = S.draft; return d.stage === 2 && !pointHere(d.base, p) ? pvLine(d.base, p) + previewXform(this.mk(d.base, p)) : ''; },
  }),
  scale: modTool({
    title: 'ÉCHELLE',
    hint: () => 'Point de base (les épaisseurs et tailles de symboles ne changent pas)',
    click(p) {
      const base = cp(p);
      askNumber("Facteur d'échelle", 2, k => {
        if (!(k > 0)) return toastMsg('Facteur invalide');
        pushUndo(); applyXform(selEnts(), { p: q => add(base, mul(sub(q, base), k)), rot: r => r, k }); changed(); setTool('select');
      });
    },
  }),
  offset: {
    title: 'DÉCALER',
    hint: () => !S.draft || S.draft.stage === 1 ? `Distance ${S.opts.offsetDist} mm (tapez une valeur) — cliquez l'objet à décaler` : 'Cliquez du côté où décaler',
    start() { S.draft = { stage: 1 }; },
    typed(n) { if (n > 0) { S.opts.offsetDist = n; toastMsg(`Distance de décalage : ${n} mm`); setHint(); } },
    click(p) {
      const d = S.draft;
      if (d.stage === 1) {
        const e = pickAt(p, 8 / S.view.z, ['wall', 'line', 'beam', 'axis', 'polyline', 'circle']);
        if (!e) return toastMsg('Objet non décalable');
        d.target = e; d.stage = 2; S.sel = new Set([e.id]); renderOverlay(); setHint(); return;
      }
      const c = this.build(d.target, p); if (!c) return;
      pushUndo(); S.P.entities.push(c); S.sel = new Set(); changed(); S.draft = { stage: 1 }; setHint();
    },
    build(e, p) {
      const dd = S.opts.offsetDist, c = JSON.parse(JSON.stringify(e)); c.id = uid();
      if (e.type === 'circle') { const inside = dist(p, e.c) < e.r; c.r = inside ? e.r - dd : e.r + dd; return c.r > 1 ? c : null; }
      if (e.type === 'polyline') {
        const closed = !!e.closed, n = e.pts.length; let bi = 0, bd = Infinity;
        for (let i = 0; i < n - (closed ? 0 : 1); i++) { const r = distPtSeg(p, e.pts[i], e.pts[(i + 1) % n]); if (r.d < bd) { bd = r.d; bi = i; } }
        const a = e.pts[bi], b = e.pts[(bi + 1) % n], q = distPtSeg(p, a, b).q, side = dot(sub(p, q), normal(unit(sub(b, a)))) >= 0 ? 1 : -1;
        c.pts = offsetPoly(e.pts, closed, side * dd); return c;
      }
      const u = unit(sub(e.b, e.a)), q = distPtSeg(p, e.a, e.b).q, side = dot(sub(p, q), normal(u)) >= 0 ? 1 : -1, v = mul(normal(u), side * dd);
      c.a = add(e.a, v); c.b = add(e.b, v); return c;
    },
    preview(p) { const d = S.draft; if (!d || d.stage !== 2) return ''; const c = this.build(d.target, p); return c ? renderTemp([c]) : ''; },
  },
  trim: {
    title: 'AJUSTER', hint: () => "Cliquez la partie d'une ligne/d'un mur à supprimer (entre deux intersections)",
    start() { S.draft = { stage: 1 }; },
    click(p) {
      const e = pickAt(p, 8 / S.view.z, ['line', 'wall']);
      if (!e) return toastMsg('Sélectionnez une ligne ou un mur');
      const a = e.a, b = e.b, L = dist(a, b), t0 = distPtSeg(p, a, b).t, ts = [];
      for (const o of visibleEnts()) {
        if (o.id === e.id) continue;
        for (const ed of edgesOf(o)) { const q = segInter(a, b, ed.a, ed.b); if (q && q.t > 1e-6 && q.t < 1 - 1e-6) ts.push(q.t); }
      }
      ts.sort((x, y) => x - y);
      const prev = ts.filter(t => t < t0).pop(), next = ts.find(t => t > t0);
      if (prev === undefined && next === undefined) return toastMsg('Aucune intersection pour couper');
      const P = t => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      const pcs = []; if (prev !== undefined) pcs.push([0, prev]); if (next !== undefined) pcs.push([next, 1]);
      pushUndo();
      const ops = S.P.entities.filter(o => o.type === 'opening' && o.wall === e.id);
      const e2 = pcs.length === 2 ? Object.assign(JSON.parse(JSON.stringify(e)), { id: uid() }) : null;
      const targets = e2 ? [e, e2] : [e];
      pcs.forEach((pc, i) => { targets[i].a = P(pc[0]); targets[i].b = P(pc[1]); });
      if (e2) S.P.entities.push(e2);
      if (e.type === 'wall') {
        const gone = new Set();
        for (const o of ops) {
          let placed = false;
          pcs.forEach((pc, i) => {
            const s0 = pc[0] * L, s1 = pc[1] * L;
            if (!placed && o.offset >= s0 - 1 && o.offset + o.w <= s1 + 1) { o.wall = targets[i].id; o.offset = Math.max(0, o.offset - s0); placed = true; }
          });
          if (!placed) gone.add(o.id);
        }
        S.P.entities = S.P.entities.filter(x => !gone.has(x.id));
      }
      changed();
    },
  },
  extend: {
    title: 'PROLONGER', hint: () => "Cliquez près de l'extrémité d'une ligne/d'un mur à prolonger jusqu'à l'obstacle",
    start() { S.draft = { stage: 1 }; },
    click(p) {
      const e = pickAt(p, 8 / S.view.z, ['line', 'wall']);
      if (!e) return toastMsg('Sélectionnez une ligne ou un mur');
      const endB = distPtSeg(p, e.a, e.b).t > 0.5, from = endB ? e.a : e.b, to = endB ? e.b : e.a, u = unit(sub(to, from));
      const far = add(to, mul(u, 1e7)); let best = Infinity;
      for (const o of visibleEnts()) {
        if (o.id === e.id) continue;
        for (const ed of edgesOf(o)) { const q = segInter(to, far, ed.a, ed.b); if (q) { const s = q.t * 1e7; if (s > 1e-3 && s < best) best = s; } }
      }
      if (!isFinite(best)) return toastMsg('Aucun obstacle trouvé');
      pushUndo();
      const np = add(to, mul(u, best));
      if (endB) e.b = np; else { e.a = np; if (e.type === 'wall') S.P.entities.forEach(o => { if (o.type === 'opening' && o.wall === e.id) o.offset += best; }); }
      changed();
    },
  },
  erase: {
    title: 'EFFACER', hint: () => 'Sélectionnez les objets à effacer, puis Entrée',
    start() { if (S.sel.size) { deleteEntities([...S.sel]); setTimeout(() => setTool('select'), 0); } else S.draft = { stage: 0 }; },
    enter() { if (S.sel.size) { deleteEntities([...S.sel]); setTool('select'); } else toastMsg('Aucun objet sélectionné'); },
  },
};
function edgesOf(e) {
  if (e.type === 'polyline' || e.type === 'room' || e.type === 'slab') {
    const n = e.pts.length, closed = e.type !== 'polyline' || e.closed, out = [];
    for (let i = 0; i < n - (closed ? 0 : 1); i++) out.push({ a: e.pts[i], b: e.pts[(i + 1) % n] });
    return out;
  }
  if (e.a && e.b && (e.type === 'line' || e.type === 'wall' || e.type === 'beam' || e.type === 'axis')) return [{ a: e.a, b: e.b }];
  return [];
}

function dimTool(chain) {
  return {
    title: chain ? 'COTES EN CHAÎNE' : 'COTE',
    hint: () => {
      const d = S.draft; if (!d) return 'Premier point à coter';
      if (d.stage === 1) return 'Second point';
      return chain && d.off !== undefined ? 'Point suivant de la chaîne — Entrée pour terminer' : 'Position de la ligne de cote';
    },
    click(p) {
      const d = S.draft;
      if (!d) { S.draft = { p1: cp(p), stage: 1 }; S.ref = cp(p); return; }
      if (d.stage === 1) {
        if (pointHere(d.p1, p)) return;
        if (chain && d.off !== undefined) { addEntities([mk('dim', { p1: cp(d.p1), p2: cp(p), off: d.off }, 'A-COTE')]); S.draft = { p1: cp(p), stage: 1, off: d.off }; S.ref = cp(p); return; }
        d.p2 = cp(p); d.stage = 2; return;
      }
      const g = dimGeom({ p1: d.p1, p2: d.p2, off: 0 }), off = dot(sub(p, d.p1), g.n);
      addEntities([mk('dim', { p1: cp(d.p1), p2: cp(d.p2), off }, 'A-COTE')]);
      if (chain) { S.draft = { p1: cp(d.p2), stage: 1, off }; S.ref = cp(d.p2); } else cancelDraft();
    },
    preview(p) {
      const d = S.draft; if (!d) return '';
      if (d.stage === 1) {
        if (chain && d.off !== undefined && !pointHere(d.p1, p)) return renderTemp([mk('dim', { p1: cp(d.p1), p2: cp(p), off: d.off }, 'A-COTE')]);
        return pvLine(d.p1, p);
      }
      const g = dimGeom({ p1: d.p1, p2: d.p2, off: 0 });
      return renderTemp([mk('dim', { p1: cp(d.p1), p2: cp(d.p2), off: dot(sub(p, d.p1), g.n) }, 'A-COTE')]);
    },
    enter() { cancelDraft(); setHint(); },
  };
}

/* =====================================================================
   INTERACTIONS : souris / tactile / clavier / ligne de commande
   ===================================================================== */
const G = { ptrs: new Map(), mode: null, box: null, drag: null, grip: null, pan: null, pinch: null };
const MODIFY = ['move', 'copy', 'rotate', 'mirror', 'scale', 'erase'];
const isModify = () => MODIFY.includes(S.tool);
const selectPhase = () => S.tool === 'select' || (isModify() && S.draft && S.draft.stage === 0);

function selectionChanged() { renderOverlay(); renderProps(); if (S.tab === 'rep') renderReport(); }
function refreshPreview() {
  const t = TOOLS[S.tool];
  S.previewSVG = '';
  if (t && t.preview && !selectPhase()) { try { S.previewSVG = t.preview(S.cursor) || ''; } catch (e) { S.previewSVG = ''; } }
  updateHud(); renderOverlay();
}
function toolClick(p, ev) {
  if (S.readOnly) return;
  const t = TOOLS[S.tool];
  if (t && t.click && !selectPhase()) t.click(cp(p), ev);
  setHint(); refreshPreview();
}

function startPinch() {
  const [a, b] = [...G.ptrs.values()], r = svg.getBoundingClientRect();
  G.mode = 'pinch';
  G.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, m0: { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top }, v0: Object.assign({}, S.view) };
}
function doPinch() {
  const pts = [...G.ptrs.values()]; if (pts.length < 2) return;
  const [a, b] = pts, r = svg.getBoundingClientRect(), P = G.pinch;
  const d = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
  const z = clamp(P.v0.z * d / P.d0, 0.002, 4), wx = (P.m0.x - P.v0.x) / P.v0.z, wy = (P.m0.y - P.v0.y) / P.v0.z;
  S.view.z = z; S.view.x = m.x - wx * z; S.view.y = m.y - wy * z; applyView(); renderSoon();
}
function dragApply(delta) {
  const arr = S.P.entities;
  for (const [id, str] of G.drag.orig) { const i = arr.findIndex(e => e.id === id); if (i >= 0) arr[i] = JSON.parse(str); }
  touch();
  applyXform(selEnts(), { p: q => add(q, delta), rot: r => r, delta });
  touch(); render();
}
function finishBox() {
  const b = G.box; G.box = null;
  if (!b) return;
  const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
  if ((x1 - x0) * S.view.z < 4 && (y1 - y0) * S.view.z < 4) { renderOverlay(); return; }
  const crossing = b.x1 < b.x0;
  for (const e of S.P.entities) {
    if (!selectable(e)) continue;
    const bb = bboxOf(e);
    const inside = bb.x0 >= x0 && bb.x1 <= x1 && bb.y0 >= y0 && bb.y1 <= y1;
    const touches = !(bb.x1 < x0 || bb.x0 > x1 || bb.y1 < y0 || bb.y0 > y1);
    if (crossing ? (e.type === 'room' || e.type === 'slab' ? inside : touches) : inside) S.sel.add(e.id);
  }
  selectionChanged();
}

svg.addEventListener('pointerdown', ev => {
  try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ignoré */ }
  G.ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (G.ptrs.size === 2) { G.box = null; G.drag = null; G.grip = null; startPinch(); return; }
  if (G.ptrs.size > 2) return;
  const wantPan = ev.button === 1 || (ev.pointerType === 'mouse' && ev.button === 0 && S.spaceDown) || S.panMode;
  if (wantPan) { G.mode = 'pan'; G.pan = { sx: ev.clientX, sy: ev.clientY, vx: S.view.x, vy: S.view.y }; return; }
  if (ev.pointerType === 'mouse' && ev.button !== 0) return;
  const raw = evWorld(ev); updateCursor(raw, ev.shiftKey);
  if (selectPhase()) {
    const tol = 8 / S.view.z;
    if (S.tool === 'select' && S.sel.size === 1) {
      const e = selEnts()[0], g = e && gripsOf(e).find(g => Math.hypot(g.x - raw.x, g.y - raw.y) <= 9 / S.view.z);
      if (g && !S.readOnly) { pushUndo(); G.mode = 'grip'; G.grip = { g, e }; return; }
    }
    const hit = pickAt(raw, tol);
    if (hit) {
      if (ev.shiftKey && S.sel.has(hit.id)) { S.sel.delete(hit.id); selectionChanged(); G.mode = 'none'; return; }
      if (!S.sel.has(hit.id)) { if (!ev.shiftKey) S.sel.clear(); S.sel.add(hit.id); selectionChanged(); }
      if (S.tool === 'select' && !S.readOnly) G.mode = 'drag', G.drag = { origin: cp(raw), moved: false, orig: new Map([...S.sel].map(id => [id, JSON.stringify(byId(id))])) };
      else G.mode = 'none';
    } else {
      if (!ev.shiftKey && S.sel.size) { S.sel.clear(); selectionChanged(); }
      G.mode = 'box'; G.box = { x0: raw.x, y0: raw.y, x1: raw.x, y1: raw.y };
    }
    return;
  }
  G.mode = 'click';
});
svg.addEventListener('pointermove', ev => {
  const pr = G.ptrs.get(ev.pointerId); if (pr) { pr.x = ev.clientX; pr.y = ev.clientY; }
  if (G.mode === 'pinch') { doPinch(); return; }
  if (G.mode === 'pan') { S.view.x = G.pan.vx + (ev.clientX - G.pan.sx); S.view.y = G.pan.vy + (ev.clientY - G.pan.sy); applyView(); return; }
  const raw = evWorld(ev);
  if (G.mode === 'grip') {
    updateCursor(raw, ev.shiftKey); G.grip.g.fn(S.cursor);
    if (G.grip.e.type === 'wall') fixOpeningsOf(G.grip.e.id);
    touch(); render(); return;
  }
  if (G.mode === 'drag') {
    const d = G.drag, st = gridStep();
    let dx = raw.x - d.origin.x, dy = raw.y - d.origin.y;
    if (!d.moved) { if (Math.hypot(dx, dy) * S.view.z < 4) return; d.moved = true; pushUndo(); }
    if (S.snap.grid) { dx = Math.round(dx / st) * st; dy = Math.round(dy / st) * st; }
    if (S.shift || S.snap.ortho) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
    dragApply({ x: dx, y: dy }); return;
  }
  if (G.mode === 'box') { G.box.x1 = raw.x; G.box.y1 = raw.y; updateCursor(raw, ev.shiftKey); renderOverlay(); return; }
  updateCursor(raw, ev.shiftKey); refreshPreview();
});
function pointerEnd(ev, cancelled) {
  G.ptrs.delete(ev.pointerId);
  if (G.mode === 'pinch') { if (G.ptrs.size < 2) G.mode = null; return; }
  const mode = G.mode; G.mode = null;
  if (mode === 'pan' || cancelled) { G.box = null; return; }
  if (mode === 'grip') { G.grip = null; changed(); return; }
  if (mode === 'drag') { const m = G.drag.moved; G.drag = null; if (m) changed(); return; }
  if (mode === 'box') { finishBox(); return; }
  if (mode === 'click') { updateCursor(evWorld(ev), ev.shiftKey); toolClick(S.cursor, ev); }
}
svg.addEventListener('pointerup', ev => pointerEnd(ev, false));
svg.addEventListener('pointercancel', ev => pointerEnd(ev, true));
svg.addEventListener('pointerleave', () => { if (!G.mode) { S.snapHit = null; const h = $('#hud'); if (h) h.style.display = 'none'; } });
svg.addEventListener('wheel', ev => {
  ev.preventDefault();
  const r = svg.getBoundingClientRect();
  zoomAt(ev.clientX - r.left, ev.clientY - r.top, Math.exp(-clamp(ev.deltaY, -120, 120) * 0.002));
}, { passive: false });
svg.addEventListener('contextmenu', ev => { ev.preventDefault(); enterKey(); });
svg.addEventListener('dblclick', () => { const t = TOOLS[S.tool]; if (t && t.enter && anyDraft() && !isModify()) enterKey(); });

function enterKey() {
  const t = TOOLS[S.tool];
  if (S.tool === 'select') { if (S.lastCmd) runCommand(S.lastCmd); }
  else if (t && t.enter) t.enter();
  else { cancelDraft(); setTool('select'); }
  setHint(); refreshPreview();
}
function escKey() {
  const t = TOOLS[S.tool];
  if (anyDraft()) { if (t && t.start) t.start(S.toolArg); else cancelDraft(); }
  else if (S.tool !== 'select') setTool('select');
  else if (S.sel.size) { S.sel.clear(); selectionChanged(); }
  setHint(); refreshPreview();
}
function deleteSelection() { if (S.sel.size) deleteEntities([...S.sel]); }
function selectAll() { S.sel = new Set(S.P.entities.filter(selectable).map(e => e.id)); selectionChanged(); }
function copyClip() { if (!S.sel.size) return; S.clip = JSON.stringify(cloneSet(selEnts(), true)); toastMsg(`${S.sel.size} objet(s) copié(s)`); }
function pasteClip() {
  if (S.readOnly) return;
  if (!S.clip) return toastMsg('Presse-papiers vide');
  const list = JSON.parse(S.clip), map = new Map();
  list.forEach(e => { const n = uid(); map.set(e.id, n); e.id = n; e.level = S.level; });
  list.forEach(e => { if (e.type === 'opening') e.wall = map.get(e.wall) || e.wall; });
  pushUndo(); S.P.entities.push(...list); touch();
  applyXform(list, { p: q => add(q, { x: 300, y: 300 }), rot: r => r });
  S.sel = new Set(list.map(e => e.id)); changed();
}
function toggleSnap(k) {
  S.snap[k] = !S.snap[k];
  if (k === 'ortho' && S.snap.ortho) S.snap.polar = false;
  if (k === 'polar' && S.snap.polar) S.snap.ortho = false;
  $$('[data-tg]').forEach(b => b.classList.toggle('on', !!S.snap[b.dataset.tg]));
  updateCursor(S.cursorRaw, S.shift); refreshPreview();
}

_kd = ev => {
  if (!_root || !document.body.contains(_root)) return;
  const tag = (ev.target.tagName || '').toLowerCase(), inField = tag === 'input' || tag === 'textarea' || tag === 'select';
  const modalEl = $('#modal');
  if (ev.key === 'Escape') { if (modalEl && modalEl.classList.contains('on')) closeModal(); else { if (inField) ev.target.blur(); escKey(); } ev.preventDefault(); return; }
  const fk = { F3: 'osnap', F7: 'grid', F8: 'ortho', F10: 'polar' }[ev.key];
  if (fk) { ev.preventDefault(); toggleSnap(fk); return; }
  if (modalEl && modalEl.classList.contains('on')) return;
  if (inField) return;
  if (ev.ctrlKey || ev.metaKey) {
    const k = ev.key.toLowerCase();
    if (k === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); }
    else if (k === 'y') { ev.preventDefault(); redo(); }
    else if (k === 'a') { ev.preventDefault(); selectAll(); }
    else if (k === 'c') { ev.preventDefault(); copyClip(); }
    else if (k === 'v') { ev.preventDefault(); pasteClip(); }
    else if (k === 's') { ev.preventDefault(); exportJSON(); }
    return;
  }
  if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); deleteSelection(); return; }
  if (ev.key === 'Enter') { ev.preventDefault(); enterKey(); return; }
  if (ev.key === ' ') { ev.preventDefault(); S.spaceDown = true; return; }
  if (ev.key === 'Tab') { const t = TOOLS[S.tool]; if (t && t.tab) { ev.preventDefault(); t.tab(ev.shiftKey); setHint(); refreshPreview(); } return; }
  if (ev.key.length === 1 && !ev.altKey) { const c = $('#cmd'); if (c) c.focus(); }
};
_ku = ev => { if (!_root || !document.body.contains(_root)) return; if (ev.key === ' ') S.spaceDown = false; };
window.addEventListener('keydown', _kd);
window.addEventListener('keyup', _ku);

const ALIASES = {
  L: 'line', LIGNE: 'line', PL: 'polyline', POLYLIGNE: 'polyline', REC: 'rect', RECTANGLE: 'rect', C: 'circle', CERCLE: 'circle',
  MU: 'wall', MUR: 'wall', PORTE: ['opening', 'porte'], DOUBLE: ['opening', 'double'], FEN: ['opening', 'fenetre'], FENETRE: ['opening', 'fenetre'], BAIE: ['opening', 'baie'],
  PO: 'column', POTEAU: 'column', PT: 'beam', POUTRE: 'beam', DALLE: 'slab', ESC: 'stair', ESCALIER: 'stair', PI: 'room', PIECE: 'room', AXE: 'axis',
  T: 'text', TEXTE: 'text', DIM: 'dim', COTE: 'dim', CH: 'dimchain', CHAINE: 'dimchain',
  M: 'move', DEPLACER: 'move', CO: 'copy', COPIER: 'copy', RO: 'rotate', ROTATION: 'rotate', PIVOTER: 'rotate', MI: 'mirror', MIROIR: 'mirror',
  SC: 'scale', ECHELLE: 'scale', O: 'offset', DECALER: 'offset', TR: 'trim', AJUSTER: 'trim', EX: 'extend', PROLONGER: 'extend', E: 'erase', EFFACER: 'erase',
  CABLE: 'cable', PLANCHE: 'sheet', SEL: 'select',
};
const deacc = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
function parsePoint(txt) {
  const t = txt.replace(/\s/g, '').replace(/,/g, ';');
  const rel = t.startsWith('@'), body = rel ? t.slice(1) : t, r = S.ref || { x: 0, y: 0 };
  let m = body.match(/^(-?[\d.]+);(-?[\d.]+)$/);
  if (m) { const x = parseFloat(m[1]), y = parseFloat(m[2]); return rel ? { x: r.x + x, y: r.y - y } : { x, y: -y }; }
  m = body.match(/^(-?[\d.]+)<(-?[\d.]+)$/);
  if (m && rel) { const d = parseFloat(m[1]), a = rad(parseFloat(m[2])); return { x: r.x + d * Math.cos(a), y: r.y - d * Math.sin(a) }; }
  return null;
}
function feedPoint(p) { toolClick(p, null); }
function typedNumber(n) {
  const t = TOOLS[S.tool];
  if (t && t.typed && (!S.draft || S.draft.stage === undefined || S.draft.stage >= 1)) { t.typed(n); return; }
  if (S.ref && S.draft) {
    let v = sub(S.cursor, S.ref); if (vlen(v) < 1e-6) v = sub(S.cursorRaw, S.ref);
    const u = unit(v); feedPoint({ x: S.ref.x + u.x * n, y: S.ref.y + u.y * n });
  } else toastMsg('Saisie de distance : lancez d\'abord une commande de dessin');
}
function runCommand(raw) {
  if (S.readOnly) return;
  const txt = deacc(raw.trim()).toUpperCase();
  if (!txt) { enterKey(); return; }
  const pt = parsePoint(txt); if (pt) { feedPoint(pt); return; }
  if (/^-?\d+(\.\d+)?$/.test(txt)) { typedNumber(parseFloat(txt)); return; }
  const fns = {
    U: undo, ANNULER: undo, REDO: redo, REFAIRE: redo, ZE: zoomExtents, ZOOM: zoomExtents, Z: zoomExtents, TOUT: selectAll,
    GRILLE: () => toggleSnap('grid'), ORTHO: () => toggleSnap('ortho'), POLAIRE: () => toggleSnap('polar'), ACCROCHAGE: () => toggleSnap('osnap'),
    AIDE: showHelp, '?': showHelp, CARTOUCHE: openTitleBlock, IMPRIMER: exportPDF, PDF: exportPDF, SVG: exportSVG, PNG: exportPNG, JSON: exportJSON,
    VERIF: () => { setPanel('rep'); }, NOUVEAU: newDrawing,
  };
  if (fns[txt]) { fns[txt](); return; }
  const a = ALIASES[txt];
  if (a) { S.lastCmd = raw; if (Array.isArray(a)) setTool(a[0], a[1]); else setTool(a); return; }
  const symKey = Object.keys(SYMBOLS).find(k => k.toUpperCase() === txt);
  if (symKey) { S.lastCmd = raw; setTool('symbol', symKey); return; }
  toastMsg(`Commande inconnue : ${raw}  (tapez AIDE)`);
}
const cmdEl = $('#cmd');
if (cmdEl) cmdEl.addEventListener('keydown', ev => {
  if (ev.key === 'Enter') { ev.preventDefault(); const v = ev.target.value; ev.target.value = ''; ev.target.blur(); runCommand(v); }
  else if (ev.key === 'Escape') { ev.target.value = ''; ev.target.blur(); }
  ev.stopPropagation();
});

/* =====================================================================
   INTERFACE : ruban, panneaux, modales
   ===================================================================== */
const ICON = {
  select: 'M5 3l12 8-5 1.5L9.5 18z', line: 'M4 20L20 4', polyline: 'M3 18l6-9 5 6 7-10', rect: 'M4 6h16v12H4z',
  circle: 'M12 4a8 8 0 100 16 8 8 0 000-16z', text: 'M5 6h14M12 6v13M9 19h6',
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  copy: 'M8 8h11v11H8zM5 15V5h10', rotate: 'M20 12a8 8 0 11-3-6.2M20 4v5h-5', mirror: 'M12 3v18M8 7L3 17h5zM16 7l5 10h-5z',
  offset: 'M4 8h16M4 16h16M12 10v4', scale: 'M5 19L19 5M14 5h5v5M10 19H5v-5', trim: 'M4 12h6M14 12h6M12 5v14', extend: 'M4 12h9M13 8l5 4-5 4M20 5v14',
  erase: 'M4 16l8-9 8 8-4 4H8zM9 12l7 7', undo: 'M9 7L4 12l5 5M4 12h11a5 5 0 010 10h-3', redo: 'M15 7l5 5-5 5M20 12H9a5 5 0 000 10h3',
  wall: 'M3 9h18v6H3zM8 9l-3 6M13 9l-3 6M18 9l-3 6', door: 'M5 20V4M5 20h14M5 4a16 16 0 0114 16', slide: 'M3 12h18M3 9h10v3M11 12h10v3',
  window: 'M3 8h18M3 12h18M3 16h18M3 8v8M21 8v8', column: 'M7 7h10v10H7z', beam: 'M3 9h4M10 9h4M17 9h4M3 15h4M10 15h4M17 15h4',
  slab: 'M4 12h4M10 12h4M16 12h4M4 7v10M20 7v10', stair: 'M4 20h4v-4h4v-4h4V8h4V4', room: 'M5 5h14v14H5zM9 12h6',
  axis: 'M12 12v9M12 3a4 4 0 100 8 4 4 0 000-8z', furn: 'M4 10h16v8H4zM6 10V6h12v4', cable: 'M4 18c4-10 12 6 16-12',
  circ: 'M4 12h4l3-6 3 12 3-6h3', check: 'M5 12l5 5 9-10', list: 'M8 6h12M8 12h12M8 18h12M4 6h1M4 12h1M4 18h1',
  dim: 'M4 6v12M20 6v12M4 12h16', sheet: 'M6 3h12v18H6zM9 15h6v3H9z', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  zfit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', zin: 'M11 4a7 7 0 100 14 7 7 0 000-14zM16 16l5 5M8 11h6M11 8v6', zout: 'M11 4a7 7 0 100 14 7 7 0 000-14zM16 16l5 5M8 11h6',
  grid: 'M4 4h16v16H4zM4 12h16M12 4v16', ortho: 'M4 20V8h16', snap: 'M12 6a6 6 0 100 12 6 6 0 000-12zM12 2v4M12 18v4M2 12h4M18 12h4', polar: 'M4 20L20 4M4 20h16',
  save: 'M5 3h11l3 3v15H5zM8 3v6h8V3M8 21v-7h8v7', open: 'M3 8h6l2 2h10v9H3z', img: 'M3 5h18v14H3zM7 15l4-5 3 4 2-2 3 3', pdf: 'M7 3h10v5H7zM5 8h14v9H5zM8 14h8v6H8z',
  csv: 'M5 3h10l4 4v14H5zM8 12h8M8 16h8', svgf: 'M8 8l-5 4 5 4M16 8l5 4-5 4M14 5l-4 14', level: 'M4 18h16M6 14h12M8 10h8M10 6h4', new: 'M6 3h9l4 4v14H6zM12 11v6M9 14h6', help: 'M12 17v.01M9.5 9a2.5 2.5 0 115 0c0 2-2.5 2-2.5 4',
};
const svgIco = k => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[k] || ICON.line}"/></svg>`;
const symIcon = (k, s) => `<svg viewBox="-6.5 -6.5 13 13" width="${s || 30}" height="${s || 30}" fill="none" stroke="currentColor" stroke-width="0.55" stroke-linecap="round" stroke-linejoin="round" style="color:#fff">${SYMBOLS[k].svg}</svg>`;

const T_ = (tool, label, icon, arg) => ({ t: 'tool', tool, label, icon: icon || tool, arg });
const F_ = (label, icon, fn) => ({ t: 'fn', label, icon, fn });
const SYMQ = k => ({ t: 'tool', tool: 'symbol', arg: k, label: SYMBOLS[k].label.split(' ').slice(0, 2).join(' '), sym: k });
const RIBBON = {
  accueil: [
    { g: 'Dessin', items: [T_('line', 'Ligne'), T_('polyline', 'Polyligne'), T_('rect', 'Rectangle'), T_('circle', 'Cercle'), T_('text', 'Texte')] },
    { g: 'Modifier', items: [T_('select', 'Sélection'), T_('move', 'Déplacer'), T_('copy', 'Copier'), T_('rotate', 'Pivoter'), T_('mirror', 'Miroir'), T_('offset', 'Décaler'), T_('scale', 'Échelle'), T_('trim', 'Ajuster'), T_('extend', 'Prolonger'), T_('erase', 'Effacer')] },
    { g: 'Historique', items: [F_('Annuler', 'undo', () => undo()), F_('Rétablir', 'redo', () => redo())] },
  ],
  archi: [
    { g: 'Murs', items: [{ t: 'sel', key: 'wallKind', label: 'Type de mur', opts: OPT.wallKind }, T_('wall', 'Mur')] },
    { g: 'Ouvertures', items: [T_('opening', 'Porte', 'door', 'porte'), T_('opening', 'Double', 'door', 'double'), T_('opening', 'Coulissante', 'slide', 'coulissante'), T_('opening', 'Fenêtre', 'window', 'fenetre'), T_('opening', 'Petite fen.', 'window', 'petite'), T_('opening', 'Baie', 'window', 'baie')] },
    { g: 'Structure', items: [{ t: 'sel', key: 'colSize', label: 'Section poteau', opts: CONFIG.column.sizes.map(s => [s, `${s}×${s}`]), num: true }, T_('column', 'Poteau'), T_('beam', 'Poutre'), T_('slab', 'Dalle'), T_('stair', 'Escalier')] },
    { g: 'Espaces', items: [{ t: 'sel', key: 'roomKind', label: 'Usage de la pièce', opts: OPT.roomKind }, T_('room', 'Pièce'), T_('axis', 'Axe')] },
    { g: 'Mobilier', items: [{ t: 'sel', key: 'furn', label: 'Mobilier / sanitaire', opts: OPT.furn, tool: 'furniture' }] },
  ],
  elec: [
    { g: 'Symboles courants', items: ['lum_plafond', 'applique', 'inter_simple', 'va_et_vient', 'prise16', 'prise_plan_travail', 'tableau'].map(SYMQ).concat([F_('Bibliothèque', 'list', () => setPanel('lib'))]) },
    { g: 'Câblage', items: [T_('cable', 'Câble'), F_('Circuits', 'circ', () => setPanel('circ')), { t: 'chk', key: 'cableCurve', label: 'Câbles courbes' }] },
    { g: 'Contrôle', items: [F_('Vérifier', 'check', () => setPanel('rep')), F_('Nomenclature', 'csv', () => exportBOM())] },
  ],
  annot: [
    { g: 'Cotation', items: [T_('dim', 'Cote'), T_('dimchain', 'Chaîne'), { t: 'sel', key: 'dimUnit', label: 'Unité des cotes', opts: [['mm', 'mm'], ['m', 'm']], meta: true }] },
    { g: 'Annotation', items: [T_('text', 'Texte')] },
    { g: 'Planche', items: [F_('Cartouche', 'sheet', () => openTitleBlock()), T_('sheet', 'Placer planche'), F_('Aperçu planche', 'eye', () => toggleSheet())] },
  ],
  vue: [
    { g: 'Zoom', items: [F_('Zoom étendu', 'zfit', () => zoomExtents()), F_('Zoom +', 'zin', () => zoomCenter(1.4)), F_('Zoom −', 'zout', () => zoomCenter(1 / 1.4))] },
    { g: 'Aides', items: [F_('Grille', 'grid', () => toggleSnap('grid')), F_('Ortho', 'ortho', () => toggleSnap('ortho')), F_('Accrochage', 'snap', () => toggleSnap('osnap')), F_('Polaire', 'polar', () => toggleSnap('polar'))] },
    { g: 'Niveaux', items: [F_('Nouveau niveau', 'level', () => addLevel()), F_('Aide', 'help', () => showHelp())] },
  ],
  export: [
    { g: 'Fichier', items: [F_('Enregistrer', 'save', () => exportJSON()), F_('Ouvrir', 'open', () => importJSON()), F_('Nouveau', 'new', () => newDrawing())] },
    { g: 'Exports de la planche', items: [F_('PNG', 'img', () => exportPNG()), F_('SVG', 'svgf', () => exportSVG()), F_('PDF / Imprimer', 'pdf', () => exportPDF())] },
    { g: 'Données', items: [F_('Nomenclature', 'csv', () => exportBOM()), F_('Circuits', 'csv', () => exportCircuits())] },
  ],
};
const TABS = [['accueil', 'Accueil'], ['archi', 'Architecture'], ['elec', 'Électricité'], ['annot', 'Annotation'], ['vue', 'Vue'], ['export', 'Fichier']];
let rbActions = [];
function renderTabs() {
  const el = $('#tabs'); if (!el) return;
  el.innerHTML = TABS.map(([k, l]) => `<button data-rt="${k}" class="${k === S.tabRibbon ? 'on' : ''}">${l}</button>`).join('');
}
function renderRibbon() {
  const el = $('#ribbon'); if (!el) return;
  rbActions = [];
  el.innerHTML = RIBBON[S.tabRibbon].map(g => `<div class="grp"><div class="items">${g.items.map(it => {
    if (it.t === 'sel') {
      const cur = it.meta ? S.P.meta[it.key] : S.opts[it.key];
      return `<label class="rsel">${esc(it.label)}<select data-rsel="${rbActions.push(it) - 1}">${it.opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    }
    if (it.t === 'chk') return `<button class="rb ${S.opts[it.key] ? 'on' : ''}" data-ra="${rbActions.push(it) - 1}">${svgIco('cable')}${esc(it.label)}</button>`;
    const i = rbActions.push(it) - 1, ico = it.sym ? symIcon(it.sym, 22) : svgIco(it.icon);
    return `<button class="rb" data-ra="${i}" title="${esc(it.label)}">${ico}<span>${esc(it.label)}</span></button>`;
  }).join('')}</div><div class="gname">${esc(g.g)}</div></div>`).join('');
  updateRibbonActive();
}
function updateRibbonActive() {
  $$('#ribbon .rb[data-ra]').forEach(b => {
    const it = rbActions[+b.dataset.ra]; if (!it || it.t !== 'tool') return;
    b.classList.toggle('on', it.tool === S.tool && (it.arg === undefined || it.arg === S.toolArg));
  });
  markLibrary();
}
const ribbonEl = $('#ribbon');
if (ribbonEl) {
  ribbonEl.addEventListener('click', ev => {
    if (S.readOnly) return;
    const b = ev.target.closest('[data-ra]'); if (!b) return;
    const it = rbActions[+b.dataset.ra];
    if (it.t === 'tool') { S.lastCmd = null; setTool(it.tool, it.arg); if (S.tool === 'symbol') setPanel('lib', true); }
    else if (it.t === 'fn') it.fn();
    else if (it.t === 'chk') { S.opts[it.key] = !S.opts[it.key]; b.classList.toggle('on', S.opts[it.key]); render(); }
  });
  ribbonEl.addEventListener('change', ev => {
    const s = ev.target.closest('[data-rsel]'); if (!s) return;
    const it = rbActions[+s.dataset.rsel], v = it.num ? Number(s.value) : s.value;
    if (it.meta) { S.P.meta[it.key] = v; changed(); return; }
    S.opts[it.key] = v;
    if (it.tool) setTool(it.tool, v); else setHint();
  });
}
const tabsEl = $('#tabs');
if (tabsEl) tabsEl.addEventListener('click', ev => { const b = ev.target.closest('[data-rt]'); if (b) { S.tabRibbon = b.dataset.rt; renderTabs(); renderRibbon(); } });

function setPanel(name, keepOpen) {
  S.tab = name;
  $$('#stabs button').forEach(b => b.classList.toggle('on', b.dataset.p === name));
  const ids = { props: 'pProps', layers: 'pLayers', lib: 'pLib', circ: 'pCirc', rep: 'pRep' };
  $$('.pn').forEach(p => p.classList.toggle('on', p.id === ids[name]));
  if (name === 'rep') renderReport();
  if (!keepOpen && stage.clientWidth && stage.clientWidth <= 860) { const s = $('#side'); if (s) s.classList.add('open'); }
}
const stabsEl = $('#stabs');
if (stabsEl) stabsEl.addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) setPanel(b.dataset.p, true); });
const sideToggleEl = $('#sideToggle');
if (sideToggleEl) sideToggleEl.addEventListener('click', () => { const s = $('#side'); if (s) s.classList.toggle('open'); });
function refreshPanels() { renderProps(); renderLayers(); renderCircuits(); renderLevelSelect(); if (S.tab === 'rep') renderReport(); }

const FIELDS = {
  wall: [['kind', 'Type', 'sel', OPT.wallKind], ['t', 'Épaisseur (mm)', 'num']],
  opening: [['kind', 'Type', 'sel', OPT.openKind], ['offset', 'Position (mm)', 'num'], ['w', 'Largeur (mm)', 'num'], ['h', 'Hauteur (mm)', 'num'], ['sill', 'Allège (mm)', 'num'], ['swing', 'Gond', 'sel', OPT.swing], ['side', 'Côté d\'ouverture', 'numsel', OPT.side]],
  column: [['s', 'Section (mm)', 'num'], ['rot', 'Angle (°)', 'num']],
  beam: [['bw', 'Largeur (mm)', 'num'], ['bh', 'Hauteur (mm)', 'num'], ['label', 'Étiquette', 'txt']],
  slab: [['t', 'Épaisseur (mm)', 'num']],
  stair: [['w', 'Largeur (mm)', 'num'], ['n', 'Nb de marches', 'num'], ['tread', 'Giron (mm)', 'num'], ['rot', 'Angle (°)', 'num']],
  room: [['kind', 'Usage', 'sel', OPT.roomKind], ['name', 'Nom', 'txt']],
  axis: [['label', 'Repère', 'txt']],
  furniture: [['w', 'Largeur (mm)', 'num'], ['h', 'Profondeur (mm)', 'num'], ['rot', 'Angle (°)', 'num']],
  symbol: [['tag', 'Repère / tag', 'txt'], ['circuit', 'Circuit', 'circuit'], ['h', 'Hauteur de pose (mm)', 'num'], ['power', 'Puissance (W)', 'num'], ['rot', 'Angle (°)', 'num']],
  cable: [['circuit', 'Circuit', 'circuit'], ['conductors', 'Conducteurs', 'num']],
  dim: [['off', 'Décalage (mm)', 'num']],
  text: [['text', 'Texte', 'area'], ['size', 'Hauteur (mm papier)', 'num'], ['rot', 'Angle (°)', 'num']],
  circle: [['r', 'Rayon (mm)', 'num']],
};
const TYPE_LABEL = { wall: 'Mur', opening: 'Ouverture', column: 'Poteau', beam: 'Poutre', slab: 'Dalle', stair: 'Escalier', room: 'Pièce', axis: 'Axe', furniture: 'Mobilier', symbol: 'Symbole', cable: 'Câble', dim: 'Cote', text: 'Texte', line: 'Ligne', polyline: 'Polyligne', circle: 'Cercle' };
const MINV = { t: 20, w: 50, h: 50, s: 50, r: 1, n: 1, tread: 100, bw: 50, bh: 50, size: 0.5, conductors: 1 };
const layerOptions = cur => S.P.layers.map(l => `<option value="${l.id}"${l.id === cur ? ' selected' : ''}>${esc(l.id)} — ${esc(l.name)}</option>`).join('');
const circuitOptions = cur => `<option value="">— aucun —</option>` + S.P.circuits.map(c => `<option value="${c.id}"${c.id === cur ? ' selected' : ''}>${esc(c.code)} — ${esc(c.name)}</option>`).join('');
function renderProps() {
  const box = $('#pProps'); if (!box) return;
  const sel = selEnts();
  const lock = S.readOnly ? ' <span class="muted">(lecture seule)</span>' : '';
  if (!sel.length) {
    const cnt = visibleEnts().length;
    box.innerHTML = `<div class="muted">Aucun objet sélectionné.${lock}</div><div class="h4">Niveau « ${esc(curLevel().name)} »</div><div>${cnt} objet(s) visible(s)</div>
      <div class="h4">Raccourcis utiles</div><div class="muted">Tapez une commande (ex. <kbd>MU</kbd> mur, <kbd>PORTE</kbd>, <kbd>CABLE</kbd>) puis Entrée. <kbd>F8</kbd> ortho, <kbd>F3</kbd> accrochages, <kbd>Tab</kbd> pivote/inverse. Tapez <kbd>AIDE</kbd> pour la liste complète.</div>`;
    return;
  }
  if (sel.length > 1) {
    box.innerHTML = `<b>${sel.length} objets sélectionnés</b>${lock}<div class="frm"><label>Calque</label><select id="mLayer" ${S.readOnly ? 'disabled' : ''}>${layerOptions('')}</select></div>
      <div class="row"><button class="btn bad" id="pDel" ${S.readOnly ? 'disabled' : ''}>Effacer</button></div>`;
    const ml = $('#mLayer', box); if (ml) { ml.value = ''; ml.onchange = ev => { if (S.readOnly) return; pushUndo(); sel.forEach(e => { if (e.type !== 'opening') e.layer = ev.target.value; }); changed(); }; }
    const pd = $('#pDel', box); if (pd) pd.onclick = deleteSelection;
    return;
  }
  const e = sel[0], fields = FIELDS[e.type] || [];
  const dis = S.readOnly ? ' disabled' : '';
  let html = `<b>${TYPE_LABEL[e.type] || e.type}${e.type === 'symbol' ? ' — ' + esc(SYMBOLS[e.sym].label) : ''}</b>${lock}<div class="frm">`;
  for (const [k, label, type, opts] of fields) {
    const v = e[k]; let inp;
    if (type === 'sel' || type === 'numsel') inp = `<select data-k="${k}" data-t="${type}"${dis}>${opts.map(([ov, ol]) => `<option value="${esc(ov)}"${String(ov) === String(v) ? ' selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
    else if (type === 'circuit') inp = `<select data-k="${k}" data-t="circuit"${dis}>${circuitOptions(v)}</select>`;
    else if (type === 'area') inp = `<textarea data-k="${k}" data-t="txt" rows="3"${dis}>${esc(v)}</textarea>`;
    else if (type === 'num') inp = `<input data-k="${k}" data-t="num" type="number" step="any" value="${Math.round((v === undefined || v === null ? 0 : v) * 100) / 100}"${dis}>`;
    else inp = `<input data-k="${k}" data-t="txt" value="${esc(v === undefined || v === null ? '' : v)}"${dis}>`;
    html += `<label>${label}</label>${inp}`;
  }
  if (e.type !== 'opening') html += `<label>Calque</label><select data-k="layer" data-t="txt"${dis}>${layerOptions(e.layer)}</select>`;
  html += '</div>';
  if (e.type === 'room') html += `<div>Surface : <b>${fr(Math.abs(polyArea(e.pts)) / 1e6)} m²</b></div>`;
  if (e.type === 'wall') html += `<div class="muted">Longueur : ${Math.round(wallLen(e))} mm</div>`;
  if (e.type === 'dim') html += `<div class="muted">Valeur : ${fmtDim(dist(e.p1, e.p2))} ${S.P.meta.dimUnit}</div>`;
  html += `<div class="row" style="margin-top:10px"><button class="btn bad" id="pDel"${dis}>Effacer</button></div>`;
  box.innerHTML = html;
  box.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener('change', () => {
    if (S.readOnly) return;
    const ent = byId(e.id); if (!ent) return;
    const k = inp.dataset.k, ty = inp.dataset.t; let v = inp.value;
    if (ty === 'num') { v = num(v); if (MINV[k] !== undefined && !(ent.type === 'symbol' && k === 'h')) v = Math.max(MINV[k], v); if (k === 'conductors') v = Math.min(6, Math.round(v)); if (k === 'n') v = Math.round(v); }
    else if (ty === 'numsel') v = Number(v);
    else if (ty === 'circuit') v = v || null;
    pushUndo(); ent[k] = v;
    if (ent.type === 'wall' && k === 't') fixOpeningsOf(ent.id);
    if (ent.type === 'opening') fixOpening(ent);
    if (ent.type === 'symbol' && k === 'tag' && TAG_POWER[String(v).toUpperCase()] !== undefined) ent.power = TAG_POWER[String(v).toUpperCase()];
    if (ent.type === 'room' && k === 'kind') { const o = OPT.roomKind.find(x => x[0] === v); if (o && OPT.roomKind.some(x => x[1] === ent.name)) ent.name = o[1]; }
    changed();
  }));
  const pd2 = $('#pDel', box); if (pd2) pd2.onclick = deleteSelection;
}

function renderLayers() {
  const el = $('#pLayers'); if (!el) return;
  el.innerHTML = `<div class="muted" style="margin-bottom:6px">Calque courant (lignes, textes) : <b>${esc(S.layer)}</b></div>` + S.P.layers.map(l => `
    <div class="lay ${l.id === S.layer ? 'cur' : ''}" data-l="${l.id}">
      <span class="sw" style="background:${l.color}"></span>
      <span data-a="cur" style="cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(l.id)}">${esc(l.name)}</span>
      <button class="ib ${l.visible ? 'on' : ''}" data-a="vis" title="Afficher / masquer">${l.visible ? '👁' : '◌'}</button>
      <button class="ib ${l.locked ? 'on' : ''}" data-a="lock" title="Verrouiller">${l.locked ? '🔒' : '🔓'}</button>
    </div>`).join('') + `<div class="row" style="margin-top:12px"><button class="btn" id="lBW">Noir et blanc à l'impression : ${S.opts.mono ? 'oui' : 'non'}</button></div>`;
}
const layersEl = $('#pLayers');
if (layersEl) layersEl.addEventListener('click', ev => {
  const bw = ev.target.closest('#lBW'); if (bw) { S.opts.mono = !S.opts.mono; renderLayers(); return; }
  const row = ev.target.closest('[data-l]'); if (!row) return;
  const l = S.P.layers.find(x => x.id === row.dataset.l), a = ev.target.closest('[data-a]'); if (!a) return;
  if (a.dataset.a === 'cur') S.layer = l.id;
  else {
    if (S.readOnly) return;
    pushUndo(); if (a.dataset.a === 'vis') l.visible = !l.visible; else l.locked = !l.locked;
    if (!l.visible) S.sel = new Set([...S.sel].filter(id => byId(id) && layerVis(byId(id).layer)));
  }
  changed();
});

function renderLibrary() {
  const el = $('#pLib'); if (!el) return;
  el.innerHTML = `<div class="muted" style="margin-bottom:6px">Choisissez un symbole, puis cliquez sur le plan. Les symboles muraux s'orientent seuls selon le mur le plus proche.</div>` +
    SYM_CATS.map(cat => `<div class="h4">${cat}</div><div class="lib">${Object.entries(SYMBOLS).filter(([, d]) => d.cat === cat).map(([k, d]) =>
      `<button class="sym" data-s="${k}" title="${esc(d.label)}">${symIcon(k)}<span>${esc(d.label)}</span></button>`).join('')}</div>`).join('');
}
const libEl = $('#pLib');
if (libEl) libEl.addEventListener('click', ev => {
  const b = ev.target.closest('[data-s]');
  if (b) { setTool('symbol', b.dataset.s); markLibrary(); if (stage.clientWidth && stage.clientWidth <= 860) { const s = $('#side'); if (s) s.classList.remove('open'); } }
});
function markLibrary() { $$('#pLib .sym').forEach(b => b.classList.toggle('on', S.tool === 'symbol' && b.dataset.s === S.toolArg)); }

function circuitStats(c) {
  const m = S.P.entities.filter(e => e.type === 'symbol' && e.circuit === c.id);
  return { count: m.length, power: m.reduce((s, e) => s + (e.power || 0), 0) };
}
function renderCircuits() {
  const el = $('#pCirc'); if (!el) return;
  const P = S.P, dis = S.readOnly ? ' disabled' : '';
  let h = `<div class="muted" style="margin-bottom:6px">Le circuit <b>actif</b> est attribué aux nouveaux symboles et câbles.</div>`;
  h += P.circuits.map(c => {
    const st = circuitStats(c);
    return `<div class="cir ${c.id === S.activeCircuit ? 'act' : ''}" data-c="${c.id}">
      <div class="t"><input type="color" data-f="color" value="${c.color}" style="width:26px;height:22px;padding:0;border:0;background:none"${dis}><b>${esc(c.code)}</b>
        <input data-f="name" value="${esc(c.name)}" style="flex:1;min-width:0;background:var(--panel2);border:1px solid var(--line);border-radius:5px;padding:3px 6px"${dis}><button class="ib" data-a="del" title="Supprimer"${dis}>✕</button></div>
      <div class="frm" style="margin:6px 0">
        <label>Type</label><select data-f="kind"${dis}>${Object.entries(RULES.circuits).map(([k, r]) => `<option value="${k}"${k === c.kind ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}</select>
        <label>Protection (A)</label><input data-f="prot" type="number" step="any" value="${c.prot}"${dis}>
        <label>Section (mm²)</label><input data-f="section" type="number" step="0.5" value="${c.section}"${dis}>
      </div>
      <div class="row muted">${st.count} symbole(s) · ${st.power} W · ≈ ${fr(st.power / RULES.volt, 1)} A</div>
      <div class="row" style="margin-top:6px"><button class="btn ${c.id === S.activeCircuit ? 'pri' : ''}" data-a="act">${c.id === S.activeCircuit ? 'Actif ✓' : 'Activer'}</button></div>
    </div>`;
  }).join('');
  h += `<div class="h4">Nouveau circuit</div><div class="frm"><label>Nom</label><input id="ncName" placeholder="ex. Prises séjour"${dis}><label>Type</label><select id="ncKind"${dis}>${Object.entries(RULES.circuits).map(([k, r]) => `<option value="${k}">${esc(r.label)}</option>`).join('')}</select></div><button class="btn pri" id="ncAdd"${dis}>Ajouter le circuit</button>`;
  el.innerHTML = h;
}
const circEl = $('#pCirc');
if (circEl) {
  circEl.addEventListener('click', ev => {
    if (S.readOnly) return;
    if (ev.target.id === 'ncAdd') {
      const kind = $('#ncKind').value, R = RULES.circuits[kind], n = Math.max(0, ...S.P.circuits.map(c => parseInt(String(c.code).replace(/\D/g, '')) || 0)) + 1;
      pushUndo();
      const c = { id: uid('c'), code: 'C' + n, name: $('#ncName').value.trim() || R.label, kind, prot: R.prot, section: R.section, color: CIRCUIT_COLORS[(n - 1) % CIRCUIT_COLORS.length] };
      S.P.circuits.push(c); S.activeCircuit = c.id; changed(); return;
    }
    const card = ev.target.closest('[data-c]'), a = ev.target.closest('[data-a]'); if (!card || !a) return;
    const c = circuitOf(card.dataset.c);
    if (a.dataset.a === 'act') { S.activeCircuit = S.activeCircuit === c.id ? null : c.id; renderCircuits(); }
    if (a.dataset.a === 'del') {
      pushUndo(); S.P.circuits = S.P.circuits.filter(x => x.id !== c.id);
      S.P.entities.forEach(e => { if (e.circuit === c.id) e.circuit = null; });
      if (S.activeCircuit === c.id) S.activeCircuit = null; changed();
    }
  });
  circEl.addEventListener('change', ev => {
    if (S.readOnly) return;
    const card = ev.target.closest('[data-c]'), f = ev.target.dataset.f; if (!card || !f) return;
    const c = circuitOf(card.dataset.c); pushUndo();
    if (f === 'prot' || f === 'section') c[f] = Math.max(0.5, num(ev.target.value, c[f])); else c[f] = ev.target.value;
    if (f === 'kind') { c.prot = RULES.circuits[c.kind].prot; c.section = RULES.circuits[c.kind].section; }
    changed();
  });
}

function roomOfSymbol(s, rooms) {
  const d = SYMBOLS[s.sym], sc = SC();
  const t = d.attach === 'wall' ? { x: s.x + Math.cos(rad(s.rot || 0)) * 6 * sc, y: s.y + Math.sin(rad(s.rot || 0)) * 6 * sc } : { x: s.x, y: s.y };
  const inside = rooms.filter(r => r.level === s.level && pointInPoly(t, r.pts)).sort((a, b) => Math.abs(polyArea(a.pts)) - Math.abs(polyArea(b.pts)));
  if (inside.length) return inside[0];
  let best = null, bd = 350;
  for (const r of rooms) { if (r.level !== s.level) continue; const dd = distPoly(t, r.pts, true); if (dd < bd) { bd = dd; best = r; } }
  return best;
}
function checkPlan() {
  const W = [], P = S.P, syms = P.entities.filter(e => e.type === 'symbol' && SYMBOLS[e.sym]);
  for (const c of P.circuits) {
    const m = syms.filter(s => s.circuit === c.id), R = RULES.circuits[c.kind], ids = m.map(s => s.id);
    const lights = m.filter(s => LIGHT_SYMS.includes(s.sym)).length, socks = m.filter(s => SOCKET_SYMS.includes(s.sym)).length;
    if (R.maxPoints && lights > R.maxPoints) W.push({ msg: `${c.code} : ${lights} points lumineux (max. indicatif ${R.maxPoints})`, ids });
    if (R.maxSocles && socks > R.maxSocles) W.push({ msg: `${c.code} : ${socks} prises sur ${c.prot} A / ${c.section} mm² (max. indicatif ${R.maxSocles})`, ids });
    if (c.section < R.section || c.prot > R.prot) W.push({ msg: `${c.code} : ${c.prot} A / ${c.section} mm² s'écarte des valeurs indicatives (${R.prot} A / ${R.section} mm²)`, ids });
    if (c.kind === 'eclairage' && m.some(s => SYMBOLS[s.sym].cat === 'Prises')) W.push({ msg: `${c.code} (éclairage) contient des prises`, ids });
    if ((c.kind === 'prises16' || c.kind === 'prises20') && lights) W.push({ msg: `${c.code} (prises) contient des luminaires`, ids });
    const I = circuitStats(c).power / RULES.volt;
    if (I > c.prot) W.push({ msg: `${c.code} : courant estimé ${fr(I, 1)} A supérieur à la protection ${c.prot} A`, ids });
    if (!m.length) W.push({ msg: `${c.code} : circuit sans symbole`, ids: [] });
  }
  const orphan = syms.filter(s => !s.circuit && !SYMBOLS[s.sym].nocirc);
  if (orphan.length) W.push({ msg: `${orphan.length} symbole(s) sans circuit`, ids: orphan.map(s => s.id) });
  const rooms = P.entities.filter(e => e.type === 'room');
  for (const r of rooms) {
    const min = RULES.prisesMin[r.kind]; if (!min) continue;
    const inR = syms.filter(s => PRISE_COUNT_SYMS.includes(s.sym) && roomOfSymbol(s, rooms) === r);
    if (inR.length < min) W.push({ msg: `${r.name} : ${inR.length} prise(s), minimum indicatif ${min}`, ids: [r.id] });
    if (r.kind === 'cuisine') { const pt = inR.filter(s => s.sym === 'prise_plan_travail').length; if (pt < RULES.cuisinePlanTravailMin) W.push({ msg: `${r.name} : ${pt} prise(s) au plan de travail, minimum indicatif ${RULES.cuisinePlanTravailMin}`, ids: [r.id] }); }
  }
  return W;
}
function bomRows() {
  const map = new Map();
  for (const e of S.P.entities) if (e.type === 'symbol' && SYMBOLS[e.sym]) {
    const k = e.sym + '|' + (e.tag || ''), r = map.get(k) || { sym: e.sym, tag: e.tag || '', qty: 0, circuits: new Set() };
    r.qty++; const c = circuitOf(e.circuit); if (c) r.circuits.add(c.code); map.set(k, r);
  }
  return [...map.values()].sort((a, b) => SYM_CATS.indexOf(SYMBOLS[a.sym].cat) - SYM_CATS.indexOf(SYMBOLS[b.sym].cat));
}
function renderReport() {
  const box = $('#pRep'); if (!box) return;
  const W = checkPlan(), rows = bomRows();
  let h = `<div class="row" style="margin-bottom:8px"><button class="btn" id="rRef">Actualiser</button><button class="btn" id="rBom">CSV nomenclature</button><button class="btn" id="rCir">CSV circuits</button></div>`;
  h += `<div class="h4">Vérifications (indicatives)</div>`;
  h += W.length ? W.map((w, i) => `<div class="warn" data-w="${i}">${esc(w.msg)}</div>`).join('') : `<div class="ok">Aucun écart détecté avec les règles indicatives.</div>`;
  h += `<div class="h4">Circuits</div>`;
  h += S.P.circuits.length ? `<table class="rep"><tr><th>Circuit</th><th class="n">Prot.</th><th class="n">mm²</th><th class="n">P (W)</th><th class="n">I (A)</th></tr>${S.P.circuits.map(c => { const st = circuitStats(c); return `<tr><td><span class="dot" style="background:${c.color};display:inline-block;margin-right:4px"></span>${esc(c.code)}</td><td class="n">${c.prot}</td><td class="n">${c.section}</td><td class="n">${st.power}</td><td class="n">${fr(st.power / RULES.volt, 1)}</td></tr>`; }).join('')}</table><div class="muted">I = P / ${RULES.volt} V (monophasé, cos φ = 1, valeurs indicatives)</div>` : '<div class="muted">Aucun circuit.</div>';
  h += `<div class="h4">Nomenclature</div>`;
  h += rows.length ? `<table class="rep"><tr><th>Symbole</th><th>Circ.</th><th class="n">Qté</th></tr>${rows.map(r => `<tr><td>${esc(SYMBOLS[r.sym].label)}${r.tag ? ' (' + esc(r.tag) + ')' : ''}</td><td>${[...r.circuits].join(', ')}</td><td class="n">${r.qty}</td></tr>`).join('')}</table>` : '<div class="muted">Aucun symbole.</div>';
  box.innerHTML = h;
  const rRef = $('#rRef', box); if (rRef) rRef.onclick = renderReport;
  const rBom = $('#rBom', box); if (rBom) rBom.onclick = exportBOM;
  const rCir = $('#rCir', box); if (rCir) rCir.onclick = exportCircuits;
  box.querySelectorAll('[data-w]').forEach(d => d.onclick = () => {
    const ids = (W[+d.dataset.w].ids || []).filter(id => byId(id)); if (!ids.length) return;
    const first = byId(ids[0]); if (first.level !== S.level) { S.level = first.level; renderLevelSelect(); }
    S.sel = new Set(ids); render(); selectionChanged();
    const bb = ids.map(id => bboxOf(byId(id))); fitView({ x0: Math.min(...bb.map(b => b.x0)), y0: Math.min(...bb.map(b => b.y0)), x1: Math.max(...bb.map(b => b.x1)), y1: Math.max(...bb.map(b => b.y1)) });
  });
}

function renderLevelSelect() {
  const lv = $('#selLevel'), sc2 = $('#selScale'), pn = $('#projName');
  if (lv) lv.innerHTML = S.P.levels.map(l => `<option value="${l.id}"${l.id === S.level ? ' selected' : ''}>${esc(l.name)}</option>`).join('');
  if (sc2) sc2.innerHTML = CONFIG.paperScales.map(s => `<option value="${s}"${s === SC() ? ' selected' : ''}>1:${s}</option>`).join('');
  if (pn) pn.value = S.P.meta.name;
}
const selLevelEl = $('#selLevel');
if (selLevelEl) selLevelEl.addEventListener('change', ev => { S.level = ev.target.value; S.sel.clear(); cancelDraft(); touch(); render(); refreshPanels(); zoomExtents(); });
const selScaleEl = $('#selScale');
if (selScaleEl) selScaleEl.addEventListener('change', ev => {
  if (S.readOnly) return;
  const old = SC(), nw = Number(ev.target.value), m = S.P.meta;
  if (m.sheetOrigin) { const f = frameRect(sheetDims()); const c = { x: m.sheetOrigin.x + f.w * old / 2, y: m.sheetOrigin.y + f.h * old / 2 }; m.sheetOrigin = { x: c.x - f.w * nw / 2, y: c.y - f.h * nw / 2 }; }
  pushUndo(); m.scale = nw; changed();
});
const projNameEl = $('#projName');
if (projNameEl) projNameEl.addEventListener('change', ev => { if (S.readOnly) return; pushUndo(); S.P.meta.name = ev.target.value.slice(0, 80); changed(true); });
function addLevel() {
  if (S.readOnly) return;
  askText('Nom du nouveau niveau', 'Étage ' + S.P.levels.length, v => {
    const last = S.P.levels[S.P.levels.length - 1];
    pushUndo(); const l = { id: uid('L'), name: v.trim() || 'Niveau', elevation: last.elevation + last.height, height: CONFIG.wall.height };
    S.P.levels.push(l); S.level = l.id; S.sel.clear(); changed(); zoomExtents();
  });
}
function zoomExtents() { fitView(extents()); }
function zoomCenter(f) { zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, f); }
function toggleSheet() { S.showSheet = !S.showSheet; render(); toastMsg(S.showSheet ? 'Aperçu de la planche activé' : 'Aperçu de la planche désactivé'); }
function newDrawing() {
  if (S.readOnly) return;
  openModal('Nouveau plan', '<p>Le plan actuel sera remplacé (vous pourrez annuler avec Ctrl+Z).</p>', [{ label: 'Annuler' }, { label: 'Nouveau plan', cls: 'pri', fn: () => { pushUndo(); S.P = newProject(); S.level = 'L0'; S.sel.clear(); S.activeCircuit = null; changed(); renderLevelSelect(); zoomExtents(); } }]);
}
const btnEnterEl = $('#btnEnter'); if (btnEnterEl) btnEnterEl.onclick = () => enterKey();
const btnEscEl = $('#btnEsc'); if (btnEscEl) btnEscEl.onclick = () => escKey();
const btnPanEl = $('#btnPan');
if (btnPanEl) btnPanEl.onclick = ev => { S.panMode = !S.panMode; ev.target.classList.toggle('on', S.panMode); toastMsg(S.panMode ? 'Mode main : glissez pour déplacer la vue' : 'Mode main désactivé'); };
$$('[data-tg]').forEach(b => b.onclick = () => toggleSnap(b.dataset.tg));

function openModal(title, body, buttons) {
  const m = $('#modal'); if (!m) return;
  m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><div class="mbody">${body}</div><div class="mbtns"></div></div>`;
  m.classList.add('on');
  const bt = $('.mbtns', m);
  (buttons || [{ label: 'Fermer', cls: 'pri' }]).forEach(b => {
    const x = document.createElement('button'); x.textContent = b.label; x.className = b.cls || '';
    x.onclick = () => { if (b.fn && b.fn(m) === false) return; closeModal(); };
    bt.appendChild(x);
  });
  m.onkeydown = ev => { if (ev.key === 'Enter' && ev.target.tagName !== 'TEXTAREA') { const p = $('.mbtns .pri', m); if (p) { ev.preventDefault(); p.click(); } } };
  const f = $('input,textarea,select', m); if (f) setTimeout(() => f.focus(), 30);
}
function closeModal() { const m = $('#modal'); if (!m) return; m.classList.remove('on'); m.innerHTML = ''; }
function askText(title, def, cb) {
  openModal(title, `<textarea id="mText" rows="3">${esc(def)}</textarea>`, [{ label: 'Annuler' }, { label: 'OK', cls: 'pri', fn: m => { cb($('#mText', m).value); } }]);
}
function askNumber(title, def, cb) {
  openModal(title, `<input id="mNum" type="number" step="any" value="${def}">`, [{ label: 'Annuler' }, { label: 'OK', cls: 'pri', fn: m => { cb(num($('#mNum', m).value, NaN)); } }]);
}
function openTitleBlock() {
  if (S.readOnly) return;
  const m = S.P.meta, fld = (k, l) => `<label>${l}</label><input data-m="${k}" value="${esc(m[k])}" maxlength="80">`;
  openModal('Cartouche et planche', `<div class="frm">${fld('projet', 'Projet')}${fld('titre', 'Titre du plan')}${fld('auteur', 'Dessiné par')}${fld('date', 'Date')}${fld('indice', 'Indice de révision')}${fld('planche', 'N° de planche')}
    <label>Format</label><select data-m="sheet">${Object.keys(CONFIG.sheets).map(k => `<option${k === m.sheet ? ' selected' : ''}>${k}</option>`).join('')}</select></div>`,
    [{ label: 'Annuler' }, { label: 'Enregistrer', cls: 'pri', fn: box => { pushUndo(); [...box.querySelectorAll('[data-m]')].forEach(i => { S.P.meta[i.dataset.m] = i.value; }); changed(); } }]);
}
function showHelp() {
  openModal('Aide — commandes et raccourcis', `
    <p><b>Commandes</b> (tapez puis Entrée) : <kbd>L</kbd> ligne · <kbd>PL</kbd> polyligne · <kbd>REC</kbd> rectangle · <kbd>C</kbd> cercle · <kbd>MU</kbd> mur · <kbd>PORTE</kbd> · <kbd>FEN</kbd> · <kbd>BAIE</kbd> · <kbd>PO</kbd> poteau · <kbd>PT</kbd> poutre · <kbd>DALLE</kbd> · <kbd>ESC</kbd> escalier · <kbd>PI</kbd> pièce · <kbd>AXE</kbd> · <kbd>T</kbd> texte · <kbd>DIM</kbd> cote · <kbd>CH</kbd> cotes en chaîne · <kbd>CABLE</kbd></p>
    <p><b>Modifier</b> : <kbd>M</kbd> déplacer · <kbd>CO</kbd> copier · <kbd>RO</kbd> pivoter · <kbd>MI</kbd> miroir · <kbd>SC</kbd> échelle · <kbd>O</kbd> décaler · <kbd>TR</kbd> ajuster · <kbd>EX</kbd> prolonger · <kbd>E</kbd> effacer · <kbd>U</kbd> annuler · <kbd>ZE</kbd> zoom étendu</p>
    <p><b>Saisie directe</b> : pendant un tracé, tapez une distance (ex. <kbd>3500</kbd>) puis Entrée pour aller dans la direction du curseur ; <kbd>@dx,dy</kbd> coordonnées relatives ; <kbd>@dist&lt;angle</kbd> polaires ; <kbd>x,y</kbd> absolues.</p>
    <p><b>Touches</b> : <kbd>F3</kbd> accrochages · <kbd>F7</kbd> grille · <kbd>F8</kbd> ortho (ou maintenir <kbd>Maj</kbd>) · <kbd>F10</kbd> polaire · <kbd>Échap</kbd> annule · <kbd>Entrée</kbd> ou clic droit valide · <kbd>Tab</kbd> inverse le gond / pivote de 90° · <kbd>Suppr</kbd> efface · <kbd>Ctrl+Z / Y</kbd> · <kbd>Ctrl+C / V</kbd> · <kbd>Ctrl+A</kbd> · <kbd>Ctrl+S</kbd> enregistre en JSON.</p>
    <p><b>Sélection</b> : clic ; fenêtre de gauche à droite (objets entièrement inclus) ; de droite à gauche (objets touchés) ; <kbd>Maj</kbd> ajoute ; poignées pour étirer ; glisser pour déplacer.</p>
    <p><b>Tactile</b> : pincement = zoom, deux doigts = déplacement, bouton MAIN = déplacer la vue avec un doigt, boutons Entrée / Échap en bas.</p>
    <p class="muted">Les règles électriques (nombre de prises, sections, protections) sont indicatives (NF C 15-100) : à valider avec la réglementation locale.</p>`);
}

/* =====================================================================
   PLANCHE, EXPORTS, IMPORT
   ===================================================================== */
function sheetDims() { return CONFIG.sheets[S.P.meta.sheet] || CONFIG.sheets.A3; }
function frameRect(d) { return { x: 20, y: 10, w: d.w - 30, h: d.h - 20 }; }
function ensureSheetOrigin() {
  const m = S.P.meta, f = frameRect(sheetDims()), sc = SC();
  if (!m.sheetOrigin) {
    const b = extents() || { x0: 0, y0: 0, x1: 10000, y1: 8000 };
    m.sheetOrigin = { x: (b.x0 + b.x1) / 2 - f.w * sc / 2, y: (b.y0 + b.y1) / 2 - f.h * sc / 2 };
  }
  return m.sheetOrigin;
}
function renderSheetOverlay() {
  if (!S.showSheet) { sheetG.innerHTML = ''; return; }
  const f = frameRect(sheetDims()), sc = SC(), o = ensureSheetOrigin(), px = 1 / S.view.z;
  const W = f.w * sc, H = f.h * sc, cw = 180 * sc, ch = 40 * sc;
  sheetG.innerHTML =
    `<rect x="${o.x}" y="${o.y}" width="${W}" height="${H}" fill="#ffffff" fill-opacity="0.025" stroke="#ffb74d" stroke-width="${1.5 * px}" stroke-dasharray="${8 * px} ${5 * px}"/>` +
    `<rect x="${o.x + W - cw}" y="${o.y + H - ch}" width="${cw}" height="${ch}" fill="#ffb74d" fill-opacity="0.08" stroke="#ffb74d" stroke-width="${px}"/>` +
    `<text x="${o.x}" y="${o.y - 6 * px}" font-size="${12 * px}" fill="#ffb74d" font-family="Arial,sans-serif">Planche ${esc(S.P.meta.sheet)} — 1:${sc}</text>`;
}

function buildSheetSVG(opt) {
  const m = S.P.meta, d = sheetDims(), f = frameRect(d), sc = SC(), o = ensureSheetOrigin(), ctx = ctxPrint(opt && opt.mono);
  const cw = 180, ch = 40, cx = f.x + f.w - cw, cy = f.y + f.h - ch;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.w} ${d.h}" width="${d.w}mm" height="${d.h}mm" font-family="Arial,Helvetica,sans-serif">`;
  s += `<rect width="${d.w}" height="${d.h}" fill="#fff"/>`;
  s += `<defs><clipPath id="clipF"><rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}"/></clipPath></defs>`;
  s += `<g clip-path="url(#clipF)"><g transform="translate(${f.x} ${f.y}) scale(${1 / sc}) translate(${-o.x} ${-o.y})">${sceneSVG(ctx)}</g></g>`;
  s += `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="none" stroke="#000" stroke-width="0.7"/>`;

  const use = new Map();
  S.P.entities.forEach(e => { if (e.type === 'symbol' && e.level === S.level && SYMBOLS[e.sym]) use.set(e.sym, (use.get(e.sym) || 0) + 1); });
  if (use.size) {
    const rows = [...use.entries()], rh = 6.5, lw = 74, lx = f.x + f.w - lw, ly = cy - 4 - (rows.length + 1) * rh;
    s += `<rect x="${lx}" y="${ly}" width="${lw}" height="${(rows.length + 1) * rh}" fill="#fff" stroke="#000" stroke-width="0.4"/>`;
    s += `<text x="${lx + 2}" y="${ly + 4.4}" font-size="3" font-weight="700">Légende</text>`;
    rows.forEach(([k, n], i) => {
      const y = ly + (i + 1) * rh + rh / 2;
      s += `<g transform="translate(${lx + 7} ${y}) scale(0.85)" color="#000" fill="none" stroke="currentColor" stroke-width="0.25" stroke-linecap="round">${SYMBOLS[k].svg}</g>`;
      s += `<text x="${lx + 14}" y="${y + 0.9}" font-size="2.4">${esc(SYMBOLS[k].label.slice(0, 32))}</text><text x="${lx + lw - 2}" y="${y + 0.9}" font-size="2.4" text-anchor="end">${n}</text>`;
    });
  }
  s += `<g transform="translate(${f.x + 14} ${f.y + 20})"><circle r="6" fill="none" stroke="#000" stroke-width="0.3"/><path d="M0-6L2.2 3L0 1.5L-2.2 3Z" fill="#000"/><text y="-8" font-size="3.5" text-anchor="middle" font-weight="700">N</text></g>`;
  const barM = sc <= 50 ? 5 : 10, barL = barM * 1000 / sc, bx = f.x + 8, by = f.y + f.h - 10, seg = barL / 5;
  for (let i = 0; i < 5; i++) s += `<rect x="${bx + i * seg}" y="${by}" width="${seg}" height="1.5" fill="${i % 2 ? '#fff' : '#000'}" stroke="#000" stroke-width="0.25"/>`;
  s += `<text x="${bx}" y="${by - 1.2}" font-size="2.4" text-anchor="middle">0</text><text x="${bx + barL}" y="${by - 1.2}" font-size="2.4" text-anchor="middle">${barM} m</text>`;

  const cell = (x, y, w, h, label, val, big) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#000" stroke-width="0.3"/><text x="${x + 1.5}" y="${y + 3.1}" font-size="1.9" fill="#555">${esc(label)}</text><text x="${x + 1.5}" y="${y + h - 2.3}" font-size="${big ? 4.2 : 3.4}" font-weight="${big ? 700 : 400}">${esc(String(val || '').slice(0, 44))}</text>`;
  s += `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" fill="#fff" stroke="#000" stroke-width="0.6"/>`;
  s += cell(cx, cy, 120, 14, 'Projet', m.projet || m.name, true) + cell(cx + 120, cy, 60, 14, 'N° de planche', m.planche);
  s += cell(cx, cy + 14, 120, 14, 'Titre du plan', m.titre) + cell(cx + 120, cy + 14, 60, 14, 'Niveau', curLevel().name);
  s += cell(cx, cy + 28, 40, 12, 'Échelle', '1:' + sc) + cell(cx + 40, cy + 28, 40, 12, 'Date', m.date) + cell(cx + 80, cy + 28, 60, 12, 'Dessiné par', m.auteur) + cell(cx + 140, cy + 28, 40, 12, 'Indice', m.indice);
  return s + '</svg>';
}

const fileName = ext => (S.P.meta.name || 'plan').replace(/[^\w-]+/g, '_').slice(0, 40) + '_' + S.P.meta.date + '.' + ext;
function exportSVG() { download(fileName('svg'), buildSheetSVG({ mono: S.opts.mono }), 'image/svg+xml'); }
function exportPNG() {
  const d = sheetDims(), k = 8, url = URL.createObjectURL(new Blob([buildSheetSVG({ mono: S.opts.mono })], { type: 'image/svg+xml;charset=utf-8' })), img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = d.w * k; c.height = d.h * k;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url); c.toBlob(b => b ? download(fileName('png'), b) : toastMsg('Export PNG impossible'), 'image/png');
  };
  img.onerror = () => { URL.revokeObjectURL(url); toastMsg('Export PNG impossible'); };
  img.src = url;
}
function exportPDF() {
  const d = sheetDims();
  const pa = $('#printArea'); if (pa) pa.innerHTML = buildSheetSVG({ mono: S.opts.mono });
  let st = document.getElementById('planPrintStyle'); if (!st) { st = document.createElement('style'); st.id = 'planPrintStyle'; document.head.appendChild(st); }
  st.textContent = `@page{size:${d.w}mm ${d.h}mm;margin:0}`;
  toastMsg('Dans la fenêtre d\'impression, choisissez « Enregistrer au format PDF »', 4000);
  setTimeout(() => window.print(), 250);
}
function exportJSON() { download(fileName('json'), JSON.stringify(S.P, null, 1), 'application/json'); toastMsg('Projet enregistré en JSON'); }
function importJSON() { if (S.readOnly) return; const f = $('#fileIn'); if (f) { f.value = ''; f.click(); } }
const fileInEl = $('#fileIn');
if (fileInEl) fileInEl.addEventListener('change', async ev => {
  if (S.readOnly) return;
  const f = ev.target.files[0]; if (!f) return;
  try {
    const P = validateProject(JSON.parse(await f.text())), dropped = P._dropped; delete P._dropped;
    pushUndo(); S.P = P; S.level = P.levels[0].id; S.sel.clear(); S.activeCircuit = null; changed(); renderLevelSelect(); zoomExtents();
    toastMsg(dropped ? `Projet ouvert (${dropped} objet(s) invalide(s) ignoré(s))` : 'Projet ouvert');
  } catch (e) { toastMsg('Import impossible : ' + e.message, 4500); }
});
const csvCell = v => { const s = String(v === undefined || v === null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = rows => '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n');
function exportBOM() {
  const rows = [['Catégorie', 'Symbole', 'Repère', 'Circuits', 'Quantité']].concat(bomRows().map(r => [SYMBOLS[r.sym].cat, SYMBOLS[r.sym].label, r.tag, [...r.circuits].join(' '), r.qty]));
  download(fileName('nomenclature.csv'), csv(rows), 'text/csv;charset=utf-8');
}
function exportCircuits() {
  const rows = [['Code', 'Nom', 'Type', 'Protection (A)', 'Section (mm²)', 'Symboles', 'Puissance (W)', 'Courant estimé (A)']].concat(S.P.circuits.map(c => {
    const st = circuitStats(c); return [c.code, c.name, RULES.circuits[c.kind].label, c.prot, c.section, st.count, st.power, fr(st.power / RULES.volt, 1)];
  }));
  download(fileName('circuits.csv'), csv(rows), 'text/csv;charset=utf-8');
}

/* =====================================================================
   DÉMARRAGE
   ===================================================================== */
if (typeof ResizeObserver !== 'undefined') {
  _ro = new ResizeObserver(() => { applyView(); renderSoon(); });
  _ro.observe(stage);
}
renderTabs(); renderRibbon(); setPanel('props', true);
Promise.resolve().then(() => storage.load()).then(str => {
  if (str) { try { const P = validateProject(JSON.parse(str)); delete P._dropped; S.P = P; } catch (e) { /* état stocké illisible : on repart d'un plan vide */ } }
}).catch(() => {}).then(() => {
  S.level = S.P.levels[0].id;
  renderLevelSelect(); renderLibrary(); refreshPanels();
  $$('[data-tg]').forEach(b => b.classList.toggle('on', !!S.snap[b.dataset.tg]));
  applyView(); zoomExtents(); setHint(); setSaved('ok');
});

window.AtelierPlan = {
  getProject: () => JSON.parse(JSON.stringify(S.P)),
  sheetSVG: opt => buildSheetSVG(opt || {}),
  loadProject: obj => { const P = validateProject(obj); delete P._dropped; pushUndo(); S.P = P; S.level = P.levels[0].id; S.sel.clear(); changed(); renderLevelSelect(); zoomExtents(); },
};
} // fin de mount()

window.AtelierPlanEditor = { mount, unmount };
})();

/* =====================================================================
   INTÉGRATION AU ROUTEUR SPA (hors IIFE — mêmes conventions que
   js/devis.js et js/dimensionnement.js : viewPlan() retourne le HTML,
   afterPlanView() est appelé une fois ce HTML inséré dans #app par
   js/app.js, et branche le module ci-dessus dessus via mount()).
   ===================================================================== */
function planShellHTML() {
  return `<div id="plan-shell">
    <header id="top">
      <div class="brand">▦ <b>Atelier</b> <span>Plan</span></div>
      <nav id="tabs"></nav>
      <div id="fileinfo">
        <input id="projName" aria-label="Nom du projet" maxlength="80">
        <span id="saveState">Enregistré</span>
        <button class="tg" id="sideToggle">Panneau</button>
      </div>
    </header>
    <div id="ribbon"></div>
    <main id="work">
      <div id="stage">
        <svg id="cv" xmlns="http://www.w3.org/2000/svg"></svg>
        <div id="hint"></div>
        <div id="hud"></div>
        <div id="plan-toast"></div>
      </div>
      <aside id="side">
        <div id="stabs">
          <button data-p="props" class="on">Propriétés</button>
          <button data-p="layers">Calques</button>
          <button data-p="lib">Symboles</button>
          <button data-p="circ">Circuits</button>
          <button data-p="rep">Rapport</button>
        </div>
        <div id="spanels">
          <div class="pn on" id="pProps"></div>
          <div class="pn" id="pLayers"></div>
          <div class="pn" id="pLib"></div>
          <div class="pn" id="pCirc"></div>
          <div class="pn" id="pRep"></div>
        </div>
      </aside>
    </main>
    <footer id="bottom">
      <div id="cmdbar">
        <span id="prompt">Commande :</span>
        <input id="cmd" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Commande, distance ou @dx,dy — Entrée pour valider">
      </div>
      <div id="statusbar">
        <span id="coords">X 0  Y 0</span>
        <button class="tg" data-tg="grid">GRILLE</button>
        <button class="tg" data-tg="ortho">ORTHO</button>
        <button class="tg" data-tg="osnap">ACCROCH.</button>
        <button class="tg" data-tg="polar">POLAIRE</button>
        <button class="tg" id="btnPan">MAIN</button>
        <span class="sp"></span>
        <select id="selLevel" title="Niveau"></select>
        <select id="selScale" title="Échelle d'impression"></select>
        <button class="tg" id="btnEnter">Entrée ↵</button>
        <button class="tg" id="btnEsc">Échap</button>
      </div>
    </footer>
    <div id="modal"></div>
    <div id="printArea"></div>
    <input type="file" id="fileIn" accept=".json,application/json" style="display:none">
  </div>`;
}

function planStorageFor(projectId) {
  return {
    async load() {
      const { data } = await db.getPlan(projectId);
      return data ? JSON.stringify(data) : null;
    },
    async save(json) {
      await db.savePlan(projectId, JSON.parse(json));
    },
  };
}

async function viewPlan(projectId) {
  const { data: project } = await db.getProject(projectId);
  if (!project) return `<div class="empty">Projet introuvable. <a href="#/dashboard">Retour</a></div>`;
  const isOwner = project.ownerId === auth.currentUser.id;
  const myCollab = (project.collaborateurs || []).find(c => c.userId === auth.currentUser.id);
  const readOnly = !isOwner && (!myCollab || myCollab.permission !== 'edition');
  window.__planCtx = { projectId, readOnly, title: project.titre };
  return `<div class="workspace" style="flex-direction:column">
    <div class="ws-topbar">
      <div><strong>${esc(project.titre)}</strong><span class="pill" style="margin-left:8px">Plan bâtiment</span>
        ${readOnly ? `<span class="pill" style="margin-left:6px;color:var(--amber);border-color:var(--amber-dim)">🔒 Lecture seule</span>` : ''}</div>
      <div class="ws-tabs-top">
        <a href="#/project/${projectId}">Schéma</a>
        <a href="#/devis/${projectId}">Devis</a>
        <a href="#/dimensionnement/${projectId}">Dimensionnement</a>
        <a href="#/plan/${projectId}" class="active">Plan</a>
        <a href="#/plan3d/${projectId}">3D</a>
      </div>
    </div>
    <div style="flex:1;min-height:0;position:relative">${planShellHTML()}</div>
  </div>`;
}

function afterPlanView() {
  const ctx = window.__planCtx;
  const root = document.getElementById('plan-shell');
  if (!ctx || !root) return;
  window.AtelierPlanEditor.mount(root, planStorageFor(ctx.projectId), { readOnly: ctx.readOnly, title: ctx.title });
}
