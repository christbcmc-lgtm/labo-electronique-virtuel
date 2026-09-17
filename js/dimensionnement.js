/* ==========================================================================
   DIMENSIONNEMENT — espace universel, formules réelles affichées (§24)
   --------------------------------------------------------------------------
   Contrairement au diagnostic de l'éditeur (structurel uniquement), les
   calculs ci-dessous sont de vraies formules de dimensionnement standard,
   appliquées aux valeurs saisies par l'utilisateur. Elles ne dépendent PAS
   du schéma (le dimensionnement peut être utilisé seul, §39).
   ========================================================================== */

const CALIBRES_STANDARD = [2,4,6,10,16,20,25,32,40,50,63,80,100,125];
function calibreAuDessus(courant){ return CALIBRES_STANDARD.find(c => c >= courant) || Math.ceil(courant/10)*10; }
const SECTIONS_STANDARD = [1.5,2.5,4,6,10,16,25,35,50,70,95];
function sectionAuDessus(s){ return SECTIONS_STANDARD.find(x => x >= s) || Math.ceil(s/10)*10; }

async function viewDimensionnement(projectId){
  const { data: project } = await db.getProject(projectId);
  if (!project) return `<div class="empty">Projet introuvable. <a href="#/dashboard">Retour</a></div>`;
  window.__dimProjectId = projectId;
  const domain = project.espace;
  const defaultTab = ['energies-renouvelables'].includes(domain) ? 'pv' : (domain==='electronique' ? 'electronique' : 'electrotechnique');
  return `<div class="app-shell">${renderSidebar()}
    <div class="main">
      <div class="main-header">
        <div><h2>Dimensionnement — ${esc(project.titre)}</h2><p style="margin:0;font-size:.85em">Calculs indépendants du schéma : formules affichées, aucune valeur inventée.</p></div>
        <div class="ws-tabs-top">
          <a href="#/project/${projectId}">Schéma</a>
          <a href="#/devis/${projectId}">Devis</a>
          <a href="#/dimensionnement/${projectId}" class="active">Dimensionnement</a>
        </div>
      </div>
      <div class="ws-tabs-top" style="margin-bottom:14px">
        <a href="#" data-dim-tab="pv" class="${defaultTab==='pv'?'active':''}">Photovoltaïque</a>
        <a href="#" data-dim-tab="electrotechnique" class="${defaultTab==='electrotechnique'?'active':''}">Électrotechnique / Bâtiment</a>
        <a href="#" data-dim-tab="electronique" class="${defaultTab==='electronique'?'active':''}">Électronique</a>
      </div>
      <div id="dim-body">${dimTabHTML(defaultTab)}</div>
    </div></div>`;
}

function dimTabHTML(tab){
  if (tab === 'pv') return dimPvHTML();
  if (tab === 'electronique') return dimElectroniqueHTML();
  return dimElectrotechniqueHTML();
}

