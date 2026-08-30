// ============================================================================
// Fonction Edge Supabase — interprétation IA d'un circuit
// ============================================================================
// Rôle : recevoir un circuit (composants + connexions + résultats du
// diagnostic structurel) depuis le frontend, appeler l'API Anthropic avec la
// clé secrète (jamais exposée au navigateur), et renvoyer une explication en
// français.
//
// Déploiement :
//   1. Installer la CLI Supabase (https://supabase.com/docs/guides/cli)
//   2. supabase functions deploy ai-interpret
//   3. supabase secrets set AI_API_KEY=votre_clé_API_Anthropic
//
// Le frontend appelle cette fonction via son URL publique
// (https://<project-ref>.supabase.co/functions/v1/ai-interpret) — voir la
// constante AI_EDGE_FUNCTION_URL dans js/config.js.
//
// STATUT : l'appel réel à l'API Anthropic est implémenté ci-dessous (fournisseur
// retenu — voir le rapport final pour la justification et comment changer de
// fournisseur si besoin). Il n'a PAS pu être testé en conditions réelles
// (aucune clé API fournie pendant le développement). Sans clé configurée côté
// serveur, la fonction renvoie une erreur explicite plutôt qu'un faux résultat.
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

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": aiApiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      return new Response(
        JSON.stringify({ error: `Erreur de l'API IA (${aiResponse.status}) : ${errText.slice(0, 300)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const interpretation = aiData.content?.[0]?.text ?? "Réponse IA vide.";

    return new Response(
      JSON.stringify({ interpretation }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
