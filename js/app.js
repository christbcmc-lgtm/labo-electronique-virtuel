/* ==========================================================================
   APPLICATION — routeur, vues (landing, auth, tableau de bord, discussion,
   messagerie, compte, admin), thèmes.
   ========================================================================== */

const $app = document.getElementById('app');
const $toasts = document.getElementById('toasts');

const state = { recovery:{}, chatWith:null };
const ESPACES = {
  'electronique': { nom:'Électronique', icon:'◧' },
  'electrotechnique': { nom:'Électrotechnique', icon:'⌁' },
  'batiment': { nom:'Électricité du bâtiment', icon:'⌂' },
  'energies-renouvelables': { nom:'Énergies Renouvelables', icon:'☀' },
  'automatisme': { nom:'Automatisme et commande', icon:'⚙' },
};
const ACCOUNT_TYPES = {
  solo: { icon:'👤', label:'Personnel', desc:'Un usage individuel.' },
  groupe: { icon:'🤝', label:'Groupe (2-3)', desc:'Un responsable, quelques membres.' },
  communaute: { icon:'🏫', label:'Communauté', desc:'Plusieurs personnes et projets.' },
};

function toast(msg){ const el=document.createElement('div'); el.className='toast'; el.textContent=msg; $toasts.appendChild(el); setTimeout(()=>el.remove(),3400); }
function initials(u){ return u ? u.avatar : '?'; }
function fmtBytes(n){ return n < 1024 ? n+' o' : n < 1024*1024 ? (n/1024).toFixed(1)+' Ko' : (n/1024/1024).toFixed(2)+' Mo'; }

/* ---- Thème (§33) : sombre / clair / gris, léger (juste une classe + localStorage) ---- */
const THEME_KEY = 'labo_theme';
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  try{ localStorage.setItem(THEME_KEY, t); }catch(e){}
}
function currentTheme(){ try{ return localStorage.getItem(THEME_KEY) || 'sombre'; }catch(e){ return 'sombre'; } }
applyTheme(currentTheme());
function themeSwitchHTML(){
  const t = currentTheme();
  return `<div class="theme-switch" title="Thème">
    ${['sombre','clair','gris'].map(k => `<button data-theme-pick="${k}" class="theme-swatch-${k} ${t===k?'active':''}" title="${k}"></button>`).join('')}
  </div>`;
}

/* ==========================================================================
   ROUTEUR
   ========================================================================== */
