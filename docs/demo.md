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
