/* ==========================================================================
   CONSTRUCTEUR DE COMPOSANT PERSONNALISÉ (§23/§26)
   --------------------------------------------------------------------------
   Le symbole (boîtier + broches numérotées) est généré automatiquement à
   partir du seul nombre de bornes saisi, en réutilisant icTemplate() —
   exactement le gabarit déjà utilisé par ~150 circuits intégrés du
   catalogue (js/catalog.js), donc déjà vérifié géométriquement (bornes ↔
   tracé, tests/verify_catalog.js) : aucun nouveau moteur de dessin, aucune
   broche mal placée possible. L'utilisateur nomme chaque broche (brochage
   réel), le reste du moteur (éditeur, recherche, PDF, diagnostic) n'a besoin
   d'aucune modification pour afficher/utiliser ces composants — c'est
   l'extensibilité par gabarits déjà documentée en tête de js/catalog.js.
   Stocké par utilisateur (db.*CustomComponent), fusionné au catalogue à la
   connexion et après chaque enregistrement (setCustomComponents, voir
   js/app.js ensureCustomComponentsLoaded/refreshCustomComponents).
   ========================================================================== */

const BUILDER_FAMILLES = ['Électronique personnalisé', 'Électrotechnique personnalisé', 'Capteurs et modules', 'Circuits intégrés', 'Bâtiment', 'Autre'];

// Second gabarit de boîtier (le premier, rectangulaire, réutilise icTemplate() — voir plus bas) :
// un boîtier circulaire avec broches réparties à 360°, même principe de garantie géométrique
// (le point de fin de chaque leadLine() EST la borne, par construction, jamais désynchronisé).
// Hauteur logique fixe (radial, pas empilé sur 2 côtés comme icTemplate — n'a pas besoin de
// grandir avec le nombre de broches pour rester lisible).
function circularTemplate(n, label){
  const cx = 30, R = 14, leadLen = 10, viewH = 2 * (R + leadLen) + 8, cy = viewH / 2;
  const terms = []; let leads = '';
  for (let i = 0; i < n; i++){
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x1 = cx + R * Math.cos(a), y1 = cy + R * Math.sin(a);
    const x2 = cx + (R + leadLen) * Math.cos(a), y2 = cy + (R + leadLen) * Math.sin(a);
    leads += leadLine(x1, y1, x2, y2);
    terms.push([x2, y2]);
  }
  const sym = `${leads}<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="currentColor" stroke-width="1.6"/>${ctext(cx, cy + 2, label, 6)}`;
  return { sym, terminals: terms, viewH };
}
const BUILDER_BOITIERS = { rect: { label: 'Rectangulaire (broches sur 2 côtés)', build: icTemplate }, circle: { label: 'Circulaire (broches à 360°)', build: circularTemplate } };

// Valide un composant personnalisé importé depuis un fichier JSON (export d'un autre constructeur
// ou fiche préparée à la main). Contrairement à un composant généré par ce module (icTemplate/
// circularTemplate garantissent bornes ↔ tracé par construction), un import externe n'offre pas
// cette garantie automatique — signalé explicitement dans niveauVerification plutôt que présenté
// comme vérifié.
function validateCustomComponentImport(obj){
  if (!obj || typeof obj !== 'object') throw new Error('Fichier JSON invalide (objet attendu).');
  if (typeof obj.nom !== 'string' || !obj.nom.trim()) throw new Error('Champ "nom" manquant ou vide.');
  if (typeof obj.sym !== 'string' || !obj.sym.trim()) throw new Error('Champ "sym" (symbole SVG) manquant ou vide.');
  if (!Array.isArray(obj.terminals) || !obj.terminals.length || !obj.terminals.every(t => Array.isArray(t) && t.length === 2 && Number.isFinite(Number(t[0])) && Number.isFinite(Number(t[1]))))
    throw new Error('Champ "terminals" invalide (attendu : une liste de [x, y]).');
  return {
    nom: obj.nom.trim().slice(0, 120),
    terminals: obj.terminals.map(t => [Number(t[0]), Number(t[1])]),
    sym: obj.sym,
    famille: typeof obj.famille === 'string' && obj.famille.trim() ? obj.famille.trim() : 'Autre',
    def: typeof obj.def === 'string' ? obj.def.trim() : '',
    alias: typeof obj.alias === 'string' ? obj.alias.trim() : '',
    pinNames: Array.isArray(obj.pinNames) ? obj.pinNames.slice(0, obj.terminals.length).map(String) : undefined,
    refTechnique: typeof obj.refTechnique === 'string' && obj.refTechnique.trim() ? obj.refTechnique.trim() : obj.nom.trim(),
    boitier: typeof obj.boitier === 'string' ? obj.boitier.trim() : '',
    viewH: Number.isFinite(Number(obj.viewH)) && Number(obj.viewH) > 0 ? Number(obj.viewH) : 30,
  };
}