/* ---- Photovoltaïque ---- */
function dimPvHTML(){
  return `<div class="card">
    <h3>Dimensionnement photovoltaïque autonome</h3>
    <div class="grid grid-2">
      <div class="field"><label>Besoin énergétique journalier (Wh/jour)</label><input type="number" id="pv-besoin" value="2000"></div>
      <div class="field"><label>Irradiation (heures de soleil équivalentes / jour)</label><input type="number" id="pv-irrad" value="4.5" step="0.1"></div>
      <div class="field"><label>Rendement global du système (%)</label><input type="number" id="pv-rendement" value="75"></div>
      <div class="field"><label>Puissance d'un panneau (Wc)</label><input type="number" id="pv-ppanneau" value="400"></div>
      <div class="field"><label>Tension du parc batterie (V)</label><input type="number" id="pv-vbat" value="24"></div>
      <div class="field"><label>Autonomie souhaitée (jours)</label><input type="number" id="pv-autonomie" value="2"></div>
      <div class="field"><label>Profondeur de décharge admissible — DoD (%)</label><input type="number" id="pv-dod" value="50"></div>
    </div>
    <button class="btn btn-primary btn-sm" id="pv-calc">Calculer</button>
    <div id="pv-result" style="margin-top:16px"></div>
  </div>`;
}
function computePv(){
  const g = id => parseFloat(document.getElementById(id).value) || 0;
  const besoin = g('pv-besoin'), irrad = g('pv-irrad'), rendement = g('pv-rendement')/100, ppanneau = g('pv-ppanneau');
  const vbat = g('pv-vbat'), autonomie = g('pv-autonomie'), dod = g('pv-dod')/100;
  const puissanceCrete = rendement>0 && irrad>0 ? besoin / (irrad * rendement) : 0;
  const nbPanneaux = ppanneau>0 ? Math.ceil(puissanceCrete / ppanneau) : 0;
  const capaciteAh = (vbat>0 && dod>0) ? (besoin * autonomie) / (vbat * dod) : 0;
  const html = `
    <div class="dim-formula">Pc = Besoin ÷ (Irradiation × Rendement) = ${besoin} ÷ (${irrad} × ${(rendement*100).toFixed(0)}%) = <span class="dim-result">${puissanceCrete.toFixed(0)} Wc</span></div>
    <div class="dim-formula">Nb panneaux = ⌈Pc ÷ Ppanneau⌉ = ⌈${puissanceCrete.toFixed(0)} ÷ ${ppanneau}⌉ = <span class="dim-result">${nbPanneaux} panneau(x)</span></div>
    <div class="dim-formula">Capacité batterie = (Besoin × Autonomie) ÷ (Vbat × DoD) = (${besoin} × ${autonomie}) ÷ (${vbat} × ${(dod*100).toFixed(0)}%) = <span class="dim-result">${capaciteAh.toFixed(0)} Ah</span></div>
    <p style="font-size:.82em">Estimation de dimensionnement pédagogique (méthode des heures de soleil équivalentes). Les pertes réelles (câblage, température, salissure, onduleur) sont globalisées dans le rendement système — affinez-le selon votre installation réelle.</p>
    <button class="btn btn-ghost btn-sm" id="pv-use-in-pdf">Inclure ce résultat dans le rapport PDF</button>
    <button class="btn btn-ghost btn-sm" id="pv-export-pdf">Exporter ce dimensionnement (PDF)</button>`;
  document.getElementById('pv-result').innerHTML = html;
  window.__pvLastHTML = `<p><strong>Photovoltaïque</strong> — Besoin : ${besoin} Wh/j, Irradiation : ${irrad} h/j, Rendement : ${(rendement*100).toFixed(0)}%.</p>
    <p>Puissance crête nécessaire : ${puissanceCrete.toFixed(0)} Wc → ${nbPanneaux} panneau(x) de ${ppanneau} Wc. Capacité batterie recommandée : ${capaciteAh.toFixed(0)} Ah sous ${vbat} V (autonomie ${autonomie} j, DoD ${(dod*100).toFixed(0)}%).</p>`;
}

