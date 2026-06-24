# Migration Vercel → Netlify

Supabase reste la base. Vercel est gardé en **fallback** pendant la transition : le
code marche sur les deux plateformes (config additive — `netlify.toml` ignoré par
Vercel, `vercel.json` ignoré par Netlify).

## ⚠️ Limite à connaître avant tout

Netlify plafonne les fonctions **synchrones à 26 s** (limite dure, le curseur du
dashboard ne la lève PAS). Les routes `generate-text-one` et `generate-image`
peuvent tourner jusqu'à 300 s (gpt-image-2 fait souvent 60–180 s). **Donc la
génération de carrousels ne fonctionnera pas sur Netlify telle quelle.**

→ Tant qu'on ne les a pas converties en jobs asynchrones (lancement + polling),
**garder la génération sur Vercel**. Netlify peut héberger le reste (UI, auth,
threads, pages, etc.). Demander la refonte async quand tu veux la génération sur Netlify.

## Déjà fait (code + DB, déployé)

- `netlify.toml` (`@netlify/plugin-nextjs`, Node 20)
- `netlify/functions/threads-cron.mjs` — Scheduled Function `*/5`, **gatée par
  `THREADS_CRON_ENABLED`** (inerte tant que le cron Vercel tourne → pas de double-post)
- Dépendance CLI `vercel` retirée, plugin Netlify ajouté
- **Bug cron Threads corrigé** (préexistant, cassé aussi sur Vercel) : claim atomique
  `pending→sending` + RPC `mark_threads_post_sent/failed` SECURITY DEFINER, `CRON_SECRET`
  fail-closed. Migration Supabase déjà appliquée.

## Variables d'environnement à mettre sur Netlify

| Variable | Action |
|---|---|
| `NEXT_PUBLIC_APP_URL` | **NOUVELLE VALEUR** = domaine Netlify, sans slash final |
| `THREADS_APP_ID` | Re-saisir propre (la copie locale avait un `\n`) |
| `THREADS_APP_SECRET` | Re-saisir propre (idem) — envisager de le régénérer chez Meta |
| `CRON_SECRET` | Copier la valeur existante |
| `NEXT_PUBLIC_SUPABASE_URL` | Copier |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Copier |
| `ANTHROPIC_API_KEY` | Copier |
| `GEMINI_API_KEY` | Copier |
| `OPENAI_API_KEY` | Copier |
| `THREADS_CRON_ENABLED` | **Laisser NON DÉFINIE** jusqu'à la bascule du cron |
| `URL`, `DEPLOY_PRIME_URL` | NE PAS définir (injectées par Netlify) |
| `VERCEL_OIDC_TOKEN` | NE PAS définir (artefact Vercel) |

(Pas besoin de `SUPABASE_SERVICE_ROLE_KEY` : le writeback passe par des RPC.)

## Supabase (dashboard)

- Authentication → URL Configuration → **Redirect URLs** : ajouter
  `https://<domaine-netlify>/auth/callback` (et `https://<domaine-netlify>/**`).
  **Garder** les entrées Vercel pendant le fallback.
- Le code dérive l'origin de la requête → s'adapte automatiquement au domaine servi.

## Meta / Threads (dashboard développeur)

- Valid OAuth Redirect URIs : ajouter `https://<domaine-netlify>/api/threads/callback`
  (byte-match exact, pas de slash final). Garder l'URI Vercel.
- Deauthorize Callback + Data Deletion URL : repointer vers le domaine Netlify si tu
  retires Vercel (sinon laisser, c'est inoffensif).

## Ordre de bascule (pour éviter les doublons Threads)

1. Netlify : connecter le repo GitHub, régler les env vars ci-dessus
   (`NEXT_PUBLIC_APP_URL` = Netlify, `THREADS_CRON_ENABLED` non définie).
2. Déployer, smoke-test : login/OAuth, CRUD, pages/PDF. (Génération : rester sur Vercel.)
3. Ajouter le domaine Netlify dans Supabase (allowlist) et Meta (redirect URI).
4. **Bascule du cron, dans cet ordre exact :**
   a. D'ABORD retirer le bloc `crons` de `vercel.json` (ou mettre le cron Vercel en pause)
      et redéployer Vercel → Vercel cesse de publier.
   b. PUIS mettre `THREADS_CRON_ENABLED=true` sur Netlify et redéployer.
   → Jamais les deux schedulers actifs en même temps.
5. Surveiller 1–2 ticks : les posts passent `sent`, pas de doublon, pas de 401.
