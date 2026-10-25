# Contrat A/B — distribution locale du package serveur

## Décision et base commune

Objectif : installer ChaosPay dans une API indépendante à partir d'une archive npm locale, puis valider la reprise avant d'envisager une publication.

Base commune : `8d33eaa`, disponible sur `feat/integration-a`. A poursuit les vérifications sur `feat/package-validation-a`. B crée sa branche depuis la base commune et pourra intégrer le commit de validation A une fois partagé.

Aucune publication npm dans cette étape. `private: true` et `license: UNLICENSED` sont conservés. Le nom est provisoire ; sa disponibilité n'est pas revendiquée.

## Propriété des fichiers

| A | B |
| --- | --- |
| packages/recovery/, build, exports et archive | Dashboard et présentation des bilans |
| examples/invoice-check-api/ | Guide de démarrage et retours d'essai |
| scripts/verify-integration.ts et preuves Testnet | docs/demo.md et présentation de deux minutes |

Coordonner les modifications du runner, des types de rapports et de package.json racine. Le package client pour agents reste hors de cette étape.

## Interface publique disponible pour B

| Import public | Usage |
| --- | --- |
| @chaospay/recovery | RecoveryKit, Store, RecoveryError, FaultTriggered, faults et types associés |
| @chaospay/recovery/stellar-http | createPaidRouter, createPaidService et PaidService |
| @chaospay/recovery/evidence | digest, verdict, matches et types de preuves |

Le consommateur importe uniquement ces points d'entrée. Aucun import vers une application de démo n'est nécessaire. L'archive contient le JavaScript compilé et les déclarations TypeScript ; elle embarque les modules internes de preuve et d'observation nécessaires.

La compilation des sources se fait dans le dépôt de développement. L'installation et l'exécution du paquet compilé se font hors du dépôt.

### Intégration recommandée

Utiliser createPaidRouter dans une API Express existante. Les paramètres sont :

- serviceId : identifiant stable, alphanumérique, tirets ou underscores ;
- port et basePath : adresse loopback et chemin correspondant au montage réel ;
- databasePath : chemin durable du journal SQLite ;
- description : description du service acheté ;
- validate : validation et normalisation de l'entrée avant paiement ;
- produce : traitement métier retournant un résultat JSON ;
- enableFaults : false par défaut ; true uniquement pour les essais contrôlés.

La fonction retourne router et close. Monter router sur basePath et appeler close après fermeture du serveur.

createPaidService reste le wrapper des démonstrations existantes : il démarre son propre serveur et active les hooks par défaut. Il ne remplace pas l'exemple minimal d'intégration.

Exemple complet : [server.mjs](../examples/invoice-check-api/server.mjs).
Fonction métier indépendante : [domain.mjs](../examples/invoice-check-api/domain.mjs).

### Configuration et obligations

Node 24+, Express 5, Stellar Testnet et XLM natif. Le facilitator ChaosPay doit être démarré séparément : ses reçus durables sont nécessaires. Le paquet ne rend pas ce composant facultatif.

Le marchand reçoit l'adresse publique du bénéficiaire et l'URL du facilitator. Le client de test et le facilitator ont leurs propres secrets. Ne pas demander au marchand de conserver la clé du payeur.

Le client doit conserver l'identifiant, le corps et le payload signés originaux. La reprise utilise la même autorisation. Il vérifie digest(result), puis accuse la réception du résultat.

produce peut être rappelé après un crash avant sauvegarde. Les effets externes doivent avoir leur propre idempotence. Conserver les journaux ; un état inconnu ne prouve pas l'absence de paiement.

## Archive et validation A

Depuis la racine :

```powershell
npm ci
New-Item -ItemType Directory -Force .local/packages
npm pack ./packages/recovery --pack-destination .local/packages
npm run verify:integration
```

npm pack déclenche prepack : nettoyage du seul dossier dist généré du package, compilation JavaScript et types. Une compilation échouée interrompt la création de l'archive.

verify:integration :
1. Exécute npm pack, sans dépendre d'une compilation manuelle préalable.
2. Vérifie les fichiers distribués et les exports.
3. Installe l'archive dans un dossier temporaire hors du dépôt.
4. Vérifie le consommateur TypeScript et les tests métier.
5. Vérifie les quatre scénarios Testnet.
6. Conserve les rapports avant/après, une autorisation par achat, sa réutilisation et un transfert exact.
7. Enregistre l'empreinte SHA-256 et l'intégrité npm de l'archive.

Ce test automatisé n'est pas une validation de compréhension du guide par un développeur extérieur.

## Contrat de rapport pour B

Le fichier evidence/public/integration-a.json conserve :

| Champ | Signification |
| --- | --- |
| simulated | false pour cette campagne Testnet |
| executedAt | Date de la campagne |
| integration, scope | Nom et périmètre exact de la validation |
| package | Nom et version du package testé |
| archiveSha256, archiveIntegrity | Identité de l'archive installée |
| publicExports | Points d'entrée vérifiés |
| scenarios | baseline, drop, crash, confirmation-lost |
| scenarios[].authorizationCount | Doit valoir 1 |
| scenarios[].originalAuthorizationReused | Vérification du même payload à chaque requête signée |
| scenarios[].purchaseRequests | Nombre d'appels d'achat, y compris essais négatifs |
| scenarios[].before | Rapport UNKNOWN avant reprise, ou null pour baseline |
| scenarios[].after | Rapport final avec transfert exact et résultat accusé |
| reports | Rapports finaux indexés par purchaseId, pour les archives existantes |

Les champs PurchaseReport restent ceux de ENGINE_API.md : montants atomiques sous forme de chaînes, transferts observés, responseRecovered, verdict et mesures serveur. Aucun secret ni payload payable n'entre dans les preuves publiques.

La troisième API n'est pas encore un choix interactif du runner. B peut présenter les rapports comme archives, en indiquant leur provenance ; ne pas afficher un bouton d'exécution de cette API avant raccordement explicite au runner.

## Livrable B attendu

À partir de ce contrat, rédiger et tester un guide de démarrage depuis un dossier vierge : installation de l'archive, configuration, branchement métier, premier achat et reprise. Noter les commandes ambiguës, les prérequis manquants et l'aide demandée ; ne pas présenter une procédure automatisée comme un retour utilisateur indépendant.

Préparer deux minutes de démonstration : installation hors dépôt, achat, panne, récupération, preuve d'un règlement unique. Les données fictives et les archives restent identifiées.

## Conditions avant publication

La publication nécessite une décision séparée : licence, nom et droits sur le scope npm, version, inspection de l'archive et validation par un autre développeur. Les dépendances et les limites connues doivent être revues à cette étape.

Le critère commun reste : un développeur installe l'archive et récupère un achat après une panne avec le guide, sans importer les fichiers internes du dépôt ni recopier le marchand.
