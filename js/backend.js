/* ==========================================================================
   MOCK BACKEND (v3)
   --------------------------------------------------------------------------
   - Un seul compte pré-existant : l'administrateur (pas d'inscription pour lui).
   - Récupération de mot de passe par E-MAIL (plus de SMS/téléphone).
   - Types de compte à l'inscription : solo / groupe / communaute.
   - Suggestions strictement privées entre leur auteur et l'admin.
   - Quotas de stockage par utilisateur + demandes d'augmentation (§27/§28).
   - Suspension/suppression d'utilisateurs et projets par l'admin (§29).
   Toujours pensé pour être remplacé un jour par de vrais appels supabase-js
   (mêmes noms de fonctions, même forme de retour { data, error }).
   ========================================================================== */

// En mode démo locale, le compte admin utilise ADMIN_EMAIL s'il a été renseigné
// (pour rester cohérent avec schema.sql), sinon une adresse de démonstration.
const MOCK_ADMIN_EMAIL = ADMIN_EMAIL.includes('_A_REMPLACER') ? 'root.esmer@labo-interne.local' : ADMIN_EMAIL;

const DB = {
  users: [
    { id:'admin', nom:'Admin', prenom:'', email: MOCK_ADMIN_EMAIL, password:'admin123', motMagique:'phase0',
      role:'admin', avatar:'AD', accountType:'solo', members:[], createdAt:'2026-01-01', suspended:false, storageQuota: DEFAULT_STORAGE_QUOTA_BYTES },
  ],

  projects: [],
  comments: [],
  commonMessages: [
    { id:'m1', userId:'admin', texte:"Bienvenue sur le Labo Électronique Virtuel — créez un compte pour commencer.", createdAt:'2026-08-28 08:00', pinned:true },
  ],
  privateThreads: {},
  suggestions: [],
  passwordResetTokens: {},
  storageRequests: [], // { id, userId, montantOctets, motif, statut:'en attente'|'acceptee'|'refusee', createdAt }
  devis: {},           // projectId -> { lignes:[], remisePct, tauxTaxe, taxeActive }
  plans: {},           // projectId -> projet Atelier Plan (murs/ouvertures/symboles/circuits...), voir js/plan.js
  notifications: [],   // { id, userId, type:'important'|'normal', titre, texte, lien, lu, notified, createdAt }
};

// Persistance locale du mock (localStorage) : évite de tout perdre à chaque rechargement de page.
// Reste un mock — pas un vrai stockage sécurisé côté serveur (voir commentaire au-dessus).
const DB_STORAGE_KEY = 'labo_electronique_virtuel_db_v2';
function persistDB(){ try{ localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(DB)); }catch(e){} }
function loadDB(){
  try{
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    Object.keys(DB).forEach(k => { if (saved[k] !== undefined) DB[k] = saved[k]; });
    if (!DB.users.some(u => u.role === 'admin')){
      DB.users.unshift({ id:'admin', nom:'Admin', prenom:'', email: MOCK_ADMIN_EMAIL, password:'admin123', motMagique:'phase0',
        role:'admin', avatar:'AD', accountType:'solo', members:[], createdAt:'2026-01-01', suspended:false, storageQuota: DEFAULT_STORAGE_QUOTA_BYTES });
    }
    DB.users.forEach(u => { if (u.storageQuota === undefined) u.storageQuota = DEFAULT_STORAGE_QUOTA_BYTES; if (u.suspended === undefined) u.suspended = false; });
    // Compatibilité : les anciennes sauvegardes stockaient collaborateurs comme un tableau d'ids
    // (accès systématiquement en édition). Nouveau format : { userId, permission } — voir §4 des notes.
    DB.projects.forEach(p => {
      if (!Array.isArray(p.collaborateurs)) p.collaborateurs = [];
      p.collaborateurs = p.collaborateurs.map(c => typeof c === 'string' ? { userId:c, permission:'edition' } : c);
      if (!p.statut) p.statut = 'brouillon';
    });
    if (!Array.isArray(DB.notifications)) DB.notifications = [];
    if (!DB.plans || typeof DB.plans !== 'object') DB.plans = {};
  }catch(e){}
}
loadDB();

const LATENCY = 200;
const wait = (ms=LATENCY) => new Promise(r => setTimeout(r, ms));
const uid = (p='id') => p + '_' + Math.random().toString(36).slice(2,9);
function pairKey(a,b){ return [a,b].sort().join('|'); }