const PUBLIC_ROUTES = ['', 'login', 'register', 'forgot', 'reset-email', 'change-password'];
function currentRoute(){ return location.hash.replace(/^#\/?/, ''); }
function go(route){ location.hash = '#/' + route; }
window.go = go;

const AFTER = {
  login: () => afterLoginView(), register: () => afterRegisterView(), forgot: () => afterForgotView(),
  'reset-email': () => afterResetEmailView(), 'change-password': () => afterChangePasswordView(),
  dashboard: () => afterDashboardView(), 'shared': () => afterDashboardView(),
  project: () => afterProjectView(), devis: () => afterDevisView(), dimensionnement: () => afterDimensionnementView(),
  discussion: () => afterDiscussionView(), messages: () => afterMessagesView(),
  admin: () => afterAdminView(), compte: () => afterCompteView(),
};

let __renderGen = 0;
async function render(){
  const myGen = ++__renderGen;
  const route = currentRoute();
  const [base, param] = route.split('/');
  const needsAuth = !PUBLIC_ROUTES.includes(base);
  if (needsAuth && !auth.currentUser){ go('login'); return; }
  if (auth.currentUser && auth.currentUser.mustChangePassword && base !== 'change-password'){ go('change-password'); return; }
  if (base === 'admin' && auth.currentUser?.role !== 'admin'){ go('dashboard'); toast("Accès réservé à l'administrateur."); return; }

  const routes = {
    ''          : viewLanding, 'login':viewLogin, 'register':viewRegister, 'forgot':viewForgot,
    'reset-email': viewResetEmail, 'change-password': viewChangePassword,
    'dashboard' : () => viewDashboard(param), 'shared': viewShared,
    'project'   : () => viewProject(param), 'devis': () => viewDevis(param), 'dimensionnement': () => viewDimensionnement(param),
    'discussion': viewDiscussion, 'messages': viewMessages,
    'compte'    : viewCompte, 'admin': () => viewAdmin(param || 'overview'),
  };
  const fn = routes[base] || (() => `<div class="empty">Page introuvable. <a href="#/">Retour</a></div>`);
  const result = fn();
  const html = (result && result.then) ? await result : result;

  if (myGen !== __renderGen) return;

  renderTopbar(route);
  $app.innerHTML = html;
  window.scrollTo?.(0,0);
  AFTER[base]?.();
}
async function bootAuth(){
  if (!SUPABASE_CONFIGURED) return;
  const { data:{ session } } = await supabaseClient.auth.getSession();
  if (session){
    auth.currentUser = await fetchProfile(session.user.id);
    await refreshProfilesCache();
  }
  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') go('change-password');
    if (event === 'SIGNED_OUT') { auth.currentUser = null; render(); }
  });
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', async () => { await bootAuth(); render(); });

/* ==========================================================================
   TOPBAR
   ========================================================================== */
const MODE_PILL = SUPABASE_CONFIGURED
  ? `<span class="pill pill-cyan" title="Comptes et projets stockés sur votre projet Supabase">Supabase</span>`
  : `<span class="pill" title="Comptes et projets stockés uniquement dans ce navigateur (localStorage) — voir le rapport final pour connecter Supabase">Démo locale</span>`;

function renderTopbar(route){
  const bar = document.getElementById('topbar');
  const base = route.split('/')[0];
  const user = auth.currentUser;
  if (!user){
    bar.innerHTML = `<a href="#/" class="brand"><span class="brand-mark">◈</span> Labo Électronique Virtuel</a>
      <div class="right">${themeSwitchHTML()}${MODE_PILL}<a href="#/login" class="btn btn-ghost btn-sm">Connexion</a><a href="#/register" class="btn btn-primary btn-sm">Créer un compte</a></div>`;
    wireThemeSwitch();
    return;
  }
  const links = [['dashboard','Mon espace'],['discussion','Discussion & suggestions'],['messages','Messagerie']];
  if (user.role === 'admin') links.push(['admin','Admin']);
  bar.innerHTML = `<a href="#/dashboard" class="brand"><span class="brand-mark">◈</span> Labo Électronique Virtuel</a>
    <nav>${links.map(([r,l]) => `<a href="#/${r}" class="navlink ${base===r?'active':''}">${l}</a>`).join('')}</nav>
    <div class="right">
      ${themeSwitchHTML()}
      ${MODE_PILL}
      <a href="#/compte" class="avatar" title="${esc(user.prenom)} ${esc(user.nom)}">${initials(user)}</a>
      <button class="btn btn-ghost btn-sm" id="btn-logout">Se déconnecter</button>
    </div>`;
  bar.querySelector('#btn-logout').onclick = async () => { await auth.signOut(); toast('Déconnecté.'); go(''); };
  wireThemeSwitch();
}
function wireThemeSwitch(){
  document.querySelectorAll('[data-theme-pick]').forEach(b => b.onclick = () => { applyTheme(b.dataset.themePick); render(); });
}

/* ==========================================================================
   LANDING
   ========================================================================== */
function viewLanding(){
  return `
  <section class="hero pcb-grid">
    <div class="eyebrow">Laboratoire pédagogique · pré-simulation</div>
    <h1>Concevez, mesurez et comprenez vos <span class="accent">circuits</span><br>avant de passer au simulateur professionnel.</h1>
    <p class="lead">Un espace léger pour l'électronique, l'électrotechnique, le bâtiment, les énergies renouvelables et l'automatisme : schéma avec vrais symboles, instruments virtuels, détection d'erreurs, devis et dimensionnement.</p>
    <div class="hero-actions"><a href="#/register" class="btn btn-primary">Entrer</a><a href="#dashboard-preview" class="btn">Voir les espaces</a></div>
  </section>
  <section class="spaces" id="dashboard-preview">
    ${Object.entries(ESPACES).map(([k,e]) => `<div class="space-card"><span class="icon">${e.icon}</span><h3>${e.nom}</h3></div>`).join('')}
  </section>`;
}

/* ==========================================================================
   AUTH
   ========================================================================== */
function viewLogin(){
  return `
  <div class="auth-shell pcb-grid"><div class="auth-card">
    <h2>Accéder à votre espace</h2><p class="sub">Content de vous revoir.</p>
    <button class="btn btn-block" id="btn-google">Continuer avec Google</button>
    <div class="auth-divider">ou avec un e-mail</div>
    <form id="form-login">
      <div class="field"><label>E-mail</label><input type="email" name="email" required></div>
      <div class="field field-pw"><label>Mot de passe</label><input type="password" name="password" id="pw-login" required><button type="button" data-toggle="pw-login">Afficher</button></div>
      <div class="field-error hidden" id="login-error"></div>
      <button class="btn btn-primary btn-block" type="submit">Se connecter</button>
    </form>
    <div class="auth-switch"><a href="#/register">Créer un compte</a> · <a href="#/forgot">Mot de passe oublié ?</a></div>
  </div></div>`;
}
function afterLoginView(){
  document.getElementById('btn-google').onclick = () => {
    if (SUPABASE_CONFIGURED) supabaseClient.auth.signInWithOAuth({ provider:'google' });
    else toast('Connexion Google — disponible une fois Supabase configuré (voir supabase/schema.sql et Authentication → Providers dans votre projet Supabase).');
  };
  wirePwToggle();
  document.getElementById('form-login').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const { data, error } = await auth.signInWithPassword({ email:f.get('email'), password:f.get('password') });
    const $err = document.getElementById('login-error');
    if (error){ $err.textContent = error.message; $err.classList.remove('hidden'); return; }
    toast(`Bienvenue${data.user.prenom ? ', '+data.user.prenom : ''}.`);
    go('dashboard');
  };
}

