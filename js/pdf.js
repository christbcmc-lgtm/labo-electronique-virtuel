/* ==========================================================================
   RAPPORT / EXPORT PDF (§7B, §25, §26 — et refonte §15 de la mise à jour :
   4 exports indépendants au lieu d'un seul rapport imposé)
   --------------------------------------------------------------------------
   Le PDF ne doit pas être une capture d'écran du canevas sombre : ce module
   redessine le schéma en version technique claire (traits noirs sur fond
   blanc, symboles + références + valeurs + connexions). Génération à la
   demande via l'impression native du navigateur (Ctrl/Cmd+P → "Enregistrer en
   PDF") : aucun fichier n'est stocké côté serveur, aucune bibliothèque PDF
   ajoutée (§26 : pas de stockage inutile).

   « Le choix du type de PDF doit appartenir à l'utilisateur » : 4 exports
   indépendants partagent la même mise en page professionnelle (logo/en-tête/
   pied de page vectoriels, voir `LAB_LOGO_SVG`/`openPdfWindow`) plutôt qu'un
   seul document imposé :
     - exportSchemaPDF          → schéma seul (Option 1)
     - exportDevisPDF           → devis seul (Option 2)
     - exportDimensionnementPDF → dimensionnement seul (Option 3)
     - exportRapportCompletPDF  → rapport complet (Option 4, comportement et
       contenu identiques à l'ancien `exportProjectPDF`)
   ========================================================================== */

const REF_PREFIX = {
  'Résistances':'R','Condensateurs':'C','Bobines':'L','Diodes':'D','Transistors':'Q',
  'Thyristors':'TH','Circuits intégrés':'U','Logique numérique':'U','Affichage':'AFF',
  'Capteurs et modules':'CAP','Communication':'COM','Machines':'M','Transformateurs':'T',
  'Protections':'F','Appareillage':'K','Charges':'CH','Mesure':'PM','Câblage':'W',
  'Sources':'G','Photovoltaïque':'PV','Stockage':'BAT','Conversion':'OND','Régulation':'REG',
  'Distribution':'TAB','Éclairage':'EL','Commande éclairage':'CDE','Bâtiment':'BT',
  'Commande':'CDE','Actionneurs':'ACT','Capteurs industriels':'CAP','Électromécanique':'K','Instruments':'PM',
};
function assignReferences(items){
  const counters = {};
  const refs = new Map();
  items.forEach(item => {
    const def = findDef(item.typeId);
    const prefix = REF_PREFIX[def.famille] || 'X';
    counters[prefix] = (counters[prefix]||0) + 1;
    refs.set(item.id, prefix + counters[prefix]);
  });
  return refs;
}

// Redessine le schéma en clair (technique/imprimable) à partir des mêmes données que l'éditeur —
// pas une capture d'écran : les symboles SVG sont réutilisés (ils utilisent currentColor).
function renderTechnicalSchema(schema, refs){
  const items = schema.items, wires = schema.wires;
  if (items.length === 0) return '<p style="color:#888">Aucun composant sur ce schéma.</p>';
  const xs = items.map(i=>i.x), ys = items.map(i=>i.y);
  const minX = Math.min(...xs)-60, minY = Math.min(...ys)-60, maxX = Math.max(...xs)+120, maxY = Math.max(...ys)+90;
  const w = Math.max(400, maxX-minX), h = Math.max(300, maxY-minY);

  const wiresSvg = wires.map(w2 => {
    const ai = items.find(i=>i.id===w2.a.itemId), bi = items.find(i=>i.id===w2.b.itemId);
    if (!ai || !bi) return '';
    const a = terminalAbsPos(ai, w2.a.term), b = terminalAbsPos(bi, w2.b.term);
    return `<polyline points="${polylinePoints(orthoPoints(a,b))}" fill="none" stroke="${esc(w2.color||'#111')}" stroke-width="1.6"/>`;
  }).join('');

  // Nœuds réels : bornes partagées par ≥3 fils, + nœuds explicitement placés à une intersection.
  const endpointCount = new Map();
  const addPt = (p) => { const k = Math.round(p.x)+','+Math.round(p.y); endpointCount.set(k, (endpointCount.get(k)||0)+1); };
  wires.forEach(w2 => {
    const ai = items.find(i=>i.id===w2.a.itemId), bi = items.find(i=>i.id===w2.b.itemId);
    if (ai) addPt(terminalAbsPos(ai, w2.a.term));
    if (bi) addPt(terminalAbsPos(bi, w2.b.term));
  });
  const autoJunctions = [...endpointCount.entries()].filter(([,n])=>n>=3).map(([k]) => { const [x,y]=k.split(',').map(Number); return {x,y}; });
  const manualJunctions = schema.junctions || [];
  const junctionsSvg = [...autoJunctions, ...manualJunctions].map(j => `<circle cx="${j.x}" cy="${j.y}" r="3" fill="#111"/>`).join('');

  const itemsSvg = items.map(item => {
    const def = findDef(item.typeId);
    const sym = SYM[item.typeId] || '';
    const ref = refs.get(item.id);
    const valueTxt = def.unit ? `${item.value}${def.unit.split(' ')[0]?(' '+def.unit.split(' ')[0]):''}` : '';
    return `<g transform="translate(${item.x},${item.y}) rotate(${item.rot||0},30,15)" color="#111" stroke="#111">
        <g>${sym}</g>
      </g>
      <text x="${item.x+6}" y="${item.y-6}" font-size="8" font-family="monospace" fill="#111">${esc(ref)}${valueTxt?(' — '+esc(valueTxt)):''}</text>`;
  }).join('');

  return `<svg viewBox="${minX} ${minY} ${w} ${h}" style="width:100%;max-height:520px;background:#fff;border:1px solid #ccc" xmlns="http://www.w3.org/2000/svg">
    ${wiresSvg}${junctionsSvg}${itemsSvg}
  </svg>`;
}

