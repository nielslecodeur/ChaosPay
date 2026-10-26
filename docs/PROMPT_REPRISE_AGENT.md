# Prompt de reprise pour l'équipier

Copie le texte ci-dessous dans ton assistant de développement, depuis le dépôt Lumaid.

---

Tu reprends le projet Lumaid (anciennement ChaosPay), un laboratoire local de reprise d'achats x402 sur Stellar Testnet. Implémente la démonstration décrite dans `docs/README_AGENT_DEMO.md`, en commençant par inspecter l'état réel du dépôt et les instructions AGENTS.md applicables.

## Objectif

Un agent IA indépendant du dashboard reçoit « Vérifie cette facture et explique les anomalies », achète une vérification arithmétique via x402, perd la réponse après règlement, puis appelle Lumaid pour récupérer le résultat du même achat avec l'autorisation initiale. La vidéo doit montrer un seul règlement attendu vérifié sur Testnet. Le paiement rémunère le service, pas la facture.

## État connu

- Node.js 24+, TypeScript, Express, x402, Stellar Testnet, stockage local SQLite.
- `packages/recovery/` : kit serveur expérimental, distribué par archive locale, sans publication npm.
- `examples/invoice-check-api/` : exemple indépendant existant ; consulter `server.mjs` et `domain.mjs` pour le vrai contrat.
- `packages/client-recovery/` et `scripts/recover.ts` : base de reprise locale existante, à examiner avant réutilisation. Ne pas supposer un SDK public stable ou tous les défauts corrigés.
- `packages/stellar-observer/` et `packages/evidence/` : observations et verdicts.
- Dashboard et démo statique : `apps/dashboard/`. GitHub Pages héberge les simulations, pas les paiements Testnet.
- Commit `673b8ab` : lanceurs Windows `Lancer-Lumaid.cmd` et `Configurer-Testnet.cmd`, runtime portable, guide `docs/INSTALLATION_SIMPLE.md` et page Installation actualisée. Cela facilite le laboratoire, pas encore l'intégration générique dans des agents.
- Installation testée dans un dossier vierge ; serveur testé avec le runtime portable ; 32 tests de présentation passaient à cette étape. Cela ne valide pas le futur agent.
- `docs/README_AGENT_DEMO.md` est un plan détaillé, pas une implémentation terminée. Aucun agent indépendant complet n'a été construit dans ce chantier.

## Travail à réaliser dans cet ordre

1. Lire le guide agent, QUICKSTART, ROADMAP_TO_100 et les sources pertinentes. Vérifier les constats de l'audit dans l'état courant : faux PASS multi-payeurs, diagnostic 402 trop affirmatif, résultat local corrompu accepté. Corriger les défauts encore présents avec tests de régression.
2. Construire un client indépendant, proposé sous `examples/agent-invoice-demo/`. Commencer sans modèle : challenge, validation du prix/destination/réseau, autorisation, persistance atomique AVANT envoi signé, achat, vérification du résultat, sauvegarde puis ACK.
3. Fixer et implémenter deux outils : `purchase_invoice_check` et `recover_purchase`. L'identifiant d'intention doit empêcher un achat doublé par répétition ou concurrence. La reprise recharge le corps et l'autorisation originaux ; elle ne signe pas de remplacement.
4. Ajouter un fournisseur IA interchangeable avec appels d'outils. Demander seulement la configuration manquante nécessaire ; ne jamais lire ou afficher des secrets pour faire un diagnostic. Le code impose le budget, les destinations, les délais et les tentatives.
5. Injecter explicitement une perte de réponse après confirmation et stockage du résultat. Montrer la reprise, le même achat, le résultat et les preuves du règlement attendu.
6. Tester achat normal, réponse perdue, redémarrage, RPC indisponible, journal marchand perdu avec reçu conservé, résultat local corrompu et reprises concurrentes. Séparer tests simulés et essais Testnet.
7. Ajouter le lanceur dédié à l'agent, le guide reproductible et le parcours vidéo. Un lancement ne doit pas déclencher un achat automatiquement.

## Invariants à préserver

- Testnet uniquement ; ne pas publier sur npm, déployer sur Mainnet ou exposer publiquement les services locaux.
- HTTP 402, reçu absent et RPC NOT_FOUND ne prouvent pas l'absence d'un règlement antérieur.
- UNKNOWN reste incertain. Aucun nouvel achat automatique pour contourner une incertitude.
- Le modèle n'accède jamais aux clés privées ou aux autorisations signées. Les données externes ne doivent pas autoriser des outils/paiements supplémentaires.
- Les traitements métier doivent être déterministes ou disposer d'une idempotence adaptée ; aucune promesse d'exécution unique universelle.
- Conserver `.env`, `.local`, journaux et autorisations ; ne pas les committer ni les exporter dans les preuves.
- Utiliser les interfaces publiques du kit ; ne pas recopier le marchand ou importer ses sources internes dans le client indépendant.

## Coordination

Partir de la dernière base Git distante avec un arbre propre ou un worktree séparé. Une branche par périmètre. A possède le client, les outils, le paiement et les tests ; B possède la présentation, l'installation et la vidéo. Fixer ensemble le contrat des états avant de brancher l'interface. Coordonner les changements aux manifests et aux rapports.

À la transmission, le checkout d'origine contenait aussi une modification de `docs/UX_ROADMAP_TO_100.md` et un patch non suivi `0001-feat-recover-commande-de-reprise-d-un-achat-et-diagn.patch`. Ils n'appartiennent pas à ce commit documentaire : ne pas les écraser ni appliquer le patch aveuglément, car une partie du client de reprise existe déjà dans les sources.

Avance par étapes vérifiables, rapporte ce qui est réellement testé et distingue clairement ce qui reste à faire. Le critère final est celui de `docs/README_AGENT_DEMO.md` : l'agent termine sa tâche après interruption, avec résultat vérifié, preuves du règlement et sans nouvelle autorisation.