function viewRegister(){
  return `
  <div class="auth-shell pcb-grid"><div class="auth-card" style="max-width:460px">
    <h2>Créer un compte</h2><p class="sub">Choisissez d'abord le type de compte.</p>
    <div class="type-cards" id="type-cards">
      ${Object.entries(ACCOUNT_TYPES).map(([k,t],i) => `
        <button type="button" class="type-card ${i===0?'selected':''}" data-type="${k}">
          <span class="t-icon">${t.icon}</span>${t.label}
        </button>`).join('')}
    </div>
    <form id="form-register">
      <input type="hidden" name="accountType" value="solo">
      <div class="grid grid-2" style="text-align:left">
        <div class="field"><label>Prénom</label><input name="prenom" required></div>
        <div class="field"><label>Nom</label><input name="nom" required></div>
      </div>
      <div class="field"><label>E-mail</label><input type="email" name="email" required></div>
      <div class="field field-pw"><label>Mot de passe</label><input type="password" name="password" id="pw-reg" required><button type="button" data-toggle="pw-reg">Afficher</button></div>
      <div class="field">
        <label>Mot magique</label><input name="motMagique" required>
        <div class="field-hint">Une information que vous seul connaissez — elle sert de vérification secondaire si vous oubliez votre mot de passe (voir le rapport final pour la politique de sécurité complète).</div>
      </div>
      <div class="field-error hidden" id="register-error"></div>
      <button class="btn btn-primary btn-block" type="submit">Créer mon compte</button>
    </form>
    <div class="auth-switch">Déjà un compte ? <a href="#/login">Se connecter</a></div>
  </div></div>`;
}
function afterRegisterView(){
  wirePwToggle();
  const form = document.getElementById('form-register');
  document.querySelectorAll('#type-cards .type-card').forEach(card => {
    card.onclick = () => {
      document.querySelectorAll('#type-cards .type-card').forEach(c=>c.classList.remove('selected'));
      card.classList.add('selected');
      form.querySelector('[name=accountType]').value = card.dataset.type;
    };
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const { data, error } = await auth.signUp(f);
    const $err = document.getElementById('register-error');
    if (error){ $err.textContent = error.message; $err.classList.remove('hidden'); return; }
    toast(`Compte créé — bienvenue ${data.user.prenom}.`);
    go('dashboard');
  };
}

function viewForgot(){
  if (SUPABASE_CONFIGURED){
    return `
    <div class="auth-shell pcb-grid"><div class="auth-card">
      <h2>Mot de passe oublié</h2><p class="sub">Recevez un lien de réinitialisation sécurisé par e-mail.</p>
      <form id="form-forgot">
        <div class="field"><label>E-mail</label><input type="email" name="email" required></div>
        <div class="field-error hidden" id="forgot-error"></div>
        <button class="btn btn-primary btn-block" type="submit">Envoyer le lien</button>
      </form>
      <div class="auth-switch"><a href="#/login">Retour à la connexion</a></div>
    </div></div>`;
  }
  return `
  <div class="auth-shell pcb-grid"><div class="auth-card">
    <div class="step-indicator"><span class="active"></span><span></span></div>
    <h2>Mot de passe oublié</h2><p class="sub">Entrez votre mot magique pour vérifier votre identité.</p>
    <div class="magic-note">Mode démo locale — en production (Supabase configuré), ce formulaire envoie un vrai lien de réinitialisation par e-mail ; le mot magique ne suffit alors plus à lui seul à prouver l'identité.</div>
    <form id="form-forgot">
      <div class="field"><label>E-mail</label><input type="email" name="email" required></div>
      <div class="field"><label>Entrez votre mot magique</label><input name="motMagique" required></div>
      <div class="field-error hidden" id="forgot-error"></div>
      <button class="btn btn-primary btn-block" type="submit">Vérifier</button>
    </form>
    <div class="auth-switch"><a href="#/login">Retour à la connexion</a></div>
  </div></div>`;
}
function afterForgotView(){
  document.getElementById('form-forgot').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const email = f.get('email');
    const $err = document.getElementById('forgot-error');
    if (SUPABASE_CONFIGURED){
      const { error } = await auth.sendPasswordReset({ email });
      if (error){ $err.textContent = error.message; $err.classList.remove('hidden'); return; }
      toast("E-mail envoyé si ce compte existe — suivez le lien reçu pour choisir un nouveau mot de passe.");
      go('login');
      return;
    }
    const { data, error } = await auth.verifyMotMagique({ email, motMagique:f.get('motMagique') });
    if (error){ $err.textContent = error.message; $err.classList.remove('hidden'); return; }
    state.recovery = { email, tempPassword:data.tempPassword, emailMasque:data.emailMasque };
    toast('Mot magique vérifié.');
    go('reset-email');
  };
}
function viewResetEmail(){
  const r = state.recovery;
  if (!r.email){ setTimeout(()=>go('forgot'),0); return '<div class="empty">Redirection…</div>'; }
  return `
  <div class="auth-shell pcb-grid"><div class="auth-card">
    <div class="step-indicator"><span class="active"></span><span class="active"></span></div>
    <h2>Mot de passe temporaire</h2>
    <p class="sub">Un mot de passe temporaire a été envoyé à ${esc(r.emailMasque)}.</p>
    <div class="magic-note">Simulation locale — en production, ceci part par e-mail et n'apparaît jamais à l'écran.<br>Code de démonstration : <strong class="mono">${esc(r.tempPassword)}</strong></div>
    <form id="form-reset-email">
      <div class="field"><label>Mot de passe temporaire</label><input name="tempPassword" required></div>
      <div class="field-error hidden" id="reset-error"></div>
      <button class="btn btn-primary btn-block" type="submit">Se connecter</button>
    </form>
  </div></div>`;
}
function afterResetEmailView(){
  const form = document.getElementById('form-reset-email');
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const { error } = await auth.signInWithTempPassword({ email:state.recovery.email, tempPassword:f.get('tempPassword') });
    const $err = document.getElementById('reset-error');
    if (error){ $err.textContent = error.message; $err.classList.remove('hidden'); return; }
    toast('Connecté avec le mot de passe temporaire.');
    go('change-password');
  };
}
function viewChangePassword(){
  return `
  <div class="auth-shell pcb-grid"><div class="auth-card">
    <div class="step-indicator"><span class="active"></span><span class="active"></span></div>
    <h2>Choisissez un nouveau mot de passe</h2><p class="sub">Vous devez définir un mot de passe définitif avant de continuer.</p>
    <form id="form-change-pw">
      <div class="field field-pw"><label>Nouveau mot de passe</label><input type="password" name="p1" id="pw-new1" required><button type="button" data-toggle="pw-new1">Afficher</button></div>
      <div class="field"><label>Valider le nouveau mot de passe</label><input type="password" name="p2" required></div>
      <div class="field-error hidden" id="cp-error"></div>
      <button class="btn btn-primary btn-block" type="submit">Valider</button>
    </form>
  </div></div>`;
}
function afterChangePasswordView(){
  wirePwToggle();
  document.getElementById('form-change-pw').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const $err = document.getElementById('cp-error');
    if (f.get('p1') !== f.get('p2')){ $err.textContent='Les deux mots de passe ne correspondent pas.'; $err.classList.remove('hidden'); return; }
    if (f.get('p1').length < 6){ $err.textContent='6 caractères minimum.'; $err.classList.remove('hidden'); return; }
    const { error } = await auth.updatePassword({ newPassword:f.get('p1') });
    if (error){ $err.textContent = error.message; $err.classList.remove('hidden'); return; }
    if (SUPABASE_CONFIGURED && !auth.currentUser){
      const { data:{ session } } = await supabaseClient.auth.getSession();
      if (session){ auth.currentUser = await fetchProfile(session.user.id); await refreshProfilesCache(); }
    }
    toast('Mot de passe mis à jour.');
    go('dashboard');
  };
}
function wirePwToggle(){
  document.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.onclick = () => {
      const input = document.getElementById(btn.dataset.toggle);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Masquer' : 'Afficher';
    };
  });
}