function buildBOM(items, refs){
  return items.map(item => {
    const def = findDef(item.typeId);
    const valeur = def.unit ? `${item.value} ${def.unit.split(' ')[0]}` : '—';
    const mismatch = customRefMismatch(item, def);
    const nom = item.customRef ? `${def.nom} (étiqueté « ${item.customRef} »)${mismatch ? ' ⚠' : ''}` : def.nom;
    return { ref: refs.get(item.id), nom, famille: def.famille||'', valeur, mismatch };
  });
}

function bomTableHTML(bom){
  return `<table><tr><th>Réf.</th><th>Désignation</th><th>Famille</th><th>Valeur</th></tr>
    ${bom.map(r=>`<tr><td>${esc(r.ref)}</td><td${r.mismatch?' class="warn"':''}>${esc(r.nom)}</td><td>${esc(r.famille)}</td><td>${esc(r.valeur)}</td></tr>`).join('') || '<tr><td colspan="4">Aucun composant.</td></tr>'}
  </table>`;
}

function buildDiagnosticText(schema){
  const items = schema.items, wires = schema.wires;
  if (items.length === 0) return '<p>Aucun composant posé.</p>';
  const connected = new Set();
  wires.forEach(w => { connected.add(w.a.itemId+'#'+w.a.term); connected.add(w.b.itemId+'#'+w.b.term); });
  const warnings = [];
  items.forEach(item => {
    const def = findDef(item.typeId);
    def.terminals.forEach((t,idx) => { if (!connected.has(item.id+'#'+idx)) warnings.push(`${def.nom} — borne ${idx+1} non connectée.`); });
  });
  const shorts = wires.filter(w=>w.a.itemId===w.b.itemId).map(w => `${findDef(findItem(schema,w.a.itemId)?.typeId)?.nom||'Composant'} : fil reliant deux de ses propres bornes (court-circuit direct).`);
  const replacementWarnings = collectReplacementWarnings(schema);
  const lines = [...shorts.map(s=>`<div class="err">⚠ ${esc(s)}</div>`), ...warnings.map(w=>`<div class="warn">• ${esc(w)}</div>`), ...replacementWarnings.map(w=>`<div class="warn">⚠ ${esc(w)}</div>`)];
  return lines.length ? lines.join('') : '<p>Toutes les bornes sont connectées, aucun court-circuit direct détecté.</p>';
}

function buildConclusionText(items, wires, connected){
  if (items.length === 0) return "Projet vide — aucun composant n'a encore été placé sur le schéma.";
  const unconnected = items.reduce((n,item)=> n + findDef(item.typeId).terminals.filter((t,idx)=>!connected.has(item.id+'#'+idx)).length, 0);
  if (unconnected === 0) return `Le schéma comporte ${items.length} composant(s) et ${wires.length} connexion(s), toutes les bornes sont reliées. Aucun calcul électrique réel n'a été effectué — ce rapport documente l'état structurel du montage, pas son comportement électrique.`;
  return `Le schéma comporte ${items.length} composant(s) et ${wires.length} connexion(s), mais ${unconnected} borne(s) restent non connectées (voir section Diagnostic). Complétez le câblage avant toute réalisation physique du montage.`;
}

/* ==========================================================================
   MISE EN PAGE PARTAGÉE — logo vectoriel, en-tête/pied de page, feuille de
   style — communs aux 4 types d'export pour qu'ils forment une même famille
   de documents "professionnels", pas seulement le rapport complet.
   ========================================================================== */