// ----------------------------------------------------------------------------
// MODE DÉMO LOCALE (mock) — utilisé tant que SUPABASE_CONFIGURED est faux.
// ----------------------------------------------------------------------------
const mockAuth = {
  currentUser: null,

  async signUp({ nom, prenom, email, password, motMagique, accountType }){
    await wait();
    if (DB.users.some(u => u.email.toLowerCase() === email.toLowerCase())){
      return { data:null, error:{ message:'Un compte existe déjà avec cet e-mail.' } };
    }
    const user = { id:uid('u'), nom, prenom, email, password, motMagique,
      role:'membre', avatar:(prenom[0]+nom[0]).toUpperCase(), accountType: accountType || 'solo',
      members:[], createdAt:new Date().toISOString().slice(0,10), suspended:false, storageQuota: DEFAULT_STORAGE_QUOTA_BYTES };
    DB.users.push(user);
    this.currentUser = user;
    persistDB();
    return { data:{ user }, error:null };
  },

  async signInWithPassword({ email, password }){
    await wait();
    const user = DB.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user || user.password !== password){
      return { data:null, error:{ message:'E-mail ou mot de passe incorrect.' } };
    }
    if (user.suspended){
      return { data:null, error:{ message:'Ce compte a été suspendu par un administrateur.' } };
    }
    this.currentUser = user;
    return { data:{ user }, error:null };
  },

  async signOut(){ await wait(80); this.currentUser = null; return { error:null }; },

  async verifyMotMagique({ email, motMagique }){
    await wait();
    const user = DB.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return { data:null, error:{ message:'Aucun compte pour cet e-mail.' } };
    if (user.motMagique.trim().toLowerCase() !== motMagique.trim().toLowerCase()){
      return { data:null, error:{ message:'Mot magique incorrect.' } };
    }
    const tempPassword = Math.random().toString(36).slice(2,8).toUpperCase();
    DB.passwordResetTokens[user.email] = { tempPassword, expiresAt: Date.now() + 15*60*1000 };
    persistDB();
    return { data:{ tempPassword, emailMasque: maskEmail(user.email) }, error:null };
  },

  async signInWithTempPassword({ email, tempPassword }){
    await wait();
    const token = DB.passwordResetTokens[email];
    const user = DB.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!token || !user || token.tempPassword !== tempPassword || Date.now() > token.expiresAt){
      return { data:null, error:{ message:'Mot de passe temporaire invalide ou expiré.' } };
    }
    user.password = tempPassword;
    user.mustChangePassword = true;
    this.currentUser = user;
    persistDB();
    return { data:{ user }, error:null };
  },

  async updatePassword({ newPassword }){
    await wait();
    if (!this.currentUser) return { data:null, error:{ message:'Non connecté.' } };
    this.currentUser.password = newPassword;
    this.currentUser.mustChangePassword = false;
    persistDB();
    return { data:{ ok:true }, error:null };
  },
};

function maskEmail(email){
  const [name, domain] = email.split('@');
  const visible = name.slice(0,2);
  return `${visible}${'•'.repeat(Math.max(name.length-2,2))}@${domain}`;
}