/* ==========================================================================
   TABLEAU DE BORD
   ========================================================================== */
function renderSidebar(active){
  return `<aside class="sidebar">
    <a href="#/dashboard" class="sb-link ${active==='mine'?'active':''}">📁 Mes projets</a>
    <a href="#/shared" class="sb-link ${active==='shared'?'active':''}">🤝 Partagés avec moi</a>
    <div class="sb-label">Espaces</div>
    ${Object.entries(ESPACES).map(([k,e]) => `<a href="#/dashboard/${k}" class="sb-link ${active===k?'active':''}">${e.icon} ${e.nom}</a>`).join('')}
    <div class="sb-label">Compte</div>
    <a href="#/compte" class="sb-link ${active==='compte'?'active':''}">⚙ Paramètres</a>
  </aside>`;
}

async function viewDashboard(espaceKey){
  const user = auth.currentUser;
  const { data: projects } = await db.listProjects({ userId:user.id, espace:espaceKey });
  const title = espaceKey ? ESPACES[espaceKey]?.nom : 'Mes projets';
  return `<div class="app-shell">${renderSidebar(espaceKey || 'mine')}
    <div class="main">
      <div class="main-header"><h2>${esc(title)}</h2><button class="btn btn-primary btn-sm" id="btn-new-project">+ Nouveau projet</button></div>
      <div class="grid grid-3" id="project-grid">
        ${projects.map(p=>projectCard(p)).join('')}
        <button class="project-card project-card-new" id="btn-new-project-2">+ Nouveau projet</button>
      </div>
      ${projects.length === 0 ? `<p style="margin-top:16px">Aucun projet pour l'instant — créez le premier.</p>` : ''}
    </div></div>`;
}
async function viewShared(){
  const user = auth.currentUser;
  const { data: projects } = await db.listSharedProjects(user.id);
  return `<div class="app-shell">${renderSidebar('shared')}
    <div class="main">
      <div class="main-header"><h2>Partagés avec moi</h2></div>
      <div class="grid grid-3">${projects.map(p => projectCard(p, true)).join('')}</div>
      ${projects.length === 0 ? `<div class="empty">Aucun projet partagé avec vous pour l'instant.</div>` : ''}
    </div></div>`;
}
function projectCard(p, showOwner){
  const owner = db.userById(p.ownerId);
  return `<div class="project-card">
    <div class="thumb" data-open="${p.id}" style="cursor:pointer"></div>
    <div data-open="${p.id}" style="cursor:pointer"><strong style="font-size:.94em">${esc(p.titre)}</strong>
      <div class="meta"><span>${ESPACES[p.espace]?.nom || p.espace}</span><span>${p.updatedAt}</span></div>
      ${showOwner ? `<div class="meta" style="margin-top:4px">Propriétaire : ${esc(owner?.prenom)} ${esc(owner?.nom)}</div>` : ''}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center">
      ${p.erreurs > 0 ? `<span class="pill" style="color:var(--danger);border-color:var(--danger-dim)">⚠ ${p.erreurs} erreur(s)</span>` : `<span class="pill"><span class="pill-dot"></span> OK</span>`}
      ${showOwner ? '' : `<div style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-sm" data-dup="${p.id}" title="Dupliquer">⧉</button>
        <button class="btn btn-ghost btn-sm" data-del-project="${p.id}" title="Supprimer">✕</button>
      </div>`}
    </div>
  </div>`;
}
function afterDashboardView(){
  document.querySelectorAll('[data-open]').forEach(c => c.onclick = () => go('project/' + c.dataset.open));
  document.querySelectorAll('[data-dup]').forEach(b => b.onclick = async (e) => {
    e.stopPropagation();
    const { data, error } = await db.duplicateProject(b.dataset.dup);
    if (error){ toast(error.message); return; }
    toast('Projet dupliqué.'); render();
  });
  document.querySelectorAll('[data-del-project]').forEach(b => b.onclick = async (e) => {
    e.stopPropagation();
    if (!confirm('Supprimer définitivement ce projet ?')) return;
    await db.deleteProject(b.dataset.delProject);
    toast('Projet supprimé.'); render();
  });
  const openModal = async () => {
    const opts = Object.entries(ESPACES).map(([k,e]) => `<option value="${k}">${e.nom}</option>`).join('');
    const backdrop = document.createElement('div'); backdrop.className='modal-backdrop';
    backdrop.innerHTML = `<div class="modal"><h3>Nouveau projet</h3>
      <form id="form-new-project">
        <div class="field"><label>Titre du projet</label><input name="titre" required autofocus></div>
        <div class="field"><label>Espace</label><select name="espace">${opts}</select></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:1.2em">
          <button type="button" class="btn btn-ghost" id="btn-cancel-modal">Annuler</button>
          <button type="submit" class="btn btn-primary">Créer</button>
        </div></form></div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('#btn-cancel-modal').onclick = () => backdrop.remove();
    backdrop.querySelector('#form-new-project').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const { data:p } = await db.createProject({ ownerId:auth.currentUser.id, titre:f.get('titre'), espace:f.get('espace') });
      backdrop.remove(); toast('Projet créé.'); go('project/' + p.id);
    };
  };
  document.getElementById('btn-new-project')?.addEventListener('click', openModal);
  document.getElementById('btn-new-project-2')?.addEventListener('click', openModal);
}

