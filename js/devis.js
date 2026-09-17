/* ==========================================================================
   DEVIS — espace indépendant et universel (§22/§23)
   --------------------------------------------------------------------------
   Le devis n'est PAS une copie du schéma : il fonctionne pour tous les
   domaines, et peut contenir des lignes qui n'existent pas dans le circuit
   simulé (PCB, soudure, boîtier, main-d'œuvre, transport...). Les lignes
   sont librement ajoutées/modifiées ; le catalogue de composants du projet
   n'est qu'une suggestion de départ pratique (bouton "Importer le schéma").
   ========================================================================== */

function emptyDevis(){ return { lignes:[], remisePct:0, tauxTaxe:20, taxeActive:false }; }

function computeDevisTotals(devis){
  const subtotal = devis.lignes.reduce((n,l)=> n + (Number(l.qte)||0) * (Number(l.prix)||0), 0);
  const remise = subtotal * (Number(devis.remisePct)||0) / 100;
  const apresRemise = subtotal - remise;
  const taxe = devis.taxeActive ? apresRemise * (Number(devis.tauxTaxe)||0) / 100 : 0;
  const total = apresRemise + taxe;
  return { subtotal, remise, apresRemise, taxe, total };
}
function fmtMoney(n){ return (Number(n)||0).toLocaleString('fr-FR',{minimumFractionDigits:2, maximumFractionDigits:2}) + ' €'; }

async function viewDevis(projectId){
  const { data: project } = await db.getProject(projectId);
  if (!project) return `<div class="empty">Projet introuvable. <a href="#/dashboard">Retour</a></div>`;
  const { data: devis } = await db.getDevis(projectId);
  window.__devisState = { projectId, devis: devis || emptyDevis() };
  return `<div class="app-shell">${renderSidebar()}
    <div class="main">
      <div class="main-header">
        <div><h2>Devis — ${esc(project.titre)}</h2><p style="margin:0;font-size:.85em">Indépendant du schéma : ajoutez ici toutes les fournitures et la main-d'œuvre nécessaires, pas seulement les composants simulés.</p></div>
        <div class="ws-tabs-top">
          <a href="#/project/${projectId}">Schéma</a>
          <a href="#/devis/${projectId}" class="active">Devis</a>
          <a href="#/dimensionnement/${projectId}">Dimensionnement</a>
        </div>
      </div>
      <div class="card">
        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
          <button class="btn btn-sm" id="btn-devis-add">+ Ajouter une ligne</button>
          <button class="btn btn-ghost btn-sm" id="btn-devis-import">Importer les composants du schéma</button>
          <button class="btn btn-ghost btn-sm" id="btn-devis-export-pdf">Exporter le devis (PDF)</button>
        </div>
        <div style="overflow-x:auto">
        <table class="data-table devis-table" id="devis-table">
          <tr><th>Désignation</th><th>Référence</th><th style="width:70px">Qté</th><th style="width:90px">Unité</th><th style="width:110px">Prix unit.</th><th style="width:110px">Total</th><th></th></tr>
          ${renderDevisRows(window.__devisState.devis)}
        </table>
        </div>
        <div class="devis-totals" style="margin-top:16px">
          <div class="row"><span>Sous-total</span><span id="devis-subtotal"></span></div>
          <div class="row"><span>Remise (<input type="number" id="devis-remise" value="${window.__devisState.devis.remisePct}" style="width:50px;background:var(--bg);border:1px solid var(--panel-border);color:var(--text);border-radius:3px">%)</span><span id="devis-remise-val"></span></div>
          <div class="row"><span><label><input type="checkbox" id="devis-taxe-active" ${window.__devisState.devis.taxeActive?'checked':''}> Taxe (<input type="number" id="devis-taux-taxe" value="${window.__devisState.devis.tauxTaxe}" style="width:44px;background:var(--bg);border:1px solid var(--panel-border);color:var(--text);border-radius:3px">%)</label></span><span id="devis-taxe-val"></span></div>
          <div class="row total"><span>Total général</span><span id="devis-total"></span></div>
        </div>
      </div>
    </div></div>`;
}