const mockDb = {
  async listProjects({ userId, espace }={}){
    await wait();
    let rows = DB.projects.filter(p => p.ownerId === userId || p.collaborateurs.some(c=>c.userId===userId));
    if (espace) rows = rows.filter(p => p.espace === espace);
    return { data: rows, error:null };
  },

  async listSharedProjects(userId){
    await wait();
    return { data: DB.projects.filter(p => p.ownerId !== userId && p.collaborateurs.some(c=>c.userId===userId))
      .map(p => ({ ...p, monAcces: p.collaborateurs.find(c=>c.userId===userId)?.permission || 'lecture' })), error:null };
  },

  async createProject({ ownerId, titre, espace }){
    await wait();
    const p = { id:uid('p'), ownerId, titre, espace, updatedAt:new Date().toISOString().slice(0,10), collaborateurs:[], erreurs:0, statut:'brouillon', schema:{ items:[], wires:[] } };
    DB.projects.unshift(p);
    persistDB();
    return { data:p, error:null };
  },

  async getProject(id){ await wait(100); return { data: DB.projects.find(p => p.id === id) || null, error:null }; },

  async saveSchema(id, schema){
    await wait(80);
    const p = DB.projects.find(p => p.id === id);
    if (p){ p.schema = schema; p.updatedAt = new Date().toISOString().slice(0,10); if (p.statut === 'brouillon' || p.statut === 'exporte') p.statut = 'en_cours'; persistDB(); }
    return { error:null };
  },

  async setProjectStatut(id, statut){
    await wait(80);
    const p = DB.projects.find(p => p.id === id);
    if (!p) return { error:{ message:'Projet introuvable.' } };
    p.statut = statut;
    persistDB();
    return { data:p, error:null };
  },

  // Partage (§3 des notes en cours) : userId + permission ('lecture'|'edition') au lieu d'un simple id.
  async addCollaborator({ projectId, userId, permission }){
    await wait();
    const p = DB.projects.find(p => p.id === projectId);
    const u = DB.users.find(u => u.id === userId);
    if (!p) return { error:{ message:'Projet introuvable.' } };
    if (!u) return { error:{ message:'Utilisateur introuvable.' } };
    if (userId === p.ownerId) return { error:{ message:'Cette personne est déjà propriétaire du projet.' } };
    const existing = p.collaborateurs.find(c=>c.userId===userId);
    const isNew = !existing;
    if (existing) existing.permission = permission; else p.collaborateurs.push({ userId, permission });
    persistDB();
    const owner = DB.users.find(u=>u.id===p.ownerId);
    this.createNotification({
      userId, type:'important',
      titre: isNew ? 'Accès à un projet partagé' : 'Permission modifiée',
      texte: `${owner?.prenom||''} ${owner?.nom||''} vous a ${isNew?'donné accès':'accordé l\'accès'} « ${permission==='edition'?'voir et modifier':'voir seulement'} » sur le projet « ${p.titre} ».`,
      lien: `project/${p.id}`,
    });
    return { data:p, error:null };
  },
  async removeCollaborator({ projectId, userId }){
    await wait();
    const p = DB.projects.find(p => p.id === projectId);
    if (!p) return { error:{ message:'Projet introuvable.' } };
    p.collaborateurs = p.collaborateurs.filter(c=>c.userId!==userId);
    persistDB();
    return { data:p, error:null };
  },
  async listCollaborators(projectId){
    await wait(80);
    const p = DB.projects.find(p => p.id === projectId);
    return { data: (p && p.collaborateurs) || [], error:null };
  },
  async searchUsers(query){
    await wait(150);
    const q = (query||'').trim().toLowerCase();
    if (q.length < 2) return { data:[], error:null };
    return { data: DB.users.filter(u => `${u.prenom} ${u.nom}`.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)).slice(0,10), error:null };
  },

  async deleteProject(id){ await wait(); DB.projects = DB.projects.filter(p => p.id !== id); persistDB(); return { error:null }; },

  async duplicateProject(id){
    await wait();
    const p = DB.projects.find(p => p.id === id);
    if (!p) return { data:null, error:{ message:'Projet introuvable.' } };
    const copy = { ...p, id:uid('p'), titre: p.titre + ' (copie)', collaborateurs:[], statut:'brouillon', updatedAt:new Date().toISOString().slice(0,10), schema: JSON.parse(JSON.stringify(p.schema||{items:[],wires:[]})) };
    DB.projects.unshift(copy);
    persistDB();
    return { data:copy, error:null };
  },

  async listComments(projectId){ await wait(120); return { data: DB.comments.filter(c => c.projectId === projectId), error:null }; },

  async addComment({ projectId, userId, texte }){
    await wait(120);
    const c = { id:uid('c'), projectId, userId, texte, createdAt:new Date().toISOString().slice(0,16).replace('T',' ') };
    DB.comments.push(c);
    persistDB();
    return { data:c, error:null };
  },

  async listCommonMessages(){ await wait(120); return { data:[...DB.commonMessages].sort((a,b)=> (b.pinned - a.pinned)), error:null }; },

  async addCommonMessage({ userId, texte }){
    await wait(120);
    const m = { id:uid('m'), userId, texte, createdAt:new Date().toISOString().slice(0,16).replace('T',' '), pinned:false };
    DB.commonMessages.push(m);
    persistDB();
    return { data:m, error:null };
  },

  async listPrivateThread(a,b){ await wait(120); return { data: DB.privateThreads[pairKey(a,b)] || [], error:null }; },

  async sendPrivateMessage({ from, to, texte }){
    await wait(120);
    const key = pairKey(from,to);
    if (!DB.privateThreads[key]) DB.privateThreads[key] = [];
    const m = { from, texte, createdAt:new Date().toISOString().slice(0,16).replace('T',' ') };
    DB.privateThreads[key].push(m);
    persistDB();
    return { data:m, error:null };
  },

  async listUsers(){ await wait(120); return { data: DB.users, error:null }; },

  // Suggestions : strictement privées entre l'auteur et l'admin.
  async listMySuggestions(userId){
    await wait(120);
    return { data: DB.suggestions.filter(s => s.userId === userId), error:null };
  },
  async listAllSuggestions(){ await wait(120); return { data: DB.suggestions, error:null }; },

  async addSuggestion({ userId, texte }){
    await wait(120);
    const s = { id:uid('s'), userId, texte, statut:'en attente', reponseAdmin:null, createdAt:new Date().toISOString().slice(0,10) };
    DB.suggestions.push(s);
    persistDB();
    return { data:s, error:null };
  },

  async answerSuggestion({ id, reponse }){
    await wait(120);
    const s = DB.suggestions.find(s => s.id === id);
    if (s){
      s.reponseAdmin = reponse; s.statut = 'traitée'; persistDB();
      this.createNotification({ userId:s.userId, type:'normal', titre:'Réponse à votre suggestion', texte:reponse, lien:'discussion' });
    }
    return { data:s, error:null };
  },

  // Membres de groupe (§3 des notes en cours) : recherchés parmi les utilisateurs déjà inscrits,
  // pas saisis librement — nom/e-mail restent stockés pour l'affichage mais dérivent du profil réel.
  async addGroupMember({ userId, memberUserId }){
    await wait(120);
    const owner = DB.users.find(u => u.id === userId);
    const member = DB.users.find(u => u.id === memberUserId);
    if (!owner) return { error:{ message:'Utilisateur introuvable.' } };
    if (!member) return { error:{ message:'Utilisateur à ajouter introuvable.' } };
    if (memberUserId === userId) return { error:{ message:'Vous ne pouvez pas vous ajouter vous-même.' } };
    if (owner.members.some(m=>m.memberUserId===memberUserId)) return { error:{ message:'Déjà membre de votre groupe.' } };
    owner.members.push({ id:uid('mb'), memberUserId, nom:`${member.prenom} ${member.nom}`.trim(), email:member.email });
    persistDB();
    this.createNotification({ userId:memberUserId, type:'normal', titre:'Ajout à un groupe de travail', texte:`${owner.prenom} ${owner.nom} vous a ajouté à son groupe de travail.` });
    return { data:owner.members, error:null };
  },
  async removeGroupMember({ userId, memberId }){
    await wait(120);
    const owner = DB.users.find(u => u.id === userId);
    if (!owner) return { error:{ message:'Utilisateur introuvable.' } };
    owner.members = (owner.members||[]).filter(m=>m.id!==memberId);
    persistDB();
    return { data:owner.members, error:null };
  },

  async listGroupMembers(userId){
    await wait(120);
    const u = DB.users.find(u => u.id === userId);
    return { data: (u && u.members) || [], error:null };
  },

  // Notifications (§4 des notes en cours) : "importantes" déclenchent en plus une apparition
  // temporaire côté client (voir app.js) — ce module ne gère que le stockage/historique.
  async createNotification({ userId, type, titre, texte, lien }){
    const n = { id:uid('n'), userId, type: type||'normal', titre, texte, lien: lien||null, lu:false, notified:false, createdAt:new Date().toISOString() };
    DB.notifications.push(n);
    persistDB();
    return n;
  },
  async listNotifications(userId){
    await wait(80);
    return { data: DB.notifications.filter(n=>n.userId===userId).slice().sort((a,b)=> b.createdAt.localeCompare(a.createdAt)), error:null };
  },
  async markNotificationRead(id){
    const n = DB.notifications.find(n=>n.id===id);
    if (n){ n.lu = true; persistDB(); }
    return { error:null };
  },
  async markNotificationNotified(id){
    const n = DB.notifications.find(n=>n.id===id);
    if (n){ n.notified = true; persistDB(); }
    return { error:null };
  },
  async markAllNotificationsRead(userId){
    DB.notifications.forEach(n => { if (n.userId===userId) n.lu = true; });
    persistDB();
    return { error:null };
  },

  async adminStats(){
    return {
      utilisateurs: DB.users.length,
      projets: DB.projects.length,
      messages: DB.commonMessages.length + Object.values(DB.privateThreads).reduce((n,t)=>n+t.length,0),
    };
  },

  // Espace de stockage estimé (mock : taille JSON des projets de l'utilisateur) + quota individuel (§27).
  async storageUsage(userId){
    const mine = DB.projects.filter(p => p.ownerId === userId);
    const bytes = mine.reduce((n,p) => n + JSON.stringify(p.schema||{}).length, 0);
    const u = DB.users.find(u=>u.id===userId);
    return { data: { projets: mine.length, bytes, quota: (u && u.storageQuota) || DEFAULT_STORAGE_QUOTA_BYTES }, error:null };
  },

  // Demandes d'augmentation de quota (§28)
  async requestStorageIncrease({ userId, montantOctets, motif }){
    await wait(120);
    const r = { id:uid('sr'), userId, montantOctets, motif, statut:'en attente', createdAt:new Date().toISOString().slice(0,10) };
    DB.storageRequests.push(r);
    persistDB();
    return { data:r, error:null };
  },
  async listMyStorageRequests(userId){ await wait(120); return { data: DB.storageRequests.filter(r=>r.userId===userId), error:null }; },
  async listAllStorageRequests(){ await wait(120); return { data: DB.storageRequests, error:null }; },
  async resolveStorageRequest({ id, accepter }){
    await wait(120);
    const r = DB.storageRequests.find(r=>r.id===id);
    if (!r) return { error:{ message:'Demande introuvable.' } };
    r.statut = accepter ? 'acceptee' : 'refusee';
    if (accepter){
      const u = DB.users.find(u=>u.id===r.userId);
      if (u) u.storageQuota = (u.storageQuota||DEFAULT_STORAGE_QUOTA_BYTES) + r.montantOctets;
    }
    persistDB();
    this.createNotification({
      userId:r.userId, type:'important',
      titre: accepter ? 'Demande de stockage acceptée' : 'Demande de stockage refusée',
      texte: accepter ? `Votre demande de +${fmtBytes(r.montantOctets)} a été acceptée.` : "Votre demande d'augmentation de stockage a été refusée.",
      lien:'compte',
    });
    return { data:r, error:null };
  },
  async setUserQuota({ userId, quotaOctets }){
    await wait(120);
    const u = DB.users.find(u=>u.id===userId);
    if (!u) return { error:{ message:'Utilisateur introuvable.' } };
    u.storageQuota = quotaOctets;
    persistDB();
    return { data:u, error:null };
  },

  // Administration : suspension/suppression (§29)
  async setUserSuspended({ userId, suspended }){
    await wait(120);
    const u = DB.users.find(u=>u.id===userId);
    if (!u) return { error:{ message:'Utilisateur introuvable.' } };
    if (u.role === 'admin') return { error:{ message:"Impossible de suspendre le compte administrateur." } };
    u.suspended = suspended;
    persistDB();
    return { data:u, error:null };
  },
  async deleteUser(userId){
    await wait(120);
    const u = DB.users.find(u=>u.id===userId);
    if (u && u.role === 'admin') return { error:{ message:"Impossible de supprimer le compte administrateur." } };
    DB.users = DB.users.filter(u=>u.id!==userId);
    DB.projects = DB.projects.filter(p=>p.ownerId!==userId);
    persistDB();
    return { error:null };
  },
  async adminDeleteProject(projectId){ return this.deleteProject(projectId); },

  // Devis (§22/§23) : stocké par projet, indépendamment du schéma technique.
  async getDevis(projectId){
    await wait(80);
    return { data: DB.devis[projectId] || { lignes:[], remisePct:0, tauxTaxe:20, taxeActive:false }, error:null };
  },
  async saveDevis(projectId, devis){
    await wait(80);
    DB.devis[projectId] = devis;
    persistDB();
    return { error:null };
  },

  // Plan de bâtiment/électricité (§11-19 des mises à jour reçues) : stocké par projet, indépendant
  // du schéma et du devis, sur le même principe que ci-dessus. `null` = aucun plan encore créé (le
  // module js/plan.js démarre alors sur un plan vide plutôt que d'échouer).
  async getPlan(projectId){
    await wait(80);
    return { data: DB.plans[projectId] || null, error:null };
  },
  async savePlan(projectId, plan){
    await wait(80);
    DB.plans[projectId] = plan;
    persistDB();
    return { error:null };
  },

  userById(id){ return DB.users.find(u => u.id === id); },
};