/* ---- Électrotechnique / Bâtiment ---- */
function dimElectrotechniqueHTML(){
  return `<div class="card">
    <h3>Courant, section de câble et protection</h3>
    <div class="grid grid-2">
      <div class="field"><label>Puissance (W)</label><input type="number" id="et-puissance" value="3000"></div>
      <div class="field"><label>Tension (V)</label><input type="number" id="et-tension" value="230"></div>
      <div class="field"><label>Régime</label><select id="et-regime"><option value="mono">Monophasé</option><option value="tri">Triphasé</option></select></div>
      <div class="field"><label>cos φ (facteur de puissance)</label><input type="number" id="et-cosphi" value="0.9" step="0.05"></div>
      <div class="field"><label>Longueur de câble (m, aller simple)</label><input type="number" id="et-longueur" value="20"></div>
      <div class="field"><label>Chute de tension maximale admissible (%)</label><input type="number" id="et-chute" value="3"></div>
    </div>
    <button class="btn btn-primary btn-sm" id="et-calc">Calculer</button>
    <div id="et-result" style="margin-top:16px"></div>
  </div>`;
}
function computeEt(){
  const g = id => parseFloat(document.getElementById(id).value) || 0;
  const p = g('et-puissance'), u = g('et-tension'), cosphi = g('et-cosphi') || 1, l = g('et-longueur'), chutePct = g('et-chute') || 3;
  const tri = document.getElementById('et-regime').value === 'tri';
  const rho = 0.0225; // Ω·mm²/m, résistivité du cuivre à ~70°C (valeur d'usage courant en installation)
  const courant = tri ? p / (u * Math.sqrt(3) * cosphi) : p / (u * cosphi);
  const deltaU = u * chutePct/100;
  const section = tri
    ? (Math.sqrt(3) * rho * l * courant * cosphi) / deltaU
    : (2 * rho * l * courant * cosphi) / deltaU;
  const sectionNorm = sectionAuDessus(section);
  const calibre = calibreAuDessus(courant);
  const html = `
    <div class="dim-formula">In = P ÷ (${tri?'U×√3×cosφ':'U×cosφ'}) = ${p} ÷ (${tri?`${u}×√3×${cosphi}`:`${u}×${cosphi}`}) = <span class="dim-result">${courant.toFixed(1)} A</span></div>
    <div class="dim-formula">S = (${tri?'√3':'2'}×ρ×L×In×cosφ) ÷ ΔU = (${tri?'√3':'2'}×${rho}×${l}×${courant.toFixed(1)}×${cosphi}) ÷ ${deltaU.toFixed(1)} = ${section.toFixed(2)} mm² → section normalisée : <span class="dim-result">${sectionNorm} mm²</span></div>
    <div class="dim-formula">Calibre de protection ≥ In = ${courant.toFixed(1)} A → calibre normalisé : <span class="dim-result">${calibre} A</span></div>
    <p style="font-size:.82em">ρ (résistivité du cuivre en service) prise à 0,0225 Ω·mm²/m. Vérifiez toujours le résultat avec la norme applicable (NF C 15-100 ou équivalent local) avant réalisation : ce calcul est une estimation pédagogique de premier ordre, pas une note de calcul certifiée.</p>
    <button class="btn btn-ghost btn-sm" id="et-use-in-pdf">Inclure ce résultat dans le rapport PDF</button>
    <button class="btn btn-ghost btn-sm" id="et-export-pdf">Exporter ce dimensionnement (PDF)</button>`;
  document.getElementById('et-result').innerHTML = html;
  window.__etLastHTML = `<p><strong>Électrotechnique / Bâtiment</strong> — P = ${p} W, U = ${u} V (${tri?'triphasé':'monophasé'}), cos φ = ${cosphi}, longueur = ${l} m.</p>
    <p>Courant nominal : ${courant.toFixed(1)} A. Section de câble recommandée : ${sectionNorm} mm² (pour une chute de tension ≤ ${chutePct}%). Calibre de protection recommandé : ${calibre} A.</p>`;
}