function renderDevisRows(devis){
  return devis.lignes.map((l,idx) => `<tr data-idx="${idx}">
    <td><input data-f="nom" value="${esc(l.nom)}" placeholder="Désignation"></td>
    <td><input data-f="ref" value="${esc(l.ref||'')}" placeholder="Réf."></td>
    <td><input data-f="qte" type="number" min="0" step="1" value="${l.qte}"></td>
    <td><input data-f="unite" value="${esc(l.unite||'pièce')}"></td>
    <td><input data-f="prix" type="number" min="0" step="0.01" value="${l.prix}"></td>
    <td class="ligne-total mono">${fmtMoney((Number(l.qte)||0)*(Number(l.prix)||0))}</td>
    <td><button class="btn btn-ghost btn-sm" data-del="${idx}" title="Supprimer">✕</button></td>
  </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-faint)">Aucune ligne — ajoutez-en une, ou importez les composants du schéma.</td></tr>';
}

// Une ligne totalement vide (aucune désignation/référence/quantité/prix) est exclue du PDF ;
// une ligne partiellement remplie est conservée telle quelle (§5 des notes en cours).
function isDevisLigneVide(l){
  return !(l.nom||'').trim() && !(l.ref||'').trim() && !(Number(l.qte)||0) && !(Number(l.prix)||0);
}
function renderDevisTableHTML(devis){
  const t = computeDevisTotals(devis);
  const lignes = devis.lignes.filter(l => !isDevisLigneVide(l));
  return `<table><tr><th>Désignation</th><th>Réf.</th><th>Qté</th><th>Unité</th><th>Prix unit.</th><th>Total</th></tr>
    ${lignes.map(l=>`<tr><td>${esc(l.nom)}</td><td>${esc(l.ref||'')}</td><td>${l.qte}</td><td>${esc(l.unite||'')}</td><td>${fmtMoney(l.prix)}</td><td>${fmtMoney((Number(l.qte)||0)*(Number(l.prix)||0))}</td></tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:#888">Aucune ligne renseignée.</td></tr>'}
  </table>
  <p style="margin-top:8px">Sous-total : ${fmtMoney(t.subtotal)} · Remise : ${fmtMoney(t.remise)} · ${devis.taxeActive?`Taxe (${devis.tauxTaxe}%) : ${fmtMoney(t.taxe)} · `:''}<strong>Total général : ${fmtMoney(t.total)}</strong></p>`;
}

function refreshDevisTotals(){
  const devis = window.__devisState.devis;
  const t = computeDevisTotals(devis);
  const $ = (id) => document.getElementById(id);
  if ($('devis-subtotal')) $('devis-subtotal').textContent = fmtMoney(t.subtotal);
  if ($('devis-remise-val')) $('devis-remise-val').textContent = '− ' + fmtMoney(t.remise);
  if ($('devis-taxe-val')) $('devis-taxe-val').textContent = devis.taxeActive ? fmtMoney(t.taxe) : '—';
  if ($('devis-total')) $('devis-total').textContent = fmtMoney(t.total);
}

async function saveDevisDebounced(){ await db.saveDevis(window.__devisState.projectId, window.__devisState.devis); }

function afterDevisView(){
  if (!window.__devisState) return;
  refreshDevisTotals();

  const table = document.getElementById('devis-table');
  table?.addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-idx]');
    if (!tr) return;
    const idx = Number(tr.dataset.idx);
    const field = e.target.dataset.f;
    const l = window.__devisState.devis.lignes[idx];
    l[field] = (field==='qte'||field==='prix') ? Number(e.target.value) : e.target.value;
    tr.querySelector('.ligne-total').textContent = fmtMoney((Number(l.qte)||0)*(Number(l.prix)||0));
    refreshDevisTotals();
    saveDevisDebounced();
  });
  table?.addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-del]');
    if (!delBtn) return;
    window.__devisState.devis.lignes.splice(Number(delBtn.dataset.del),1);
    table.innerHTML = table.rows[0].outerHTML + renderDevisRows(window.__devisState.devis);
    refreshDevisTotals();
    saveDevisDebounced();
  });

  document.getElementById('btn-devis-add')?.addEventListener('click', () => {
    window.__devisState.devis.lignes.push({ nom:'Nouvelle ligne', ref:'', qte:1, unite:'pièce', prix:0 });
    table.innerHTML = table.rows[0].outerHTML + renderDevisRows(window.__devisState.devis);
    refreshDevisTotals();
    saveDevisDebounced();
  });

  document.getElementById('btn-devis-import')?.addEventListener('click', async () => {
    const { data: project } = await db.getProject(window.__devisState.projectId);
    const items = (project?.schema?.items) || [];
    if (!items.length){ toast('Le schéma ne contient aucun composant à importer.'); return; }
    const counts = new Map();
    items.forEach(it => { const key = it.typeId+'|'+it.value; counts.set(key, (counts.get(key)||0)+1); });
    counts.forEach((qte, key) => {
      const [typeId, value] = key.split('|');
      const def = findDef(typeId);
      window.__devisState.devis.lignes.push({ nom: def.nom, ref: value && value!=='undefined' ? String(value) : '', qte, unite:'pièce', prix: estimatePrice(def) });
    });
    table.innerHTML = table.rows[0].outerHTML + renderDevisRows(window.__devisState.devis);
    refreshDevisTotals();
    saveDevisDebounced();
    toast(`${counts.size} ligne(s) importée(s) depuis le schéma.`);
  });

  document.getElementById('btn-devis-export-pdf')?.addEventListener('click', async () => {
    if (!confirm('Exporter le devis en PDF maintenant ?')) return;
    await exportDevisPDF(window.__devisState.projectId);
  });

  document.getElementById('devis-remise')?.addEventListener('input', (e) => { window.__devisState.devis.remisePct = Number(e.target.value); refreshDevisTotals(); saveDevisDebounced(); });
  document.getElementById('devis-taux-taxe')?.addEventListener('input', (e) => { window.__devisState.devis.tauxTaxe = Number(e.target.value); refreshDevisTotals(); saveDevisDebounced(); });
  document.getElementById('devis-taxe-active')?.addEventListener('change', (e) => { window.__devisState.devis.taxeActive = e.target.checked; refreshDevisTotals(); saveDevisDebounced(); });
}