// ----------------------------------------------------------------------------
// MODE SUPABASE RÉEL — actif uniquement si SUPABASE_CONFIGURED est vrai.
// IMPORTANT (honnêteté de test) : ce bloc n'a PAS pu être testé contre un
// projet Supabase réel (aucun projet fourni au moment du développement — voir
// le rapport final). Écrit et relu avec soin pour respecter l'API officielle
// de @supabase/supabase-js v2 et le schéma défini dans supabase/schema.sql,
// mais à vérifier vous-même après connexion d'un vrai projet.
// ----------------------------------------------------------------------------

function profileRowToUser(row){
  if (!row) return null;
  return {
    id: row.id, nom: row.nom, prenom: row.prenom, email: row.email,
    role: row.role, accountType: row.account_type, avatar: row.avatar,
    motMagique: row.mot_magique, createdAt: (row.created_at || '').slice(0,10),
    mustChangePassword: false, suspended: !!row.suspended, storageQuota: row.storage_quota || DEFAULT_STORAGE_QUOTA_BYTES,
  };
}
function projectRowToProject(row){
  return {
    id: row.id, ownerId: row.owner_id, titre: row.titre, espace: row.espace,
    schema: row.schema || { items:[], wires:[] }, erreurs: row.erreurs || 0,
    statut: row.statut || 'brouillon',
    updatedAt: (row.updated_at || '').slice(0,10),
    collaborateurs: (row.project_collaborators || []).map(c => ({ userId: c.user_id, permission: c.permission || 'edition' })),
  };
}

