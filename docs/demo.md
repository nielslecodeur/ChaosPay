# Démonstration du rôle B

Le runner et le dashboard restent dans leur périmètre : aucun changement du moteur A, du package.json, du lockfile ou du tsconfig racine. Le contrat utilisé est celui de `ENGINE_API.md` et le type `PurchaseReport` du package evidence.

## Lancer

Depuis la racine, avec Node 24 et les dépendances installées (`npm ci`) :

```sh
node --import tsx packages/runner/src/server.ts
```

Ouvrir **http://127.0.0.1:3002** (utiliser cette adresse, pas localhost).

Le dashboard initial est en HTML/CSS/JavaScript natif, sans dépendance supplémentaire. React/Vite reste une évolution à coordonner avec le responsable des fichiers partagés.

## Sans clés : simulation et archives

Choisir une simulation puis lancer l’expérience. Les cinq scénarios sont : sans panne, réponse perdue, crash marchand, deux requêtes simultanées et comparaison naïf/durable. Toutes les simulations portent le marqueur **SIMULATED**, y compris dans l’export. Leurs PASS et FAIL sont des résultats fictifs.

Les campagnes de `evidence/public/` sont chargées avec le marqueur **ARCHIVE**. Ce sont les preuves historiques du moteur A, pas de nouvelles vérifications réseau. La timeline indique seulement leur chargement. Les liens de transactions ciblent l’explorateur Testnet.

Sélectionner une expérience pour voir les montants atomiques, transferts, ledger, adresses, accusé du résultat et timeline. Utiliser « Export JSON expurgé » pour télécharger le rapport. Les champs privés du moteur sont exclus par liste blanche ; les payloads et sorties brutes des processus ne sont jamais exposés.

La comparaison affiche le montant observé en XLM (sept décimales exactes, hors frais), le prix, le nombre de transactions distinctes et le résultat récupéré et accusé. Les unités atomiques restent visibles. Le nombre de règlements est distinct du nombre d’événements de transfert.

Le champ optionnel `recoveryDurationMs` appartient au runner : il mesure, avec une horloge monotone, la durée entre la détection de l’interruption et le premier accusé réussi, redémarrage et nouvelle autorisation naïve inclus. Il ne mesure pas la durée depuis le règlement sur la blockchain. Sans interruption mesurée, sans accusé, en simulation ou pour les anciennes archives, afficher « Non mesuré ». Un montant observé nul avec UNKNOWN ne prouve pas qu’aucun paiement n’a eu lieu.

## Prochaine référence produit

Les cinq scénarios réels ont été validés le 25 octobre 2026 via l’API du dashboard, avec le moteur A au commit `38d4d1c`. La cible suivante est deux applications (conversion CSV et génération de reçus) réutilisant la même bibliothèque de reprise, sans copie du marchand. Le scénario « paiement soumis, confirmation inaccessible » nécessite un hook moteur à coordonner avec A : observer UNKNOWN, rétablir l’observation, retrouver le règlement puis récupérer le résultat avec l’autorisation originale. Ce scénario n’est pas encore implémenté et ne doit pas être confondu avec la coupure de réponse après confirmation.

| Scénario | Verdict | Règlements | Reprise mesurée |
| --- | --- | --- | --- |
| Sans panne | PASS | 1 | Non applicable |
| Réponse perdue | PASS | 1 | 296 ms |
| Crash | PASS | 1 | 4 780 ms |
| Concurrence | PASS | 1 | Non applicable |
| Comparaison durable | PASS | 1 | 145 ms |
| Comparaison naïve | FAIL attendu | 2 | 14 057 ms |

Chaque règlement valait 100000 unités atomiques (0,01 XLM Testnet). Ces mesures décrivent une campagne, pas une garantie de performance. Son export complet reste local dans `.local/runner/validation-1792937083322.json` ; il n’est pas livré dans Git. La commande de validation ci-dessous permet de produire une nouvelle référence.