// Logo 100% vectoriel (pas d'image importée) : un boîtier à broches, dans le même style que
// les symboles de composants (leadLine/rect) déjà utilisés partout ailleurs dans l'app — pour
// rester cohérent avec le principe déjà établi "aucune bibliothèque/asset ajouté" (§26).
const LAB_LOGO_SVG = `<svg width="34" height="34" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="11" y="11" width="18" height="18" rx="2.5" fill="none" stroke="#173b5e" stroke-width="2.2"/>
  <circle cx="20" cy="20" r="3.6" fill="#173b5e"/>
  <line x1="11" y1="16" x2="4" y2="16" stroke="#173b5e" stroke-width="2.2"/>
  <line x1="11" y1="24" x2="4" y2="24" stroke="#173b5e" stroke-width="2.2"/>
  <line x1="29" y1="16" x2="36" y2="16" stroke="#173b5e" stroke-width="2.2"/>
  <line x1="29" y1="24" x2="36" y2="24" stroke="#173b5e" stroke-width="2.2"/>
  <line x1="16" y1="11" x2="16" y2="4" stroke="#173b5e" stroke-width="2.2"/>
  <line x1="24" y1="11" x2="24" y2="4" stroke="#173b5e" stroke-width="2.2"/>
</svg>`;

const PDF_STYLE = `
  body{ font-family:Arial,Helvetica,sans-serif; padding:0 32px 32px; color:#111; max-width:900px; margin:0 auto; }
  h1{ margin:0; font-size:1.5em; } h2{ margin-top:2.2em; border-bottom:2px solid #111; padding-bottom:4px; }
  .meta{ color:#555; font-size:13px; margin:2px 0 0; }
  table{ width:100%; border-collapse:collapse; margin-top:10px; font-size:13px; }
  td,th{ border:1px solid #ccc; padding:6px 10px; text-align:left; }
  .warn{ color:#a15c00; } .err{ color:#a12a1a; font-weight:bold; }
  .note{ margin-top:8px; font-size:11px; color:#777; }
  .conclusion{ background:#f4f4f4; padding:14px 16px; border-radius:6px; }
  .pdf-head{ display:flex; align-items:center; gap:14px; padding:20px 0 14px; border-bottom:3px solid #173b5e; margin-bottom:6px; }
  .pdf-brand{ font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:#173b5e; font-weight:bold; }
  .pdf-foot{ margin-top:36px; padding-top:8px; border-top:1px solid #ccc; display:flex; justify-content:space-between; font-size:10.5px; color:#888; }
  @media print{ .no-print{ display:none; } }
`;

function pdfHeaderHTML(title, subtitle){
  return `<header class="pdf-head">
    ${LAB_LOGO_SVG}
    <div>
      <div class="pdf-brand">Laboratoire Électronique Virtuel</div>
      <h1>${esc(title)}</h1>
      ${subtitle ? `<p class="meta">${subtitle}</p>` : ''}
    </div>
  </header>`;
}

function pdfFooterHTML(docLabel){
  return `<footer class="pdf-foot"><span>${esc(docLabel)}</span><span>Généré le ${new Date().toLocaleDateString('fr-FR')} — Laboratoire Électronique Virtuel</span></footer>`;
}