/* ==========================================================================
   DISCUSSION & SUGGESTIONS (privées entre l'auteur et l'admin)
   ========================================================================== */
async function viewDiscussion(){
  const { data: messages } = await db.listCommonMessages();
  const isAdmin = auth.currentUser.role === 'admin';
  const { data: suggestions } = isAdmin ? await db.listAllSuggestions() : await db.listMySuggestions(auth.currentUser.id);
  return `<div class="app-shell">${renderSidebar()}
    <div class="main"><div class="grid grid-2">
      <div class="card"><h3>Discussion & suggestions</h3><p>Visible par tous les utilisateurs connectés.</p>
        <div class="thread">${messages.map(m => { const u=db.userById(m.userId);
          return `<div class="msg ${m.pinned?'pinned':''} ${m.userId===auth.currentUser.id?'mine':''}"><div class="who">${m.pinned?'📌 ':''}${esc(u?.prenom)} ${esc(u?.nom)}</div>${esc(m.texte)}<div class="when">${m.createdAt}</div></div>`;
        }).join('')}</div>
        <form class="composer" id="form-common"><input name="texte" placeholder="Partagez une idée, une question…" required><button class="btn btn-primary btn-sm">Envoyer</button></form>
      </div>
      <div class="card"><h3>${isAdmin ? 'Toutes les suggestions' : 'Mes suggestions'}</h3><p>${isAdmin ? 'Visibles uniquement par vous (admin) et leur auteur respectif.' : 'Visibles uniquement par vous et l\'administrateur.'}</p>
        <div class="thread">${suggestions.map(s => `<div class="msg ${s.userId===auth.currentUser.id?'mine':''}"><div class="who">${esc(db.userById(s.userId)?.prenom)} · ${s.statut}</div>${esc(s.texte)}
          ${s.reponseAdmin ? `<div class="when" style="color:var(--cyan)">Réponse : ${esc(s.reponseAdmin)}</div>` : ''}</div>`).join('')}
        </div>
        ${isAdmin ? '' : `<form class="composer" id="form-suggestion"><input name="texte" placeholder="Nouvelle suggestion à l'admin…" required><button class="btn btn-sm">Envoyer</button></form>`}
      </div>
    </div></div></div>`;
}
function afterDiscussionView(){
  document.getElementById('form-common')?.addEventListener('submit', async (e) => { e.preventDefault(); await db.addCommonMessage({ userId:auth.currentUser.id, texte:new FormData(e.target).get('texte') }); render(); });
  document.getElementById('form-suggestion')?.addEventListener('submit', async (e) => { e.preventDefault(); await db.addSuggestion({ userId:auth.currentUser.id, texte:new FormData(e.target).get('texte') }); toast('Suggestion envoyée.'); render(); });
}