/* ---- Électronique ---- */
function dimElectroniqueHTML(){
  return `<div class="card">
    <h3>Résistance série pour LED</h3>
    <div class="grid grid-2">
      <div class="field"><label>Tension d'alimentation (V)</label><input type="number" id="el-vs" value="9"></div>
      <div class="field"><label>Tension de seuil de la LED (V)</label><input type="number" id="el-vf" value="2"></div>
      <div class="field"><label>Courant direct souhaité (mA)</label><input type="number" id="el-if" value="15"></div>
    </div>
    <button class="btn btn-primary btn-sm" id="el-calc">Calculer</button>
    <div id="el-result" style="margin-top:12px"></div>
  </div>
  <div class="card" style="margin-top:16px">
    <h3>Diviseur de tension</h3>
    <div class="grid grid-2">
      <div class="field"><label>Tension d'entrée Vin (V)</label><input type="number" id="dv-vin" value="12"></div>
      <div class="field"><label>R1 (Ω, côté Vin)</label><input type="number" id="dv-r1" value="1000"></div>
      <div class="field"><label>R2 (Ω, côté masse)</label><input type="number" id="dv-r2" value="1000"></div>
    </div>
    <button class="btn btn-primary btn-sm" id="dv-calc">Calculer</button>
    <div id="dv-result" style="margin-top:12px"></div>
  </div>
  <div class="card" style="margin-top:16px">
    <h3>Puissance dissipée par un régulateur linéaire</h3>
    <div class="grid grid-2">
      <div class="field"><label>Tension d'entrée (V)</label><input type="number" id="rg-vin" value="12"></div>
      <div class="field"><label>Tension de sortie (V)</label><input type="number" id="rg-vout" value="5"></div>
      <div class="field"><label>Courant de sortie (A)</label><input type="number" id="rg-iout" value="0.5" step="0.1"></div>
    </div>
    <button class="btn btn-primary btn-sm" id="rg-calc">Calculer</button>
    <div id="rg-result" style="margin-top:12px"></div>
  </div>`;
}
function computeEl(){
  const g = id => parseFloat(document.getElementById(id).value) || 0;
  const vs = g('el-vs'), vf = g('el-vf'), ifmA = g('el-if');
  const iA = ifmA/1000;
  const r = iA>0 ? (vs-vf)/iA : 0;
  const p = r>0 ? iA*iA*r : 0;
  document.getElementById('el-result').innerHTML = `
    <div class="dim-formula">R = (Vs − Vf) ÷ If = (${vs} − ${vf}) ÷ ${ifmA}mA = <span class="dim-result">${r.toFixed(0)} Ω</span></div>
    <div class="dim-formula">Puissance dissipée dans R = If² × R = <span class="dim-result">${(p*1000).toFixed(0)} mW</span> — choisir une résistance de puissance nominale supérieure.</div>`;
}
function computeDv(){
  const g = id => parseFloat(document.getElementById(id).value) || 0;
  const vin = g('dv-vin'), r1=g('dv-r1'), r2=g('dv-r2');
  const vout = (r1+r2)>0 ? vin * r2/(r1+r2) : 0;
  document.getElementById('dv-result').innerHTML = `<div class="dim-formula">Vout = Vin × R2 ÷ (R1+R2) = ${vin} × ${r2} ÷ (${r1}+${r2}) = <span class="dim-result">${vout.toFixed(2)} V</span></div>
    <p style="font-size:.82em">Valable à vide uniquement (sans charge tirant du courant sur la sortie).</p>`;
}
function computeRg(){
  const g = id => parseFloat(document.getElementById(id).value) || 0;
  const vin=g('rg-vin'), vout=g('rg-vout'), iout=g('rg-iout');
  const p = (vin-vout)*iout;
  document.getElementById('rg-result').innerHTML = `<div class="dim-formula">P = (Vin − Vout) × Iout = (${vin} − ${vout}) × ${iout} = <span class="dim-result">${p.toFixed(2)} W</span></div>
    <p style="font-size:.82em">Cette puissance est dissipée en chaleur dans le régulateur : prévoyez un dissipateur thermique adapté si elle dépasse quelques centaines de mW.</p>`;
}

function afterDimensionnementView(){
  document.querySelectorAll('[data-dim-tab]').forEach(a => a.onclick = (e) => {
    e.preventDefault();
    document.querySelectorAll('[data-dim-tab]').forEach(x=>x.classList.remove('active'));
    a.classList.add('active');
    document.getElementById('dim-body').innerHTML = dimTabHTML(a.dataset.dimTab);
    wireDimHandlers();
  });
  wireDimHandlers();
}
function wireDimHandlers(){
  document.getElementById('pv-calc')?.addEventListener('click', () => {
    computePv();
    document.getElementById('pv-use-in-pdf')?.addEventListener('click', () => {
      window.__lastDimResult = { projectId: window.__dimProjectId, type:'Photovoltaïque', html: window.__pvLastHTML }; toast('Résultat ajouté au rapport PDF de ce projet.'); });
    document.getElementById('pv-export-pdf')?.addEventListener('click', async () => {
      window.__lastDimResult = { projectId: window.__dimProjectId, type:'Photovoltaïque', html: window.__pvLastHTML };
      if (!confirm('Exporter ce dimensionnement en PDF maintenant ?')) return;
      exportDimensionnementPDF(window.__dimProjectId);
    });
  });
  document.getElementById('et-calc')?.addEventListener('click', () => {
    computeEt();
    document.getElementById('et-use-in-pdf')?.addEventListener('click', () => {
      window.__lastDimResult = { projectId: window.__dimProjectId, type:'Électrotechnique / Bâtiment', html: window.__etLastHTML }; toast('Résultat ajouté au rapport PDF de ce projet.'); });
    document.getElementById('et-export-pdf')?.addEventListener('click', async () => {
      window.__lastDimResult = { projectId: window.__dimProjectId, type:'Électrotechnique / Bâtiment', html: window.__etLastHTML };
      if (!confirm('Exporter ce dimensionnement en PDF maintenant ?')) return;
      exportDimensionnementPDF(window.__dimProjectId);
    });
  });
  document.getElementById('el-calc')?.addEventListener('click', computeEl);
  document.getElementById('dv-calc')?.addEventListener('click', computeDv);
  document.getElementById('rg-calc')?.addEventListener('click', computeRg);
}
