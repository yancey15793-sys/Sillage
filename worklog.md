# Worklog — Projet Sillage

---
Task ID: 1
Agent: Super Z (agent principal)
Task: Corriger les bugs du prototype Sillage (HTML single-file), le transformer en application Next.js production-ready et intégrer la liste de 255 flux RSS fournie (upload/flux_rss.txt).

Work Log:
- Analyse du prototype original (1 578 lignes) : 10 bugs identifiés dont script injecté via innerHTML jamais exécuté (graphe de couverture), surlignages non persistants, confusion notes/surlignages, aucune persistance, cartes non accessibles au clavier.
- Initialisation fullstack (Next.js 16 + TS + Tailwind 4 + shadcn/ui + Prisma/SQLite), `rss-parser` installé.
- Schéma Prisma : models `Feed` (url unique, catégorie, langue, état, lastError, itemCount) et `Article` (guid unique par flux, contenu texte, image, auteur) — @@unique([feedId, guid]).
- Seed `scripts/seed-feeds.ts` : 255 URLs nettoyées (params de tracking retirés), 3 invalides filtrées (exemple.com, 2 YouTube vides), 1 doublon → **251 flux** catégorisés en 9 rubriques (tech/geo/eco/sci/enr/cul/sport/design/life) avec noms propres français et détection de langue.
- Lib `src/lib/rss.ts` : fetch avec timeout/UA réaliste, parse rss-parser, conversion HTML → paragraphes texte (entités décodées), extraction d'images (enclosure/media:content/première balise img), normalisation dates aberrantes.
- Lib `src/lib/ingest.ts` : job global singleton, pool de concurrence 12, filtre >90 jours, upsert idempotent (dédup guid), progression consultable, auto-start si base vierge. **Bug majeur corrigé en route : `createMany({skipDuplicates})` non supporté par SQLite → filtrage des guid existants avant insertion.**
- Routes API : /api/ingest (GET statut+auto-start, POST), /api/articles (filtres cat/feed/q/ids/sort/pagination infinie), /api/feeds (GET/POST/PATCH/DELETE — gestion complète des sources), /api/stats (tendances 14 j, brief, sources actives), /api/topic (couverture 30 j, répartition, auteurs, chronologie), /api/synthesis (LLM z-ai-web-dev-sdk, cache 30 min, repli extractif), /api/tts (lecture vocale WAV).
- **Deuxième bug majeur corrigé : Prisma stocke les DateTime en millisecondes entières → toutes les requêtes brutes `datetime('now',...)` comparaient entier vs texte (résultats vides). Réécrites avec comparaisons numériques + `date(x/1000,'unixepoch')`.**
- Frontend : design system Sillage porté intégralement dans globals.css (tokens jour/nuit, 4 polices via next/font : Fraunces/Newsreader/Instrument Sans/Spline Sans Mono), composants views (home/feed/topic/article/library/discover/sources), shell responsive (sidebar/tablette rail/bottomnav mobile), palette ⌘K (cmdk + recherche serveur), tiroir notes, graphiques React interactifs, lecteur audio TTS séquentiel.
- Store Zustand persistant (localStorage) : lectures, sauvegardes, favoris, sujets/sources suivis, surlignages, notes, collections, préférences.
- Vérification end-to-end avec Agent Browser + VLM : accueil, flux (4 modes), sujet (synthèse IA réelle + graphiques + chronologie), article (63 paragraphes, En bref, citation), **surlignage persistant vérifié à travers reload + navigation (bug #2 corrigé)**, **note liée à citation distincte des surlignages (bug #3 corrigé)**, **TTS vérifié lecture en cours (blob, t>0s)**, bibliothèque (collections créées, historique persistant), découverte, gestion des 251 sources, palette (recherche article réel), dark mode, mobile 390 px.
- Trois bugs runtime corrigés pendant la vérification : import useStats manquant, sélecteur Zustand instable (getSnapshot boucle) → dérivation useMemo, autoplay TTS → démarrage différé.

Stage Summary:
- Application fonctionnelle sur http://localhost:3000 (port 3000, dev server auto).
- **6 683 articles réels** agrégés depuis **166 flux fonctionnels** (85 flux en erreur : blocages anti-robots de sites ou flux morts — affichés honnêtement dans la vue Sources avec message d'erreur par flux).
- Les 10 bugs du prototype sont corrigés : graphique interactif (handlers React), surlignages persistants (localStorage + ré-application au rendu), notes distinctes, persistance complète, data model propre, échappement React natif, pas de code mort, lucide-react épinglé, navigation clavier complète.
- Fonctionnalités IA réelles : synthèse éditoriale par sujet (z-ai LLM, cache 30 min) et lecture audio des articles (TTS multi-segments).
- Lint ESLint : 0 erreur, 0 avertissement.
- Scripts persistants : scripts/seed-feeds.ts (ré-exécutable), captures de vérification dans scripts/shot-*.png.