/* ==========================================================================
   MESSAGERIE PRIVÉE
   ========================================================================== */
async function viewMessages(){
  const { data: users } = await db.listUsers();
  const others = users.filter(u => u.id !== auth.currentUser.id);
  const active = state.chatWith || others[0]?.id;
  const { data: thread } = active ? await db.listPrivateThread(auth.currentUser.id, active) : { data:[] };
  return `<div class="app-shell">${renderSidebar()}
    <div class="main"><div class="grid" style="grid-template-columns:220px 1fr;gap:16px">
      <div class="card pad-0"><div style="padding:14px 14px 4px"><strong style="font-size:.88em">Contacter un utilisateur</strong></div>
        <div class="people-list" style="padding:0 8px 10px">${others.map(u => `<button class="p-item ${u.id===active?'active':''}" data-user="${u.id}">${esc(u.prenom)} ${esc(u.nom)}</button>`).join('') || '<div class="empty">Aucun autre utilisateur.</div>'}</div>
      </div>
      <div class="card"><h3>${active ? esc(db.userById(active).prenom)+' '+esc(db.userById(active).nom) : 'Conversations'}</h3>
        <div class="thread">${thread.length ? thread.map(m => `<div class="msg ${m.from===auth.currentUser.id?'mine':''}">${esc(m.texte)}<div class="when">${m.createdAt}</div></div>`).join('') : '<div class="empty">Aucun message. Dites bonjour 👋</div>'}</div>
        <form class="composer" id="form-private"><input name="texte" placeholder="Votre message…" required><button class="btn btn-primary btn-sm">Envoyer</button></form>
      </div>
    </div></div></div>`;
}
function afterMessagesView(){
  document.querySelectorAll('[data-user]').forEach(b => b.onclick = () => { state.chatWith = b.dataset.user; render(); });
  document.getElementById('form-private')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data: users } = await db.listUsers();
    const to = state.chatWith || users.find(u=>u.id!==auth.currentUser.id)?.id;
    if (!to) return;
    await db.sendPrivateMessage({ from:auth.currentUser.id, to, texte:new FormData(e.target).get('texte') });
    render();
  });
}

/* ==========================================================================
   COMPTE (+ gestion des membres si groupe/communauté, + quota de stockage §27/§28)
   ========================================================================== */
