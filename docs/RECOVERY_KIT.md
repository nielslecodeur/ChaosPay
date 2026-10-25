# Kit de reprise

Le kit source TypeScript est dans `packages/recovery/src/`. Il est intégré à deux applications : conversion JSON vers CSV et génération de reçus JSON. Il n'est pas encore publié sur npm. Une archive installable et un routeur Express intégrable sont maintenant disponibles ; voir [INTEGRATION_A.md](INTEGRATION_A.md).

## Lancer la démonstration

```sh
npm ci
npm run setup:testnet
npm run check:connections
npm run dev:dashboard
```

Ouvrir http://127.0.0.1:3002. Choisir CSV ou reçus JSON, puis TESTNET et un scénario. Arrêter les serveurs manuels avant de lancer une expérience : le runner gère ses processus.

Le paiement achète la génération du reçu, pas le règlement de la facture qui y figure. La seconde API est une intégration interne, pas un client externe validé.

## Intégrer un service

`RecoveryKit<P,I,O>` prend un Store SQLite, un PaymentGateway, un serviceId, les termes du paiement et une fonction produce. Le gateway fournit verify, settle, receipt et observe. Le cœur ne dépend pas d'Express ni du SDK Stellar.

L'adaptateur `stellar-http.ts` fournit les routes x402 de démonstration sur Stellar Testnet. Exemple complet : `apps/receipt-api/src/server.ts`.

1. Valider l'entrée avant de demander le paiement.
2. Définir un serviceId stable et un fichier SQLite durable.
3. Fournir une fonction produce déterministe dont le résultat est sérialisable en JSON.
4. Conserver côté client le corps, l'identifiant et l'autorisation originaux avant le premier envoi.
5. Vérifier resultHash (SHA-256 de JSON.stringify(result)), puis envoyer l'accusé.
6. Après interruption ou HTTP 202, reprendre avec exactement les mêmes données.

La génération peut être rejouée après un crash avant sauvegarde du résultat. Elle ne doit pas déclencher un effet externe non idempotent. Ce kit ne garantit pas l'exécution unique d'un email, d'une livraison ou d'une autre opération externe.

## Points de panne

| Scénario | Point d'interruption | Reprise |
| --- | --- | --- |
| before-submit | Achat PREPARED enregistré, avant appel au facilitator | Soumission de l'autorisation originale |
| confirmation-lost | Demande acceptée dans le journal du facilitator, confirmation masquée | HTTP 202 UNKNOWN puis consultation du reçu et du RPC |
| crash | Transfert confirmé, avant production/sauvegarde du résultat | Redémarrage du service |
| drop | Résultat sauvegardé, avant réponse HTTP | Restitution du résultat sauvegardé |
| ack-lost | Résultat reçu par le runner, accusé volontairement omis | Restitution puis accusé |
| concurrent | Deux appels simultanés avec la même autorisation | Une seule revendication de soumission |
| comparison | Réponse perdue en mode durable et en mode naïf | Le mode naïf crée volontairement une seconde autorisation |

Le scénario confirmation-lost ne simule pas une panne du réseau Stellar. Il masque la confirmation d'une soumission asynchrone au facilitator ; le broadcast peut encore être en cours. Aucun PASS n'est accepté avant observation du transfert et accusé.

Une panne après la revendication SUBMITTING mais avant l'appel réseau peut rester UNKNOWN sans reçu. L'absence de reçu ne prouve pas l'absence de paiement : pas de nouvelle soumission automatique. La disponibilité est sacrifiée à cette prudence.

## Rapports

Le runner conserve `checkpoints` avant reprise et `reports` après reprise. L'export contient uniquement des rapports filtrés, des identifiants et la timeline ; ni clés, ni signatures, ni corps applicatifs.

- `serviceId` : intégration testée.
- `recoveryMs` : durée locale entre la première interruption enregistrée et l'accusé reçu ; null sans interruption mesurée ou sans accusé. Inclut le redémarrage et l'attente du runner ; ce n'est pas la latence réseau seule.
- `unknownObservations` : nombre de retours UNKNOWN enregistrés par execute, pas le nombre total de lectures RPC ni de rapports UNKNOWN.
- `responseRecovered` : accusé reçu, pas preuve de lecture humaine.
- `PASS` : transfert attendu observé et résultat accusé.
- `UNKNOWN` : preuve incomplète ou accusé manquant.
- `FAIL` : invariant contredit, notamment deux paiements confirmés pour un achat.

La comparaison porte sur deux exécutions contrôlées (fixture naïve / reprise durable), pas sur une correction automatiquement appliquée à une application externe.

## Validation reproductible

```sh
npm run typecheck
npm test
npm run verify:dashboard
```

La dernière commande exécute huit scénarios sur chacune des deux applications et écrit `evidence/public/recovery-campaign.json`. Elle utilise exclusivement des fonds Testnet. Ne pas lancer les tests HTTP et la campagne simultanément : ils utilisent le port 3002.

Les bases CSV existantes sont migrées à l'ouverture : clés préfixées par csv et résultats encodés en JSON, sans effacer les autorisations ni les paiements. Conserver .env et .local ; ne jamais les pousser.

## Limites

Testnet, actif XLM natif, services locaux, journal SQLite, hooks explicites et un facilitator de démonstration. Le kit peut être installé depuis une archive npm locale et a un consommateur isolé. Il reste à choisir sa licence, préparer sa publication et l'essayer chez une équipe externe. La signature de paiement protège l'autorisation Stellar ; l'association au service et au corps est contrôlée localement par le journal, ce qui ne constitue pas une liaison cryptographique générale des données métier.
