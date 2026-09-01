/* ==========================================================================
   RAPPORT / EXPORT PDF (§7B, §25, §26)
   --------------------------------------------------------------------------
   Le PDF ne doit pas être une capture d'écran du canevas sombre : ce module
   redessine le schéma en version technique claire (traits noirs sur fond
   blanc, symboles + références + valeurs + connexions), puis assemble un
   rapport complet (nomenclature, diagnostic, devis, dimensionnement, IA si
   disponible). Génération à la demande via l'impression native du navigateur
   (Ctrl/Cmd+P → "Enregistrer en PDF") : aucun fichier n'est stocké côté
   serveur, aucune bibliothèque PDF ajoutée (§26 : pas de stockage inutile).
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
    ${wiresSvg}${itemsSvg}
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

async function exportProjectPDF(projectId, schema){
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

  const win = window.open('', '_blank');
  if (!win){ toast("Le navigateur a bloqué l'ouverture de la fenêtre d'export — autorisez les pop-ups pour ce site."); return; }

  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(project.titre)} — rapport</title>
    <style>
      body{ font-family:Arial,Helvetica,sans-serif; padding:32px; color:#111; max-width:900px; margin:0 auto; }
      h1{ margin-bottom:2px; } h2{ margin-top:2.2em; border-bottom:2px solid #111; padding-bottom:4px; }
      .meta{ color:#555; font-size:13px; margin-bottom:18px; }
      table{ width:100%; border-collapse:collapse; margin-top:10px; font-size:13px; }
      td,th{ border:1px solid #ccc; padding:6px 10px; text-align:left; }
      .warn{ color:#a15c00; } .err{ color:#a12a1a; font-weight:bold; }
      .note{ margin-top:8px; font-size:11px; color:#777; }
      .conclusion{ background:#f4f4f4; padding:14px 16px; border-radius:6px; }
      @media print{ .no-print{ display:none; } }
    </style>
    </head><body>
    <button class="no-print" onclick="window.print()" style="float:right">Imprimer / Enregistrer en PDF</button>
    <h1>${esc(project.titre)}</h1>
    <p class="meta">Domaine : ${esc(ESPACES[project.espace]?.nom || project.espace)} · Auteur : ${esc(auth.currentUser.prenom)} ${esc(auth.currentUser.nom)} · Généré le ${new Date().toLocaleDateString('fr-FR')}</p>

    <h2>1. Schéma technique</h2>
    ${renderTechnicalSchema(schema, refs)}

    <h2>2. Nomenclature des composants</h2>
    <table><tr><th>Réf.</th><th>Désignation</th><th>Famille</th><th>Valeur</th></tr>
      ${bom.map(r=>`<tr><td>${esc(r.ref)}</td><td${r.mismatch?' class="warn"':''}>${esc(r.nom)}</td><td>${esc(r.famille)}</td><td>${esc(r.valeur)}</td></tr>`).join('') || '<tr><td colspan="4">Aucun composant.</td></tr>'}
    </table>
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

    <p class="note">Document généré automatiquement par le Laboratoire d'Électronique Virtuel. Le schéma ci-dessus est redessiné à partir des données du projet (symboles vectoriels), ce n'est pas une capture d'écran de l'éditeur.</p>
    </body></html>`);
  win.document.close();
  win.focus();
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