// Assemble et ouvre le document imprimable. Commun aux 4 exports (§15) : même feuille de
// style, même en-tête/logo, même pied de page — seul le `bodyHtml` change.
function openPdfWindow(title, subtitle, bodyHtml, docLabel){
  const win = window.open('', '_blank');
  if (!win){ toast("Le navigateur a bloqué l'ouverture de la fenêtre d'export — autorisez les pop-ups pour ce site."); return null; }
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>${PDF_STYLE}</style>
    </head><body>
    <button class="no-print" onclick="window.print()" style="float:right;margin-top:20px">Imprimer / Enregistrer en PDF</button>
    ${pdfHeaderHTML(title, subtitle)}
    ${bodyHtml}
    ${pdfFooterHTML(docLabel || title)}
    </body></html>`);
  win.document.close();
  win.focus();
  return win;
}

function projectSubtitle(project){
  return `Domaine : ${esc(ESPACES[project.espace]?.nom || project.espace)} · Auteur : ${esc(auth.currentUser.prenom)} ${esc(auth.currentUser.nom)} · Généré le ${new Date().toLocaleDateString('fr-FR')}`;
}

/* ==========================================================================
   OPTION 1 — PDF DU SCHÉMA SEUL
   ========================================================================== */
async function exportSchemaPDF(projectId, schema){
  const { data: project } = await db.getProject(projectId);
  if (!project) return;
  const items = schema.items;
  const refs = assignReferences(items);
  const bom = buildBOM(items, refs);

  const body = `
    <h2>Schéma technique</h2>
    ${renderTechnicalSchema(schema, refs)}
    <h2>Nomenclature des composants</h2>
    ${bomTableHTML(bom)}
    <p class="note">${items.length} composant(s) · ${schema.wires.length} connexion(s).</p>
    <h2>Diagnostic / analyse</h2>
    ${buildDiagnosticText(schema)}`;

  openPdfWindow(`${project.titre} — schéma`, projectSubtitle(project), body, 'Export schéma');
}

/* ==========================================================================
   OPTION 2 — PDF DU DEVIS SEUL (indépendant du schéma)
   ========================================================================== */
async function exportDevisPDF(projectId){
  const { data: project } = await db.getProject(projectId);
  if (!project) return;
  const { data: devis } = await db.getDevis(projectId).catch(() => ({ data: null }));
  if (!devis || !devis.lignes || !devis.lignes.some(l => !isDevisLigneVide(l))){
    toast('Le devis de ce projet est vide — ajoutez au moins une ligne avant de l\'exporter.');
    return;
  }
  const body = `<h2>Devis</h2>${renderDevisTableHTML(devis)}`;
  openPdfWindow(`${project.titre} — devis`, projectSubtitle(project), body, 'Export devis');
}

/* ==========================================================================
   OPTION 3 — PDF DU DIMENSIONNEMENT SEUL (indépendant du schéma)
   ========================================================================== */
function exportDimensionnementPDF(projectId){
  const dimResult = window.__lastDimResult && window.__lastDimResult.projectId === projectId ? window.__lastDimResult : null;
  if (!dimResult){
    toast('Aucun résultat de dimensionnement à exporter pour ce projet — calculez puis cliquez « Inclure ce résultat dans le rapport PDF » d\'abord.');
    return;
  }
  const body = `<h2>Dimensionnement — ${esc(dimResult.type || '')}</h2>${dimResult.html}`;
  openPdfWindow('Dimensionnement', `Généré le ${new Date().toLocaleDateString('fr-FR')}`, body, 'Export dimensionnement');
}

/* ==========================================================================
   OPTION 4 — RAPPORT TECHNIQUE COMPLET (comportement/contenu identiques à
   l'ancien exportProjectPDF : mêmes 8 sections + conclusion, dans le même
   ordre — seule la mise en page partagée ci-dessus change.)
   ========================================================================== */
async function exportRapportCompletPDF(projectId, schema){
  const { data: project } = await db.getProject(projectId);
  if (!project) return;
  const items = schema.items, wires = schema.wires;
  const refs = assignReferences(items);
  const connected = new Set();
  wires.forEach(w => { connected.add(w.a.itemId+'#'+w.a.term); connected.add(w.b.itemId+'#'+w.b.term); });

  const bom = buildBOM(items, refs);
  const diagText = buildDiagnosticText(schema);
  const { data: devis } = await db.getDevis(projectId).catch(()=>({data:null}));
  const dimResult = window.__lastDimResult && window.__lastDimResult.projectId === projectId ? window.__lastDimResult : null;
  const aiResult = window.__lastAiResult && window.__lastAiResult.projectId === projectId ? window.__lastAiResult.text : null;

  const body = `
    <h2>1. Schéma technique</h2>
    ${renderTechnicalSchema(schema, refs)}

    <h2>2. Nomenclature des composants</h2>
    ${bomTableHTML(bom)}
    <p class="note">${items.length} composant(s) · ${wires.length} connexion(s).</p>

    <h2>3. Mesures</h2>
    <p>Aucune mesure enregistrée pour ce projet (aucun instrument de mesure interactif branché en session).</p>

    <h2>4. Résultats de calcul / simulation</h2>
    <p><strong>Simulation non exécutée.</strong> Le moteur de calcul électrique réel (tensions, courants, puissances) n'est pas encore implémenté dans cette version — voir le rapport final du projet. Seule une vérification structurelle du câblage a été effectuée (section suivante).</p>

    <h2>5. Diagnostic / analyse</h2>
    ${diagText}

    <h2>6. Interprétation IA</h2>
    ${aiResult ? `<p style="white-space:pre-wrap">${esc(aiResult)}</p>` : '<p>Interprétation IA non demandée pour ce projet (bouton « Interpréter (IA) » non utilisé, ou fonction IA non configurée).</p>'}

    ${devis && devis.lignes && devis.lignes.some(l=>!isDevisLigneVide(l)) ? `<h2>7. Devis</h2>${renderDevisTableHTML(devis)}` : ''}
    ${dimResult ? `<h2>8. Dimensionnement</h2>${dimResult.html}` : ''}

    <h2>Conclusion</h2>
    <div class="conclusion">${buildConclusionText(items, wires, connected)}</div>

    <p class="note">Document généré automatiquement par le Laboratoire d'Électronique Virtuel. Le schéma ci-dessus est redessiné à partir des données du projet (symboles vectoriels), ce n'est pas une capture d'écran de l'éditeur.</p>`;

  openPdfWindow(project.titre, projectSubtitle(project), body, 'Rapport complet');
}