async function viewCompte(){
  const u = auth.currentUser;
  const type = ACCOUNT_TYPES[u.accountType] || ACCOUNT_TYPES.solo;
  const { data: members } = u.accountType !== 'solo' ? await db.listGroupMembers(u.id) : { data:[] };
  const { data: usage } = await db.storageUsage(u.id);
  const { data: myRequests } = await db.listMyStorageRequests(u.id);
  const pct = Math.min(100, Math.round((usage.bytes / usage.quota) * 100));
  return `<div class="app-shell">${renderSidebar('compte')}
    <div class="main" style="max-width:560px">
      <div class="main-header"><h2>Paramètres du compte</h2></div>
      <div class="card">
        <div class="field"><label>Prénom</label><input value="${esc(u.prenom)}" disabled></div>
        <div class="field"><label>Nom</label><input value="${esc(u.nom)}" disabled></div>
        <div class="field"><label>E-mail</label><input value="${esc(u.email)}" disabled></div>
        <div class="field"><label>Type de compte</label><input value="${type.icon} ${type.label}" disabled></div>
      </div>
      <div class="card" style="margin-top:16px">
        <h3>Stockage</h3>
        <p style="font-size:.85em">${usage.projets} projet(s) · ${fmtBytes(usage.bytes)} utilisés sur ${fmtBytes(usage.quota)}.</p>
        <div style="background:var(--bg);border:1px solid var(--panel-border);border-radius:20px;height:8px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${pct>=100?'var(--danger)':pct>=80?'var(--amber)':'var(--ok)'}"></div>
        </div>
        ${pct>=100?`<p style="font-size:.8em;color:var(--danger);margin-top:8px">Espace plein — supprimez ou exportez certains projets, ou demandez une augmentation ci-dessous.</p>`
          : pct>=80?`<p style="font-size:.8em;color:var(--amber);margin-top:8px">Votre espace de stockage est presque plein.</p>` : ''}
        <form class="composer" id="form-storage-request" style="margin-top:12px">
          <select name="montant" style="flex:1">
            <option value="${1024*1024}">+1 Mo</option>
            <option value="${5*1024*1024}">+5 Mo</option>
            <option value="${20*1024*1024}">+20 Mo</option>
          </select>
          <input name="motif" placeholder="Motif (optionnel)" style="flex:2">
          <button class="btn btn-sm">Demander une augmentation</button>
        </form>
        ${myRequests.length ? `<div style="margin-top:10px">${myRequests.map(r=>`<div class="member-row"><span>${fmtBytes(r.montantOctets)} — ${esc(r.motif||'sans motif')}</span><span class="pill ${r.statut==='acceptee'?'pill-cyan':r.statut==='refusee'?'':''}">${r.statut}</span></div>`).join('')}</div>` : ''}
      </div>
      ${u.accountType !== 'solo' ? `
      <div class="card" style="margin-top:16px">
        <h3>Membres de votre ${u.accountType === 'groupe' ? 'groupe' : 'communauté'}</h3>
        <p style="font-size:.85em">Vous êtes responsable — ajoutez ici les personnes qui travailleront avec vous.</p>
        <div id="members-list">${(members||[]).map(m => `<div class="member-row"><span>${esc(m.nom)}</span><span style="color:var(--text-faint)">${esc(m.email)}</span></div>`).join('') || '<div class="empty">Aucun membre ajouté.</div>'}</div>
        <form class="composer" id="form-add-member" style="margin-top:12px">
          <input name="nom" placeholder="Nom du membre" required style="flex:1">
          <input name="email" type="email" placeholder="E-mail du membre" required style="flex:1">
          <button class="btn btn-primary btn-sm">Ajouter</button>
        </form>
      </div>` : ''}
    </div></div>`;
}
function afterCompteView(){
  document.getElementById('form-add-member')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    await db.addGroupMember({ userId:auth.currentUser.id, nom:f.get('nom'), email:f.get('email') });
    toast('Membre ajouté.'); render();
  });
  document.getElementById('form-storage-request')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    await db.requestStorageIncrease({ userId:auth.currentUser.id, montantOctets:Number(f.get('montant')), motif:f.get('motif') });
    toast("Demande envoyée à l'administrateur."); render();
  });
}

/* ==========================================================================
   ADMIN (§29)
   ========================================================================== */
