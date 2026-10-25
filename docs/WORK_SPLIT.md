# Travail avec deux IA

## Organisation

Deux clones ou worktrees distincts et une branche par périmètre. Ne pas faire modifier le même checkout simultanément par deux IA. Une seule personne coordonne package.json, lockfile, configuration TypeScript, CI et README. Intégrer régulièrement par pull request.

## IA A : moteur de paiement

Branche proposée : feat/payment-engine.

Périmètre : apps/demo-merchant/, packages/stellar-observer/, packages/evidence/, tests réseau et docs/versions.md.

Prompt :

> Lis docs/PROJECT.md et les instructions AGENTS.md applicables. Implémente le moteur de paiement et de reprise de ChaosPay. Commence par un paiement x402 confirmé sur Stellar Testnet et une vérification indépendante du transfert. Enregistre versions, SHA upstream et crédits. Ajoute ensuite stockage durable, idempotence et réconciliation après crash. Coordonne les types des rapports avec l'autre IA. Ne modifie pas le dashboard ou les fichiers partagés sans coordination. Ne pousse pas sans demande.

## IA B : runner et dashboard

Branche proposée : feat/runner-dashboard.

Périmètre : apps/dashboard/, packages/runner/, scenarios/, tests du runner et docs/demo.md.

Prompt :

> Lis docs/PROJECT.md et les instructions AGENTS.md applicables. Implémente le runner et le dashboard de ChaosPay. Coordonne d'abord le schéma des rapports avec le moteur. Commence par une fixture explicitement marquée SIMULATED, puis branche les preuves réelles. Ajoute contrôle des processus locaux, scénarios, timeline, comparaison et export JSON. Un paiement n'est confirmé que sur preuve de l'observateur. Ne modifie pas le moteur ou les fichiers partagés sans coordination. Ne pousse pas sans demande.

## Contrat partagé à fixer avant intégration

Types : Purchase, Attempt, Evidence, Delivery et Verdict. Rapport : schemaVersion, runId, purchaseId, mode, scenario, network, tokenContract, expectedAmountAtomic, transfers, responseRecovered, verdict et reason. Transfert : txHash, from, to, amountAtomic et ledger. Aucun PASS sans preuves suffisantes. Prévoir UNKNOWN, FAIL et UNSUPPORTED.

## Jalons

1. Paiement confirmé et format de rapport commun.
2. Parcours sans panne entre runner, moteur et UI.
3. Coupure après règlement, redémarrage et reprise.
4. Concurrence, cas négatifs et export.
5. Installation propre, tests, README et vidéo.

Les IA accélèrent le développement ; les tests réseau et la relecture déterminent si les fonctions marchent réellement. Aucune donnée simulée présentée comme réelle et aucun secret dans Git.

## Intégration du kit de reprise

La branche feat/recovery-kit part de feat/runner-dashboard. Elle modifie le moteur, le runner et le dashboard pour intégrer les deux API et les nouveaux rapports. Intégrer cette branche avant de reprendre le travail B.

Le cœur est dans packages/recovery/ ; apps/demo-merchant/ et apps/receipt-api/ utilisent le même adaptateur. Suite proposée pour B : présentation de la démo et vidéo ; pour A : essai chez une API externe et préparation d’un package distribuable. Voir ENGINE_API.md et RECOVERY_KIT.md.
