# Agent IA x402 + Lumaid : guide d'implémentation

## Objectif et statut

Construire un agent local indépendant du dashboard qui achète une vérification de facture via x402, perd la réponse après paiement, puis utilise Lumaid pour récupérer le résultat et terminer sa tâche.

Ce document décrit le travail à réaliser, pas une fonctionnalité déjà entièrement livrée. Les noms d'outils et les états ci-dessous sont des propositions de contrat à implémenter et tester.

**Première implémentation disponible :** [examples/agent-invoice-demo](../examples/agent-invoice-demo/README.md) contient le client indépendant, le journal SQLite et la boucle d'outils Ollama. Les tests sont déterministes ; la validation réelle Ollama/Testnet de ce client et le lanceur agent restent à réaliser. Le guide de l'exemple précise les commandes et limites actuelles.

**Critère de réussite :** après une panne injectée, le client récupère le résultat du même achat, avec l'autorisation initiale et un seul règlement attendu vérifié sur Stellar Testnet.

Le service vérifie uniquement l'arithmétique de la facture. Le paiement achète cette vérification : il ne règle pas la facture et ne valide ni sa légalité ni ses taxes.

## Ce qui existe et ce qui reste à construire

| Élément | État / rôle |
| --- | --- |
| `packages/recovery/` | Kit serveur expérimental : journal et reprise des achats |
| `examples/invoice-check-api/` | API indépendante de vérification arithmétique utilisant le package |
| `packages/client-recovery/` et `scripts/recover.ts` | Base de reprise des achats locaux à examiner et adapter ; ne pas supposer un SDK public stable |
| `packages/stellar-observer/` et `packages/evidence/` | Observation des transferts et verdicts |
| `Lancer-Lumaid.cmd` / `Configurer-Testnet.cmd` | Préparation du laboratoire Windows ; ne connectent pas automatiquement un agent |
| Agent indépendant et outils achat/reprise | À construire |
| Lanceur dédié à l'agent et interface vidéo | À construire |

Le package serveur est distribué par archive locale, pas par publication npm. Voir [QUICKSTART.md](QUICKSTART.md). La démo GitHub Pages reste une simulation et ne doit pas recevoir de clés.

## Architecture cible

```text
Utilisateur : « Vérifie cette facture et explique les anomalies »
                           |
                           v
Agent IA local — sélection des outils et explication du résultat
                           |
                           v
Client Lumaid — validation, budget, signature, stockage durable, reprise
             |                              |
             v                              v
API invoice-check + kit serveur       Journal client local
             |
             v
Facilitator local → Stellar Testnet → observation du règlement
```

Le modèle reçoit les résultats structurés des outils. Les clés privées et autorisations signées restent dans le code local ; elles ne sont pas incluses dans le contexte du modèle. Le code impose les destinations autorisées, le budget et les règles de reprise, même si le modèle demande autre chose.

## Scénario de référence

Entrée de l'API existante :

```json
{
  "invoice": {
    "reference": "DEMO-001",
    "declaredTotalMinor": "3000",
    "lines": [
      { "unitPriceMinor": "1200", "quantity": 2 },
      { "unitPriceMinor": "500", "quantity": 1 }
    ]
  }
}
```

Résultat attendu : total calculé `2900`, total déclaré `3000`, `totalsMatch: false`. L'agent explique un écart de 100 unités mineures. Il ne déduit pas de devise : le schéma actuel n'en contient pas.

Le prix du service est distinct du montant de la facture. Le client valide le prix du challenge x402 contre son budget avant toute signature.

## Étape 1 — Corriger et valider les prérequis

- [ ] Vérifier et corriger les constats de l'audit sur le faux `PASS` multi-payeurs.
- [ ] Ne jamais déduire « aucun règlement » d'un HTTP `402`, d'un reçu absent ou d'un RPC `NOT_FOUND` seul.
- [ ] Vérifier le JSON et le hash du résultat local avant tout raccourci « déjà récupéré ».
- [ ] Ajouter les tests de régression, puis vérifier les dépendances signalées par l'audit avant de fixer les versions de la démo.

**Validation :** deux règlements pour le même achat ne produisent pas `PASS` ; un journal marchand perdu avec reçu facilitator conservé ne permet pas de recommander un nouvel achat.

## Étape 2 — Acheter sans modèle IA