// Annuaire local des profils (nom/prénom/avatar de tous les utilisateurs) : évite de
// refaire une requête réseau à chaque fois que l'UI a besoin d'afficher un nom
// (db.userById est utilisé de façon SYNCHRONE un peu partout dans le rendu).
let __profilesCache = [];
async function refreshProfilesCache(){
  const { data, error } = await supabaseClient.from('profiles').select('*');
  if (!error) __profilesCache = (data || []).map(profileRowToUser);
  return __profilesCache;
}
async function fetchProfile(userId){
  const { data } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
  return profileRowToUser(data);
}

const supabaseAuth = {
  currentUser: null,

  async signUp({ nom, prenom, email, password, motMagique, accountType }){
    const { data, error } = await supabaseClient.auth.signUp({
      email, password,
      options: { data: { nom, prenom, motMagique, accountType: accountType || 'solo' } },
    });
    if (error) return { data:null, error:{ message: error.message } };
    if (!data.user) return { data:null, error:{ message:"Vérifiez votre boîte mail pour confirmer votre compte, puis connectez-vous." } };
    const profile = await fetchProfile(data.user.id);
    this.currentUser = profile;
    await refreshProfilesCache();
    return { data:{ user: profile }, error:null };
  },

  async signInWithPassword({ email, password }){
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return { data:null, error:{ message:'E-mail ou mot de passe incorrect.' } };
    const profile = await fetchProfile(data.user.id);
    if (profile && profile.suspended){ await supabaseClient.auth.signOut(); return { data:null, error:{ message:'Ce compte a été suspendu par un administrateur.' } }; }
    this.currentUser = profile;
    await refreshProfilesCache();
    return { data:{ user: profile }, error:null };
  },

  async signOut(){
    await supabaseClient.auth.signOut();
    this.currentUser = null;
    return { error:null };
  },

  // Remplace verifyMotMagique/signInWithTempPassword du mode démo : vraie
  // récupération par e-mail via Supabase Auth (lien de réinitialisation).
  async sendPasswordReset({ email }){
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname + '#/change-password',
    });
    if (error) return { error:{ message: error.message } };
    return { error:null };
  },

  async updatePassword({ newPassword }){
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) return { data:null, error:{ message: error.message } };
    return { data:{ ok:true }, error:null };
  },
};