async function viewAdmin(section){
  const stats = db.adminStats();
  const { data: users } = await db.listUsers();
  const { data: suggestions } = await db.listAllSuggestions();
  const { data: storageRequests } = await db.listAllStorageRequests();
  const sidebar = `<aside class="sidebar"><div class="sb-label">Espace administrateur</div>
    <a href="#/admin/overview" class="sb-link ${section==='overview'?'active':''}">📊 Vue d'ensemble</a>
    <a href="#/admin/users" class="sb-link ${section==='users'?'active':''}">👤 Utilisateurs</a>
    <a href="#/admin/projects" class="sb-link ${section==='projects'?'active':''}">📁 Tous les projets</a>
    <a href="#/admin/storage" class="sb-link ${section==='storage'?'active':''}">💾 Demandes de stockage</a>
    <a href="#/admin/suggestions" class="sb-link ${section==='suggestions'?'active':''}">💡 Suggestions</a></aside>`;

  let content = '';
  if (section === 'overview'){
    content = `<div class="grid grid-3">
      <div class="card stat"><div class="num">${stats.utilisateurs}</div><div class="lbl">Utilisateurs</div></div>
      <div class="card stat"><div class="num">${stats.projets}</div><div class="lbl">Projets</div></div>
      <div class="card stat"><div class="num">${stats.messages}</div><div class="lbl">Messages échangés</div></div>
    </div>`;
  } else if (section === 'users'){
    content = `<div class="card"><table class="data-table"><tr><th>Nom</th><th>E-mail</th><th>Type</th><th>Rôle</th><th>Quota</th><th>Statut</th><th></th></tr>
      ${users.map(u => `<tr data-user-row="${u.id}">
        <td>${esc(u.prenom)} ${esc(u.nom)}</td><td>${esc(u.email)}</td><td>${ACCOUNT_TYPES[u.accountType]?.label||''}</td><td>${u.role}</td>
        <td><input data-quota="${u.id}" type="number" value="${Math.round((u.storageQuota||DEFAULT_STORAGE_QUOTA_BYTES)/1024/1024)}" style="width:60px"> Mo</td>
        <td>${u.suspended ? '<span class="pill" style="color:var(--danger)">suspendu</span>' : '<span class="pill"><span class="pill-dot"></span> actif</span>'}</td>
        <td style="white-space:nowrap">
          ${u.role!=='admin' ? `<button class="btn btn-ghost btn-sm" data-suspend="${u.id}" data-val="${!u.suspended}">${u.suspended?'Réactiver':'Suspendre'}</button>
          <button class="btn btn-ghost btn-sm" data-del-user="${u.id}">Supprimer</button>` : ''}
        </td></tr>`).join('')}
    </table></div>`;
  } else if (section === 'projects'){
    const full = (await Promise.all(users.map(u => db.listProjects({ userId:u.id })))).flatMap(r=>r.data);
    const uniq = [...new Map(full.map(p=>[p.id,p])).values()];
    content = `<div class="card"><table class="data-table"><tr><th>Titre</th><th>Espace</th><th>Propriétaire</th><th>Mis à jour</th><th></th></tr>
      ${uniq.map(p => `<tr><td>${esc(p.titre)}</td><td>${ESPACES[p.espace]?.nom}</td><td>${esc(db.userById(p.ownerId)?.prenom||'')}</td><td>${p.updatedAt}</td>
        <td><button class="btn btn-ghost btn-sm" data-admin-del-project="${p.id}">Supprimer</button></td></tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-faint)">Aucun projet créé pour l\'instant.</td></tr>'}
    </table></div>`;
  } else if (section === 'storage'){
    content = `<div class="card">${storageRequests.map(r => `
      <div class="msg" style="max-width:100%;margin-bottom:10px"><div class="who">${esc(db.userById(r.userId)?.prenom)} · demande ${fmtBytes(r.montantOctets)} · ${r.statut}</div>${esc(r.motif||'(sans motif)')}
      ${r.statut==='en attente' ? `<div style="margin-top:8px;display:flex;gap:8px"><button class="btn btn-sm" data-storage-accept="${r.id}">Accepter</button><button class="btn btn-ghost btn-sm" data-storage-refuse="${r.id}">Refuser</button></div>` : ''}
      </div>`).join('') || '<div class="empty">Aucune demande de stockage.</div>'}</div>`;
  } else if (section === 'suggestions'){
    content = `<div class="card">${suggestions.map(s => `
      <div class="msg" style="max-width:100%;margin-bottom:10px"><div class="who">${esc(db.userById(s.userId)?.prenom)} · ${s.statut}</div>${esc(s.texte)}
      ${s.reponseAdmin ? `<div class="when" style="color:var(--cyan)">Réponse : ${esc(s.reponseAdmin)}</div>` :
        `<form class="composer" data-suggestion="${s.id}" style="margin-top:8px"><input name="reponse" placeholder="Répondre…" required><button class="btn btn-sm">OK</button></form>`}
      </div>`).join('') || '<div class="empty">Aucune suggestion pour l\'instant.</div>'}</div>`;
  }
  return `<div class="app-shell">${sidebar}<div class="main"><div class="main-header"><h2>Administration</h2></div>${content}</div></div>`;
}
function afterAdminView(){
  document.querySelectorAll('[data-suggestion]').forEach(form => form.onsubmit = async (e) => {
    e.preventDefault();
    await db.answerSuggestion({ id:form.dataset.suggestion, reponse:new FormData(e.target).get('reponse') });
    toast('Réponse envoyée.'); render();
  });
  document.querySelectorAll('[data-suspend]').forEach(b => b.onclick = async () => {
    const { error } = await db.setUserSuspended({ userId:b.dataset.suspend, suspended: b.dataset.val==='true' });
    if (error){ toast(error.message); return; }
    toast('Statut mis à jour.'); render();
  });
  document.querySelectorAll('[data-del-user]').forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer définitivement cet utilisateur et ses projets ?')) return;
    const { error } = await db.deleteUser(b.dataset.delUser);
    if (error){ toast(error.message); return; }
    toast('Utilisateur supprimé.'); render();
  });
  document.querySelectorAll('[data-quota]').forEach(inp => inp.addEventListener('change', async () => {
    await db.setUserQuota({ userId: inp.dataset.quota, quotaOctets: Number(inp.value)*1024*1024 });
    toast('Quota mis à jour.');
  }));
  document.querySelectorAll('[data-admin-del-project]').forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer définitivement ce projet ?')) return;
    await db.adminDeleteProject(b.dataset.adminDelProject);
    toast('Projet supprimé.'); render();
  });
  document.querySelectorAll('[data-storage-accept]').forEach(b => b.onclick = async () => { await db.resolveStorageRequest({ id:b.dataset.storageAccept, accepter:true }); toast('Demande acceptée.'); render(); });
  document.querySelectorAll('[data-storage-refuse]').forEach(b => b.onclick = async () => { await db.resolveStorageRequest({ id:b.dataset.storageRefuse, accepter:false }); toast('Demande refusée.'); render(); });
}