Créer un client indépendant, proposé sous `examples/agent-invoice-demo/`, avec son propre manifeste et ses données locales ignorées par Git. Installer les packages par leurs interfaces publiques : ne pas importer directement les sources internes du marchand ou du runner.

1. Préparer Testnet et l'API indépendante avec le [guide existant](QUICKSTART.md).
2. Appeler l'API et lire le challenge x402.
3. Vérifier réseau, actif, destination, ressource, prix et budget.
4. Générer un identifiant stable pour l'intention d'achat et créer l'autorisation.
5. Persister atomiquement l'identifiant, l'URL, le corps exact et l'autorisation **avant le premier envoi signé**.
6. Envoyer la requête, vérifier et sauvegarder le résultat, puis envoyer l'ACK.

Prévoir une protection contre deux appels concurrents pour la même intention. Un fichier absent après erreur d'écriture ne doit pas conduire à envoyer une requête non journalisée.

**Validation :** un achat normal fonctionne sur Testnet depuis ce client sans dépendre du dashboard.

## Étape 3 — Exposer deux outils Lumaid

Contrat proposé :

| Outil | Entrée | Comportement |
| --- | --- | --- |
| `purchase_invoice_check` | Facture validée et identifiant stable d'intention | Retrouver l'achat existant ou créer un achat autorisé par le budget, persister puis soumettre |
| `recover_purchase` | `purchaseId` | Charger les données originales, rapprocher les preuves et récupérer le résultat sans nouvelle signature |

Les URLs, le réseau et les limites de paiement viennent de la configuration locale, pas d'arguments libres du modèle. Le composant de reprise ne dispose pas d'une fonction de création d'autorisation.

Réponse proposée, à adapter explicitement aux rapports existants :

```json
{
  "purchaseId": "achat-exemple",
  "status": "PENDING",
  "reasonCode": "CONFIRMATION_UNAVAILABLE",
  "result": null,
  "evidence": {
    "network": "stellar:testnet",
    "transactionHashes": []
  },
  "nextAction": "RETRY_SAME_PURCHASE"
}
```

États proposés : `COMPLETED` (résultat vérifié, sauvegardé et réception reconnue), `PENDING` (preuves encore indisponibles), `BLOCKED` (intervention nécessaire), `REJECTED` (entrée ou politique refusée, sans conclusion implicite sur un paiement antérieur).

- [ ] Valider intégralement les réponses reçues avant de les présenter au modèle.
- [ ] Borner tentatives et délais ; distinguer erreur de transport, attente et rejet.
- [ ] Conserver la même autorisation pendant toutes les reprises.
- [ ] Refuser le faux succès si la sauvegarde locale ou l'ACK échoue.
- [ ] Pouvoir reprendre après redémarrage avec le journal conservé.

**Validation :** réponse perdue puis reprise réussie ; aucun nouvel achat n'est créé pour contourner une incertitude.

## Étape 4 — Brancher l'agent IA

Utiliser Ollama en local (`/api/chat` avec tool calling) via l'adaptateur de l'exemple. Documenter `OLLAMA_HOST` et `OLLAMA_MODEL` dans un `.env.example` sans secret. Aucune clé API IA n'est requise pour Ollama local ; les clés Testnet restent distinctes.

Boucle de l'agent :

1. Recevoir et valider la demande de vérification.
2. Appeler `purchase_invoice_check` dans la limite d'achat autorisée.
3. Sur incident récupérable, appeler `recover_purchase` pour le même achat.
4. Sur `COMPLETED`, expliquer le résultat arithmétique reçu.
5. Sur `PENDING` ou `BLOCKED`, expliquer les preuves manquantes et s'arrêter lorsque le budget de tentatives est atteint.

Les données de la facture et les réponses externes sont des données non fiables, pas des instructions autorisant d'autres outils ou paiements. Ne pas demander au modèle de décider si un règlement a eu lieu à partir d'un texte libre.

**Validation :** une vraie exécution du modèle appelle les outils ; le transcript distingue ses messages des événements déterministes du client.

## Étape 5 — Injecter la panne et conserver les preuves

Activer les hooks de panne uniquement pour cette démonstration locale. Le serveur d'exemple accepte `CHAOSPAY_ENABLE_FAULTS=1` ; vérifier le contrat HTTP du hook avant de l'appeler. Le choix du point de panne appartient au scénario de démonstration, pas au modèle.