const supabaseDb = {
  async listProjects({ userId, espace }={}){
    let q = supabaseClient.from('projects').select('*, project_collaborators(user_id,permission)');
    if (espace) q = q.eq('espace', espace);
    const { data, error } = await q;
    if (error) return { data:[], error:{ message:error.message } };
    const rows = (data||[]).map(projectRowToProject).filter(p => p.ownerId===userId || p.collaborateurs.some(c=>c.userId===userId));
    return { data: rows, error:null };
  },

  async listSharedProjects(userId){
    const { data, error } = await supabaseClient.from('projects').select('*, project_collaborators(user_id,permission)');
    if (error) return { data:[], error:{ message:error.message } };
    const rows = (data||[]).map(projectRowToProject).filter(p => p.ownerId!==userId && p.collaborateurs.some(c=>c.userId===userId))
      .map(p => ({ ...p, monAcces: p.collaborateurs.find(c=>c.userId===userId)?.permission || 'lecture' }));
    return { data: rows, error:null };
  },

  async createProject({ ownerId, titre, espace }){
    const { data, error } = await supabaseClient.from('projects')
      .insert({ owner_id: ownerId, titre, espace, schema:{ items:[], wires:[] } })
      .select('*, project_collaborators(user_id,permission)').single();
    if (error) return { data:null, error:{ message:error.message } };
    return { data: projectRowToProject(data), error:null };
  },

  async getProject(id){
    const { data, error } = await supabaseClient.from('projects').select('*, project_collaborators(user_id,permission)').eq('id', id).single();
    if (error) return { data:null, error:null }; // introuvable ou non autorisé (RLS) → traité comme "absent" par l'UI
    return { data: projectRowToProject(data), error:null };
  },

  async saveSchema(id, schema){
    const { data: cur } = await supabaseClient.from('projects').select('statut').eq('id', id).single();
    const nextStatut = (!cur || cur.statut === 'brouillon' || cur.statut === 'exporte') ? 'en_cours' : (cur.statut || 'en_cours');
    const { error } = await supabaseClient.from('projects').update({ schema, statut: nextStatut, updated_at:new Date().toISOString() }).eq('id', id);
    return { error: error ? { message:error.message } : null };
  },
  async setProjectStatut(id, statut){
    const { error } = await supabaseClient.from('projects').update({ statut }).eq('id', id);
    return { error: error ? { message:error.message } : null };
  },

  // Partage (§3 des notes en cours) : userId + permission ('lecture'|'edition') au lieu d'un e-mail seul.
  async addCollaborator({ projectId, userId, permission }){
    const { data: existing } = await supabaseClient.from('project_collaborators').select('user_id').eq('project_id', projectId).eq('user_id', userId).single();
    let error;
    if (existing){
      ({ error } = await supabaseClient.from('project_collaborators').update({ permission }).eq('project_id', projectId).eq('user_id', userId));
    } else {
      ({ error } = await supabaseClient.from('project_collaborators').insert({ project_id: projectId, user_id: userId, permission }));
    }
    if (error) return { error:{ message:error.message } };
    const { data: project } = await supabaseClient.from('projects').select('titre').eq('id', projectId).single();
    const owner = this.userById ? this.userById(auth.currentUser?.id) : null;
    this.createNotification({
      userId, type:'important',
      titre: existing ? 'Permission modifiée' : 'Accès à un projet partagé',
      texte: `${owner?.prenom||''} ${owner?.nom||''} vous a ${existing?'accordé l\'accès':'donné accès'} « ${permission==='edition'?'voir et modifier':'voir seulement'} » sur le projet « ${project?.titre||''} ».`.trim(),
      lien: `project/${projectId}`,
    });
    return { data:true, error:null };
  },
  async removeCollaborator({ projectId, userId }){
    const { error } = await supabaseClient.from('project_collaborators').delete().eq('project_id', projectId).eq('user_id', userId);
    return { error: error ? { message:error.message } : null };
  },
  async listCollaborators(projectId){
    const { data, error } = await supabaseClient.from('project_collaborators').select('user_id,permission').eq('project_id', projectId);
    if (error) return { data:[], error:{ message:error.message } };
    return { data:(data||[]).map(r=>({ userId:r.user_id, permission:r.permission })), error:null };
  },
  async searchUsers(query){
    const q = (query||'').trim().replace(/[,()%]/g,'');
    if (q.length < 2) return { data:[], error:null };
    const { data, error } = await supabaseClient.from('profiles').select('*').or(`nom.ilike.%${q}%,prenom.ilike.%${q}%,email.ilike.%${q}%`).limit(10);
    if (error) return { data:[], error:{ message:error.message } };
    return { data:(data||[]).map(profileRowToUser), error:null };
  },

  async deleteProject(id){
    const { error } = await supabaseClient.from('projects').delete().eq('id', id);
    return { error: error ? { message:error.message } : null };
  },

  async duplicateProject(id){
    const { data: p } = await this.getProject(id);
    if (!p) return { data:null, error:{ message:'Projet introuvable.' } };
    return this.createProjectFull({ ownerId:p.ownerId, titre:p.titre+' (copie)', espace:p.espace, schema:p.schema });
  },
  async createProjectFull({ ownerId, titre, espace, schema }){
    const { data, error } = await supabaseClient.from('projects').insert({ owner_id:ownerId, titre, espace, schema }).select('*, project_collaborators(user_id,permission)').single();
    if (error) return { data:null, error:{ message:error.message } };
    return { data: projectRowToProject(data), error:null };
  },

  async listComments(projectId){
    const { data, error } = await supabaseClient.from('comments').select('*').eq('project_id', projectId).order('created_at');
    if (error) return { data:[], error:{ message:error.message } };
    return { data: (data||[]).map(c => ({ id:c.id, projectId:c.project_id, userId:c.user_id, texte:c.texte, createdAt:(c.created_at||'').slice(0,16).replace('T',' ') })), error:null };
  },

  async addComment({ projectId, userId, texte }){
    const { data, error } = await supabaseClient.from('comments').insert({ project_id:projectId, user_id:userId, texte }).select().single();
    if (error) return { data:null, error:{ message:error.message } };
    return { data: { id:data.id, projectId, userId, texte, createdAt:(data.created_at||'').slice(0,16).replace('T',' ') }, error:null };
  },

  async listCommonMessages(){
    const { data, error } = await supabaseClient.from('common_messages').select('*').order('pinned',{ascending:false}).order('created_at');
    if (error) return { data:[], error:{ message:error.message } };
    return { data:(data||[]).map(m=>({ id:m.id, userId:m.user_id, texte:m.texte, pinned:m.pinned, createdAt:(m.created_at||'').slice(0,16).replace('T',' ') })), error:null };
  },

  async addCommonMessage({ userId, texte }){
    const { data, error } = await supabaseClient.from('common_messages').insert({ user_id:userId, texte }).select().single();
    if (error) return { data:null, error:{ message:error.message } };
    return { data:{ id:data.id, userId, texte, pinned:false, createdAt:(data.created_at||'').slice(0,16).replace('T',' ') }, error:null };
  },

  async listPrivateThread(a,b){
    const { data, error } = await supabaseClient.from('private_messages').select('*')
      .or(`and(from_user.eq.${a},to_user.eq.${b}),and(from_user.eq.${b},to_user.eq.${a})`)
      .order('created_at');
    if (error) return { data:[], error:{ message:error.message } };
    return { data:(data||[]).map(m=>({ from:m.from_user, texte:m.texte, createdAt:(m.created_at||'').slice(0,16).replace('T',' ') })), error:null };
  },

  async sendPrivateMessage({ from, to, texte }){
    const { data, error } = await supabaseClient.from('private_messages').insert({ from_user:from, to_user:to, texte }).select().single();
    if (error) return { data:null, error:{ message:error.message } };
    return { data:{ from, texte, createdAt:(data.created_at||'').slice(0,16).replace('T',' ') }, error:null };
  },

  async listUsers(){
    const rows = await refreshProfilesCache();
    return { data: rows, error:null };
  },

  async listMySuggestions(userId){
    const { data, error } = await supabaseClient.from('suggestions').select('*').eq('user_id', userId).order('created_at',{ascending:false});
    if (error) return { data:[], error:{ message:error.message } };
    return { data:(data||[]).map(suggestionRowToSuggestion), error:null };
  },
  async listAllSuggestions(){
    const { data, error } = await supabaseClient.from('suggestions').select('*').order('created_at',{ascending:false});
    if (error) return { data:[], error:{ message:error.message } };
    return { data:(data||[]).map(suggestionRowToSuggestion), error:null };
  },

  async addSuggestion({ userId, texte }){
    const { data, error } = await supabaseClient.from('suggestions').insert({ user_id:userId, texte }).select().single();
    if (error) return { data:null, error:{ message:error.message } };
    return { data: suggestionRowToSuggestion(data), error:null };
  },

  async answerSuggestion({ id, reponse }){
    const { data, error } = await supabaseClient.from('suggestions').update({ reponse_admin:reponse, statut:'traitée' }).eq('id', id).select().single();
    if (error) return { data:null, error:{ message:error.message } };
    this.createNotification({ userId:data.user_id, type:'normal', titre:'Réponse à votre suggestion', texte:reponse, lien:'discussion' });
    return { data: suggestionRowToSuggestion(data), error:null };
  },

  // Membres de groupe (§3 des notes en cours) : recherchés parmi les utilisateurs déjà inscrits (member_id),
  // nom/email restent recopiés pour l'affichage sans requête supplémentaire.
  async addGroupMember({ userId, memberUserId }){
    const { data: member } = await supabaseClient.from('profiles').select('*').eq('id', memberUserId).single();
    if (!member) return { error:{ message:'Utilisateur à ajouter introuvable.' } };
    const { data, error } = await supabaseClient.from('group_members')
      .insert({ owner_id:userId, member_id:memberUserId, nom:`${member.prenom} ${member.nom}`.trim(), email:member.email }).select();
    if (error) return { error:{ message: error.code === '23505' ? 'Déjà membre de votre groupe.' : error.message } };
    this.createNotification({ userId:memberUserId, type:'normal', titre:'Ajout à un groupe de travail', texte:`Vous avez été ajouté à un groupe de travail.` });
    return { data, error:null };
  },
  async removeGroupMember({ memberId }){
    const { error } = await supabaseClient.from('group_members').delete().eq('id', memberId);
    return { error: error ? { message:error.message } : null };
  },
  async listGroupMembers(userId){
    const { data, error } = await supabaseClient.from('group_members').select('*').eq('owner_id', userId);
    if (error) return { data:[], error:{ message:error.message } };
    return { data:(data||[]).map(m=>({ id:m.id, memberUserId:m.member_id, nom:m.nom, email:m.email })), error:null };
  },

  // Notifications (§4 des notes en cours).
  async createNotification({ userId, type, titre, texte, lien }){
    const { data, error } = await supabaseClient.from('notifications')
      .insert({ user_id:userId, type: type||'normal', titre, texte, lien: lien||null }).select().single();
    if (error) return null;
    return data;
  },
  async listNotifications(userId){
    const { data, error } = await supabaseClient.from('notifications').select('*').eq('user_id', userId).order('created_at',{ascending:false});
    if (error) return { data:[], error:{ message:error.message } };
    return { data:(data||[]).map(n=>({ id:n.id, userId:n.user_id, type:n.type, titre:n.titre, texte:n.texte, lien:n.lien, lu:n.lu, notified:n.notified, createdAt:n.created_at })), error:null };
  },
  async markNotificationRead(id){
    const { error } = await supabaseClient.from('notifications').update({ lu:true }).eq('id', id);
    return { error: error ? { message:error.message } : null };
  },
  async markNotificationNotified(id){
    const { error } = await supabaseClient.from('notifications').update({ notified:true }).eq('id', id);
    return { error: error ? { message:error.message } : null };
  },
  async markAllNotificationsRead(userId){
    const { error } = await supabaseClient.from('notifications').update({ lu:true }).eq('user_id', userId);
    return { error: error ? { message:error.message } : null };
  },

  async adminStats(){
    const [{ count: utilisateurs }, { count: projets }, { count: cm }, { count: pm }] = await Promise.all([
      supabaseClient.from('profiles').select('*', { count:'exact', head:true }),
      supabaseClient.from('projects').select('*', { count:'exact', head:true }),
      supabaseClient.from('common_messages').select('*', { count:'exact', head:true }),
      supabaseClient.from('private_messages').select('*', { count:'exact', head:true }),
    ]);
    return { utilisateurs: utilisateurs||0, projets: projets||0, messages:(cm||0)+(pm||0) };
  },

  async storageUsage(userId){
    const { data } = await supabaseClient.from('projects').select('schema').eq('owner_id', userId);
    const { data: profile } = await supabaseClient.from('profiles').select('storage_quota').eq('id', userId).single();
    const bytes = (data||[]).reduce((n,p)=>n+JSON.stringify(p.schema||{}).length, 0);
    return { data:{ projets:(data||[]).length, bytes, quota: (profile && profile.storage_quota) || DEFAULT_STORAGE_QUOTA_BYTES }, error:null };
  },

  async requestStorageIncrease({ userId, montantOctets, motif }){
    const { data, error } = await supabaseClient.from('storage_requests').insert({ user_id:userId, montant_octets:montantOctets, motif }).select().single();
    if (error) return { data:null, error:{ message:error.message } };
    return { data: storageRequestRow(data), error:null };
  },
  async listMyStorageRequests(userId){
    const { data, error } = await supabaseClient.from('storage_requests').select('*').eq('user_id', userId).order('created_at',{ascending:false});
    if (error) return { data:[], error:{ message:error.message } };
    return { data:(data||[]).map(storageRequestRow), error:null };
  },
  async listAllStorageRequests(){
    const { data, error } = await supabaseClient.from('storage_requests').select('*').order('created_at',{ascending:false});
    if (error) return { data:[], error:{ message:error.message } };
    return { data:(data||[]).map(storageRequestRow), error:null };
  },
  async resolveStorageRequest({ id, accepter }){
    const { data: reqRow, error: e1 } = await supabaseClient.from('storage_requests').update({ statut: accepter?'acceptee':'refusee' }).eq('id', id).select().single();
    if (e1) return { error:{ message:e1.message } };
    if (accepter){
      const { data: profile } = await supabaseClient.from('profiles').select('storage_quota').eq('id', reqRow.user_id).single();
      const newQuota = (profile?.storage_quota || DEFAULT_STORAGE_QUOTA_BYTES) + reqRow.montant_octets;
      await supabaseClient.from('profiles').update({ storage_quota:newQuota }).eq('id', reqRow.user_id);
    }
    this.createNotification({
      userId: reqRow.user_id, type:'important',
      titre: accepter ? 'Demande de stockage acceptée' : 'Demande de stockage refusée',
      texte: accepter ? `Votre demande de +${fmtBytes(reqRow.montant_octets)} a été acceptée.` : "Votre demande d'augmentation de stockage a été refusée.",
      lien:'compte',
    });
    return { data: storageRequestRow(reqRow), error:null };
  },
  async setUserQuota({ userId, quotaOctets }){
    const { error } = await supabaseClient.from('profiles').update({ storage_quota:quotaOctets }).eq('id', userId);
    return { error: error ? { message:error.message } : null };
  },

  async setUserSuspended({ userId, suspended }){
    const { error } = await supabaseClient.from('profiles').update({ suspended }).eq('id', userId);
    return { error: error ? { message:error.message } : null };
  },
  async deleteUser(userId){
    // Nécessite une fonction serveur avec les droits admin (service_role) pour supprimer réellement auth.users ;
    // depuis le client, on ne peut retirer que le profil (RLS) — la suppription complète est documentée
    // dans le rapport final comme nécessitant une fonction Edge dédiée si besoin.
    const { error } = await supabaseClient.from('profiles').delete().eq('id', userId);
    return { error: error ? { message:error.message } : null };
  },
  async adminDeleteProject(projectId){ return this.deleteProject(projectId); },

  async getDevis(projectId){
    const { data, error } = await supabaseClient.from('projects').select('devis').eq('id', projectId).single();
    if (error) return { data:{ lignes:[], remisePct:0, tauxTaxe:20, taxeActive:false }, error:null };
    return { data: data.devis || { lignes:[], remisePct:0, tauxTaxe:20, taxeActive:false }, error:null };
  },
  async saveDevis(projectId, devis){
    const { error } = await supabaseClient.from('projects').update({ devis }).eq('id', projectId);
    return { error: error ? { message:error.message } : null };
  },

  async getPlan(projectId){
    const { data, error } = await supabaseClient.from('projects').select('plan').eq('id', projectId).single();
    if (error) return { data:null, error:null };
    return { data: data.plan || null, error:null };
  },
  async savePlan(projectId, plan){
    const { error } = await supabaseClient.from('projects').update({ plan }).eq('id', projectId);
    return { error: error ? { message:error.message } : null };
  },

  userById(id){ return __profilesCache.find(u => u.id === id); },
};
function suggestionRowToSuggestion(s){
  return { id:s.id, userId:s.user_id, texte:s.texte, statut:s.statut, reponseAdmin:s.reponse_admin, createdAt:(s.created_at||'').slice(0,10) };
}
function storageRequestRow(r){
  return { id:r.id, userId:r.user_id, montantOctets:r.montant_octets, motif:r.motif, statut:r.statut, createdAt:(r.created_at||'').slice(0,10) };
}

const auth = SUPABASE_CONFIGURED ? supabaseAuth : mockAuth;
const db = SUPABASE_CONFIGURED ? supabaseDb : mockDb;
