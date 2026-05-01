# Tiktok Factory

Générez des carousels TikTok / Instagram en un clic. Stack Next.js + Supabase + Konva + Claude + Gemini.

## Stack

- **Next.js 14** (App Router, TypeScript) déployé sur Vercel
- **Supabase** : Auth (Google OAuth), PostgreSQL, Storage
- **Konva** : template builder drag & drop + rendu client-side
- **Anthropic Claude** : génération de texte (slides)
- **Google Gemini** : génération d'images de fond par slide

## Fonctionnement

1. Tu construis un template visuel (drag & drop) avec positions, polices, couleurs, z-index
2. Tu lances une génération avec une idée ou une instruction libre
3. Claude génère le JSON des slides (texte + prompt d'image par slide)
4. Gemini génère une image de fond par slide (suivant les instructions globales + le prompt spécifique)
5. Konva compose chaque slide côté client (ce que tu vois = ce qui est exporté)
6. Les JPEG finaux sont uploadés dans Supabase Storage et apparaissent dans la galerie

## Développement local

```bash
npm install
cp .env.local.example .env.local
# remplir les clés Supabase
npm run dev
```

## Variables d'environnement

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY` (optionnel, peut être défini par utilisateur dans les Paramètres)
- `GEMINI_API_KEY` (optionnel, idem)

## Déploiement

Push sur la branche `main` = déploiement automatique Vercel.