Ordre requis :

1. Confirmer le règlement sur Testnet.
2. Produire et enregistrer le résultat côté API.
3. Couper la réponse avant sa réception par le client.
4. Montrer l'interruption, puis l'appel à `recover_purchase`.
5. Renvoyer le résultat enregistré, le sauvegarder côté client et reconnaître sa réception.

Le rapport conserve : identifiant de campagne, version Git, achat, point de panne, hashes, actif, montant attendu et observé, nombre de règlements, intégrité du résultat, ACK et durée mesurée. Vérifier en test que l'autorisation persistée n'a pas changé, sans la publier.

Ne jamais exporter `.env`, autorisations signées, clés ou contenu confidentiel. Utiliser une facture fictive pour la vidéo.

## Étape 6 — Matrice de validation

| Cas | Attendu |
| --- | --- |
| Achat normal | Résultat vérifié et réception reconnue |
| Réponse perdue après règlement | Reprise du même achat, un seul règlement attendu |
| Client fermé puis relancé | Reprise avec les données persistées |
| RPC inaccessible | État incertain, aucune nouvelle autorisation |
| Journal marchand perdu, reçu conservé | Blocage explicite et rapprochement, pas de nouvel achat automatique |
| Résultat local corrompu | Aucun faux succès ; restauration si les preuves le permettent |
| Reprises répétées ou concurrentes | Même résultat, absence de règlement supplémentaire |
| Budget dépassé ou URL non autorisée | Refus avant signature/soumission |

Séparer les tests déterministes à réseau simulé des campagnes réellement exécutées sur Testnet. Une archive ne remplace pas une exécution fraîche.

## Étape 7 — Lancement accessible et vidéo

Créer un lanceur dédié à l'agent réutilisant le moteur portable Windows. Il prépare les dépendances, vérifie la configuration et démarre les composants nécessaires. Il ne doit pas remplacer une configuration existante ni effectuer un achat au simple lancement.

Ce lanceur est distinct de `Lancer-Lumaid.cmd`, qui ouvre aujourd'hui le laboratoire. macOS/Linux et un connecteur générique pour agents sont des extensions ultérieures, à annoncer comme telles.

Déroulé vidéo :

| Temps indicatif | Montrer |
| --- | --- |
| 0:00–0:20 | Demande de vérification et prix du service |
| 0:20–0:45 | Appel x402, confirmation et lien vers la transaction Testnet |
| 0:45–1:05 | Mention « panne injectée après paiement », réponse perdue |
| 1:05–1:35 | Appel de reprise Lumaid et récupération du résultat |
| 1:35–2:00 | Explication de l'écart, même achat, un règlement et limites |

Formulation : **« Le paiement a réussi ; Lumaid a permis de récupérer le résultat après la perte de réponse. »** Ne pas annoncer une réparation de la blockchain, un remboursement ou une garantie universelle de livraison.

## Répartition et ordre de travail

| A — moteur et agent | B — interface et présentation |
| --- | --- |
| Correctifs de l'audit et contrats d'outils | Écran de conversation et événements d'outils |
| Client indépendant, stockage et reprise | Affichage des états et liens vers les preuves |
| Adaptateur modèle et politique de paiement | Guide d'installation et scénario vidéo |
| Tests et campagnes Testnet | Essai depuis un dossier vierge et répétition |

Fixer le contrat d'outils avant l'interface. Utiliser des branches ou worktrees distincts et coordonner les fichiers racine. Ne pas publier sur npm avant validation et choix de licence.

Ordre : **correctifs → achat indépendant → reprise → modèle IA → interface → campagne Testnet → vidéo**.

## Définition de terminé

- [ ] Un développeur suit le guide depuis un dossier vierge.
- [ ] L'agent utilise réellement les outils, hors du dashboard.
- [ ] La panne intervient au point annoncé après paiement.
- [ ] Le résultat est récupéré et l'agent termine sa tâche.
- [ ] Les preuves établissent le règlement attendu et l'autorisation initiale réutilisée.
- [ ] Les états incertains et les erreurs ne provoquent pas de nouvel achat automatique.
- [ ] Le rapport distingue simulation, archives et exécution Testnet.
- [ ] La vidéo et les fichiers distribués ne contiennent aucun secret.
