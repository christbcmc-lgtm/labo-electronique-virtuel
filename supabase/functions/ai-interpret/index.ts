// ============================================================================
// Fonction Edge Supabase — interprétation IA d'un circuit
// ============================================================================
// Rôle : recevoir un circuit (composants + connexions + résultats du
// diagnostic structurel) depuis le frontend, appeler une API d'IA externe
// avec la clé secrète (jamais exposée au navigateur), et renvoyer une
// explication en français.
//
// Déploiement :
//   1. Installer la CLI Supabase (https://supabase.com/docs/guides/cli)
//   2. supabase functions deploy ai-interpret
//   3. supabase secrets set AI_API_KEY=votre_clé_secrète
//
// Le frontend appelle cette fonction via son URL publique
// (https://<project-ref>.supabase.co/functions/v1/ai-interpret) — voir la
// constante AI_EDGE_FUNCTION_URL dans labo-electronique-virtuel.html.
//
// STATUT : ceci est un SCAFFOLD (structure de base). L'appel réel à l'API
// d'IA (fetch vers OpenAI/Google/Anthropic...) doit être complété une fois
// le fournisseur choisi — voir le bloc "À COMPLÉTER" ci-dessous. Sans clé
// configurée, la fonction renvoie une erreur explicite plutôt qu'un faux
// résultat.
// ============================================================================

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { domaine, composants, connexions, diagnostic } = await req.json();

    const aiApiKey = Deno.env.get("AI_API_KEY");
    if (!aiApiKey) {
      return new Response(
        JSON.stringify({
          error: "AI_API_KEY n'est pas configurée côté serveur. " +
                 "Exécutez : supabase secrets set AI_API_KEY=votre_clé",
        }),
        { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prompt = [
      `Domaine : ${domaine}`,
      `Composants : ${JSON.stringify(composants)}`,
      `Connexions : ${JSON.stringify(connexions)}`,
      `Diagnostic structurel (bornes non connectées, etc.) : ${JSON.stringify(diagnostic)}`,
      "",
      "Explique en français, simplement et pédagogiquement, ce que ce circuit semble faire, " +
      "signale les incohérences évidentes, et propose des pistes d'amélioration. " +
      "Ne prétends pas avoir calculé de valeurs électriques précises si elles ne sont pas fournies.",
    ].join("\n");

    // ------------------------------------------------------------------
    // À COMPLÉTER : appel réel à l'API d'IA choisie. Exemple avec l'API
    // Messages d'Anthropic (à adapter selon le fournisseur retenu) :
    //
    // const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
    //   method: "POST",
    //   headers: {
    //     "x-api-key": aiApiKey,
    //     "anthropic-version": "2023-06-01",
    //     "content-type": "application/json",
    //   },
    //   body: JSON.stringify({
    //     model: "claude-sonnet-5",
    //     max_tokens: 1024,
    //     messages: [{ role: "user", content: prompt }],
    //   }),
    // });
    // const aiData = await aiResponse.json();
    // const interpretation = aiData.content?.[0]?.text ?? "Réponse IA vide.";
    // ------------------------------------------------------------------

    return new Response(
      JSON.stringify({
        error: "Appel IA non implémenté : complétez le bloc « À COMPLÉTER » " +
               "dans supabase/functions/ai-interpret/index.ts avec le fournisseur d'IA choisi.",
      }),
      { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