### Proposition d’intégration à coordonner avec A

Le contrat actuellement implémenté reste `ENGINE_API.md` (CSV uniquement). Pour la seconde application, proposition à confirmer avant implémentation :

- Identifier l’application dans chaque achat et rapport (`applicationId`), et inclure cet identifiant dans l’identité durable de l’achat afin d’éviter les collisions entre services.
- Définir les corps d’entrée, les routes et le format du résultat de chaque application. Le runner fournit ces adaptateurs ; la bibliothèque A conserve la responsabilité du paiement et de la reprise.
- Définir une enveloppe de résultat et sa règle de hachage commune, ainsi que l’accusé correspondant. Le runner actuel vérifie `digest(csv)` ; ne pas réutiliser implicitement cette règle pour un reçu.
- Conserver les montants atomiques, les transferts observés et les verdicts du contrat existant. Le délai de reprise reste une mesure du runner.
- Définir un hook local de confirmation inaccessible, son activation et son rétablissement. Le test devra garder le même achat et le même payload entre UNKNOWN et la récupération finale.

Ces points sont une proposition B, pas un accord déjà obtenu ni une API déjà disponible. Le runner attend leur confirmation pour brancher la seconde application.

## Exécution Testnet

Suivre `SETUP_A.md` pour créer `.env` et financer les comptes de test, puis arrêter les serveurs lancés manuellement. Choisir **TESTNET** dans l’interface. Le runner lance ses propres processus avec les journaux existants, vérifie leur santé, exécute le scénario et les arrête à la fin. Il refuse de prendre le contrôle d’un serveur déjà présent. Une seule exécution est autorisée à la fois.

La comparaison utilise un achat durable puis un achat naïf : elle peut produire trois règlements de test au prix configuré. La seconde autorisation du mode naïf est intentionnelle. Le scénario crash redémarre uniquement le marchand appartenant au runner. Le scénario concurrent utilise le même payload pour les deux requêtes.

Chaque requête HTTP du client est enregistrée dans la timeline, distinctement des autorisations. Le CSV reçu est vérifié puis accusé. Le verdict provient du rapport de l’observateur ; aucune réponse HTTP ne suffit à annoncer PASS. Un PASS sans transfert exact ou sans accusé est dégradé en UNKNOWN.

Les autorisations sont écrites avant l’envoi dans `.local/client-<mode>-<purchaseId>.json`, au même format que le client A. Si le runner est interrompu, conserver ces fichiers et reprendre avec :

```sh
npm run smoke:payment -- <purchaseId> durable none
```

Pour le mode naïf, remplacer durable par naive **sans** `--new-authorization` pour réconcilier le dernier payload. Les rapports du runner sont conservés dans `.local/runner/`. Cette première version recharge les archives publiques au démarrage, mais pas l’historique local du runner. Une exécution interrompue peut nécessiter une reprise manuelle ; elle ne déclenche pas de nouvelle autorisation durable.

## Vérifier

```sh
node node_modules/typescript/bin/tsc --noEmit -p packages/runner/tsconfig.json
node --import tsx --test packages/runner/tests/*.test.ts
npm run typecheck
npm test
```

Le serveur écoute uniquement sur loopback, vérifie Host et Origin et exige un en-tête personnalisé pour lancer une expérience. Aucun CORS n’est ouvert. Ce laboratoire est exclusivement local et Testnet.

Pour rejouer automatiquement les cinq scénarios via la même API que le dashboard, laisser le runner démarré puis lancer :

```sh
node --import tsx packages/runner/verify-testnet.ts
```

Cette commande effectue de nouveaux paiements Testnet. Elle vérifie les verdicts, le nombre de règlements, les montants exacts, l’accusé, les délais de reprise et l’export JSON. Elle s’arrête au premier échec et conserve les autorisations. La campagne réussie est sauvegardée dans `.local/runner/validation-<timestamp>.json`.
