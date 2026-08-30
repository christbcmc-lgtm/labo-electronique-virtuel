/* ==========================================================================
   CONFIGURATION — à renseigner pour activer le vrai backend Supabase et l'IA.
   Tant que SUPABASE_URL / SUPABASE_ANON_KEY gardent leur valeur placeholder
   (contenant "_A_REMPLACER"), l'application tourne en MODE DÉMO LOCALE
   (données conservées uniquement dans ce navigateur via localStorage) — elle
   reste entièrement utilisable pour développer/tester l'interface sans
   dépendre d'un projet Supabase réel.

   Pour activer le vrai backend :
     1. Créer un projet sur https://supabase.com (gratuit pour démarrer).
     2. Exécuter supabase/schema.sql dans l'éditeur SQL du projet (après y
        avoir remplacé ADMIN_EMAIL_A_REMPLACER par le véritable e-mail admin,
        3 occurrences dans ce fichier SQL).
     3. Remplacer les constantes ci-dessous par les valeurs de votre projet
        (Project Settings → API pour l'URL et la clé "anon public").
     4. Dans Authentication → URL Configuration, ajouter l'URL de cette page
        à "Redirect URLs" (nécessaire pour le lien de réinitialisation de
        mot de passe envoyé par e-mail).

   SUPABASE_ANON_KEY est une clé PUBLIQUE conçue pour être exposée côté
   navigateur (la sécurité réelle est assurée par les policies RLS dans
   schema.sql) — ce n'est PAS un secret. À l'inverse, ne jamais mettre ici
   une "service_role key" ni une clé d'API d'IA : ces clés-là sont secrètes
   et doivent rester côté serveur (voir supabase/functions/ai-interpret).
   ========================================================================== */
const SUPABASE_URL = 'SUPABASE_URL_A_REMPLACER';
const SUPABASE_ANON_KEY = 'SUPABASE_ANON_KEY_A_REMPLACER';
const ADMIN_EMAIL = 'ADMIN_EMAIL_A_REMPLACER'; // doit correspondre à ADMIN_EMAIL_A_REMPLACER dans schema.sql
const AI_EDGE_FUNCTION_URL = 'AI_EDGE_FUNCTION_URL_A_CONFIGURER'; // ex: https://xxxx.supabase.co/functions/v1/ai-interpret

const SUPABASE_CONFIGURED = !SUPABASE_URL.includes('_A_REMPLACER') && !SUPABASE_ANON_KEY.includes('_A_REMPLACER');
const AI_CONFIGURED = !AI_EDGE_FUNCTION_URL.includes('_A_CONFIGURER');
const supabaseClient = SUPABASE_CONFIGURED && window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Quota de stockage par défaut (octets) — modifiable par l'administrateur par utilisateur (§27/§28).
const DEFAULT_STORAGE_QUOTA_BYTES = 2 * 1024 * 1024; // 2 Mo

// Utilitaire HTML-escape, utilisé dès le chargement du catalogue (libellés de symboles) : défini ici,
// tout en tête de chaîne de chargement, pour être disponible avant catalog.js.
function esc(s=''){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