function slugifyComponentId(s){
  const base = String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return 'custom_' + (base || 'composant');
}
function uniqueComponentId(base, excludeId){
  if (base === excludeId) return base;
  let id = base, n = 1;
  while (findDef(id) && id !== excludeId) { id = base + '_' + (++n); }
  return id;
}

function builderPinRowsHTML(n, existingNames){
  const rows = [];
  for (let i = 1; i <= n; i++){
    const val = (existingNames && existingNames[i-1]) || ('Broche ' + i);
    rows.push(`<div class="field" style="margin-bottom:4px"><label style="font-size:.75em">Broche ${i}</label><input data-pin-idx="${i-1}" class="cb-pinname" value="${esc(val)}"></div>`);
  }
  return `<div class="grid grid-3">${rows.join('')}</div>`;
}

function viewComposantCreerHTML(){
  const mine = CUSTOM_COMPONENTS;
  return `<div class="card">
    <h3>Créer un composant</h3>
    <p style="font-size:.85em;color:var(--text-muted)">Le symbole (boîtier + broches numérotées) est généré automatiquement à partir du nombre de bornes — la même convention que les circuits intégrés déjà présents dans le catalogue. Nommez chaque broche pour un brochage exploitable dans vos schémas.</p>
    <div class="grid grid-2">
      <div class="field"><label>Nom *</label><input id="cb-nom" placeholder="ex. Module relais 4 canaux"></div>
      <div class="field"><label>Référence</label><input id="cb-ref" placeholder="ex. KY-019"></div>
      <div class="field"><label>Fabricant</label><input id="cb-fab" placeholder="ex. Keyestudio"></div>
      <div class="field"><label>Famille</label><select id="cb-famille">${BUILDER_FAMILLES.map(f=>`<option>${esc(f)}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Description / fonction</label><textarea id="cb-def" rows="2" placeholder="À quoi sert ce composant"></textarea></div>
    <div class="grid grid-2">
      <div class="field" style="max-width:220px"><label>Nombre de bornes * (1 à 40)</label><input id="cb-nbornes" type="number" min="1" max="40" value="4"></div>
      <div class="field"><label>Forme du boîtier</label><select id="cb-boitier">${Object.entries(BUILDER_BOITIERS).map(([k,v])=>`<option value="${k}">${esc(v.label)}</option>`).join('')}</select></div>
    </div>
    <div id="cb-pinnames">${builderPinRowsHTML(4)}</div>
    <div class="row" style="margin-top:8px">
      <button class="btn btn-ghost btn-sm" id="cb-preview">Générer l'aperçu</button>
      <button class="btn btn-primary btn-sm" id="cb-save" disabled>Enregistrer ce composant</button>
    </div>
    <div id="cb-preview-box" style="margin-top:12px"></div>
    <div id="cb-msg" style="margin-top:8px;font-size:.85em"></div>
  </div>
  <div class="card" style="margin-top:16px">
    <h3>Importer un composant (JSON)</h3>
    <p style="font-size:.85em;color:var(--text-muted)">Importe une fiche préparée à l'avance ou exportée depuis un autre poste (champs attendus : <code>nom</code>, <code>sym</code>, <code>terminals</code> — <code>famille</code>, <code>def</code>, <code>pinNames</code>, <code>refTechnique</code>, <code>boitier</code>, <code>viewH</code> optionnels). Contrairement aux composants générés ci-dessus, la cohérence bornes ↔ tracé d'un import n'est pas garantie automatiquement — à vérifier avant un usage critique.</p>
    <input type="file" id="cb-import-file" accept="application/json,.json" style="display:none">
    <button class="btn btn-ghost btn-sm" id="cb-import-btn">Choisir un fichier .json…</button>
    <div id="cb-import-msg" style="margin-top:8px;font-size:.85em"></div>
  </div>
  <div class="card" style="margin-top:16px">
    <h3>Mes composants (${mine.length})</h3>
    <div id="cb-mine-list">${mine.length ? mine.map(customComponentRowHTML).join('') : '<div class="empty">Aucun composant personnalisé pour l\'instant — créez-en un ci-dessus.</div>'}</div>
  </div>`;
}
function customComponentRowHTML(c){
  return `<div class="catalog-item comp-result-row" data-mine-id="${esc(c.id)}">
    <div class="comp-result-thumb"><svg viewBox="-6 -6 72 ${(c.viewH||30)+12}" class="component-symbol-preview" xmlns="http://www.w3.org/2000/svg"><g>${SYM[c.id]||''}</g></svg></div>
    <div class="comp-result-info"><strong>${esc(c.nom)}</strong> <span style="opacity:.6;font-size:.85em">— ${esc(c.famille||'')}${c.refTechnique && c.refTechnique!==c.nom ? ' · '+esc(c.refTechnique) : ''}</span>
      <p style="margin:.2em 0 0;font-size:.78em">${esc(c.def||'')} — ${c.terminals.length} borne(s)</p></div>
    <div style="display:flex;gap:10px;align-items:center;flex-shrink:0">
      <button class="btn btn-ghost btn-sm" data-del-mine="${esc(c.id)}">Supprimer</button>
    </div>
  </div>`;
}

// État transitoire du formulaire (aperçu non encore enregistré) — jamais écrit dans SYM/
// CUSTOM_COMPONENTS tant que l'utilisateur n'a pas cliqué "Enregistrer".
let __cbDraft = null;

function cbGeneratePreview(){
  const nom = document.getElementById('cb-nom').value.trim();
  const n = Math.max(1, Math.min(40, parseInt(document.getElementById('cb-nbornes').value, 10) || 0));
  const boitierKey = document.getElementById('cb-boitier').value;
  const msg = document.getElementById('cb-msg');
  if (!nom){ msg.textContent = 'Le nom est obligatoire.'; msg.style.color = 'var(--danger)'; document.getElementById('cb-save').disabled = true; return; }
  const label = nom.length > 10 ? nom.slice(0, 9) + '…' : nom;
  const t = (BUILDER_BOITIERS[boitierKey] || BUILDER_BOITIERS.rect).build(n, label);
  const pinNames = [...document.querySelectorAll('.cb-pinname')].map(i => i.value.trim() || 'Broche');
  __cbDraft = { nom, n, t, pinNames, boitierKey };
  document.getElementById('cb-preview-box').innerHTML = `
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <svg viewBox="-6 -6 72 ${t.viewH+12}" class="component-symbol-preview" xmlns="http://www.w3.org/2000/svg" style="width:140px;height:auto"><g>${t.sym}</g></svg>
      <div style="font-size:.82em"><strong>Aperçu</strong> — ${n} borne(s), boîtier ${(BUILDER_BOITIERS[boitierKey]||BUILDER_BOITIERS.rect).label.toLowerCase()}${boitierKey==='rect' && t.viewH>30 ? ' (agrandi, forte densité)' : ''}.</div>
    </div>`;
  msg.textContent = '';
  document.getElementById('cb-save').disabled = false;
}

async function cbSaveComponent(){
  if (!__cbDraft) return;
  const msg = document.getElementById('cb-msg');
  const nom = __cbDraft.nom;
  const ref = document.getElementById('cb-ref').value.trim();
  const fab = document.getElementById('cb-fab').value.trim();
  const famille = document.getElementById('cb-famille').value;
  const def = document.getElementById('cb-def').value.trim();
  const id = uniqueComponentId(slugifyComponentId(nom));
  const def_ = defRow(id, nom, __cbDraft.t.terminals, __cbDraft.t.sym, {
    famille, def: def || ('Composant personnalisé : ' + nom), alias: [ref, fab].filter(Boolean).join(' '),
    pinNames: __cbDraft.pinNames, refTechnique: ref || nom, boitier: fab || '',
    niveauVerification: `Composant personnalisé — symbole généré automatiquement (gabarit ${(BUILDER_BOITIERS[__cbDraft.boitierKey]||BUILDER_BOITIERS.rect).label}, bornes ↔ tracé garanties par construction comme le reste du catalogue), brochage saisi par son créateur, non revu par un tiers.`,
    viewH: __cbDraft.t.viewH,
  });
  const { error } = await db.saveCustomComponent(auth.currentUser.id, def_);
  if (error){ msg.textContent = 'Échec de l\'enregistrement : ' + error.message; msg.style.color = 'var(--danger)'; return; }
  await window.refreshCustomComponents();
  toast(`Composant "${nom}" enregistré — utilisable dès maintenant dans vos schémas.`);
  __cbDraft = null;
  render();
}
async function cbImportJSON(file){
  const msg = document.getElementById('cb-import-msg');
  msg.style.color = '';
  msg.textContent = 'Lecture…';
  try {
    const raw = JSON.parse(await file.text());
    const clean = validateCustomComponentImport(raw);
    const id = uniqueComponentId(slugifyComponentId(clean.nom));
    const def_ = defRow(id, clean.nom, clean.terminals, clean.sym, {
      famille: clean.famille, def: clean.def || ('Composant personnalisé importé : ' + clean.nom), alias: clean.alias,
      pinNames: clean.pinNames, refTechnique: clean.refTechnique, boitier: clean.boitier,
      niveauVerification: 'Composant personnalisé importé depuis un fichier JSON — bornes ↔ tracé NON garanties par construction (contrairement aux composants générés par le formulaire ci-dessus), à vérifier avant un usage critique.',
      viewH: clean.viewH,
    });
    const { error } = await db.saveCustomComponent(auth.currentUser.id, def_);
    if (error){ msg.textContent = 'Échec de l\'enregistrement : ' + error.message; msg.style.color = 'var(--danger)'; return; }
    await window.refreshCustomComponents();
    toast(`Composant "${clean.nom}" importé.`);
    render();
  } catch (e) {
    msg.textContent = 'Import impossible : ' + e.message;
    msg.style.color = 'var(--danger)';
  }
}
async function cbDeleteComponent(id){
  if (!confirm('Supprimer définitivement ce composant personnalisé ? Il restera visible sur les schémas qui l\'utilisent déjà, mais ne sera plus disponible à la recherche/au placement.')) return;
  await db.deleteCustomComponent(auth.currentUser.id, id);
  await window.refreshCustomComponents();
  toast('Composant supprimé.');
  render();
}

function wireComposantCreer(){
  document.getElementById('cb-nbornes')?.addEventListener('input', (e) => {
    const n = Math.max(1, Math.min(40, parseInt(e.target.value, 10) || 1));
    document.getElementById('cb-pinnames').innerHTML = builderPinRowsHTML(n);
  });
  document.getElementById('cb-preview')?.addEventListener('click', cbGeneratePreview);
  document.getElementById('cb-save')?.addEventListener('click', cbSaveComponent);
  document.getElementById('cb-mine-list')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-del-mine]');
    if (b) cbDeleteComponent(b.dataset.delMine);
  });
  document.getElementById('cb-import-btn')?.addEventListener('click', () => document.getElementById('cb-import-file').click());
  document.getElementById('cb-import-file')?.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) cbImportJSON(f);
    e.target.value = '';
  });
}
