# Installer ChaosPay dans une API indépendante

Ce guide utilise une archive locale, Node 24 et PowerShell sous Windows. Aucune publication npm ni inscription n'est nécessaire. Le résultat visé : acheter une vérification de facture, perdre la réponse, puis récupérer le résultat avec le même paiement.

L'application est un exemple de notre équipe. Son installation hors du dépôt démontre l'indépendance technique du paquet, pas une adoption par un client externe.

## 1. Préparer l'archive et le réseau

Dans le dépôt ChaosPay à jour :

```powershell
npm ci
npm run setup:testnet
npm run check:connections
New-Item -ItemType Directory -Force .local/packages
npm pack ./packages/recovery --pack-destination .local/packages
$sourceRoot = (Get-Location).Path
```

Si .env existe déjà et que check:connections réussit, réutiliser cette configuration au lieu de recréer les comptes. Les XLM de Testnet n'ont pas de valeur réelle.

Le paquet est .local/packages/chaospay-recovery-0.1.0.tgz. npm pack compile automatiquement le JavaScript et les types. Les clés restent dans .env et ne sont pas incluses.

## 2. Créer un dossier vierge et installer

Dans le même terminal :

```powershell
$consumerRoot = Join-Path $env:TEMP ("chaospay-guide-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $consumerRoot
Set-Location $consumerRoot
New-Item -ItemType Directory vendor
Copy-Item -LiteralPath "$sourceRoot/.local/packages/chaospay-recovery-0.1.0.tgz" -Destination vendor
npm init -y
npm pkg set type=module
npm install ./vendor/chaospay-recovery-0.1.0.tgz express@5.3.0 @x402/core@2.23.0 @x402/stellar@2.23.0 @stellar/stellar-sdk@16.4.1
Copy-Item -LiteralPath "$sourceRoot/examples/invoice-check-api/server.mjs" -Destination .
Copy-Item -LiteralPath "$sourceRoot/examples/invoice-check-api/domain.mjs" -Destination .
Copy-Item -LiteralPath "$sourceRoot/docs/quickstart/client.mjs" -Destination .
@(".env*", ".local/", "node_modules/", "vendor/") | Set-Content .gitignore
```

Les deux premiers fichiers contiennent seulement l'API consommatrice et son traitement métier ; le marchand de démonstration n'est pas copié. Les imports du serveur passent par @chaospay/recovery/stellar-http. Les dépendances x402 supplémentaires servent au client de démonstration.

Noter les chemins $sourceRoot et $consumerRoot : les variables ne sont pas partagées entre les terminaux.

## 3. Configurer les rôles

Créer deux fichiers UTF-8 dans le dossier indépendant en remplaçant les valeurs indiquées.

.env.merchant :

```dotenv
MERCHANT_ADDRESS=ADRESSE_PUBLIQUE_DU_MARCHAND
PAYMENT_AMOUNT_ATOMIC=100000
FACILITATOR_URL=http://127.0.0.1:4022
CHAOSPAY_ENABLE_FAULTS=1
```

.env.client :

```dotenv
MERCHANT_ADDRESS=LA_MEME_ADRESSE_PUBLIQUE
PAYMENT_AMOUNT_ATOMIC=100000
BUYER_SECRET=CLE_SECRETE_DU_COMPTE_PAYEUR_TESTNET
```

Utiliser MERCHANT_ADDRESS et BUYER_SECRET générés dans le .env du dépôt. Si le prix a été personnalisé, utiliser exactement le même montant dans les deux fichiers et dans le facilitator.

Ne pas copier la clé du payeur dans le fichier marchand. Le client signe ; le marchand reçoit une autorisation. Les fichiers .env et .local ne doivent pas être publiés.

Le paramètre CHAOSPAY_ENABLE_FAULTS active les pannes uniquement pour cet essai local. Sans ce paramètre, une requête demandant une panne est rejetée avec HTTP 403.

## 4. Démarrer les services

**Terminal 1, dans le dépôt ChaosPay :**

```powershell
npm run dev:facilitator
```

**Terminal 2, dans le dossier indépendant :**

```powershell
node --env-file=.env.merchant server.mjs
```

L'API écoute sur http://127.0.0.1:3004. /catalog reste une route métier ordinaire ; /paid contient les routes de paiement et de reprise.

Le facilitator doit rester disponible. Cette version dépend de ses reçus durables ; installer le paquet ne suffit pas à remplacer ce composant.

## 5. Effectuer le premier achat

**Terminal 3, dans le dossier indépendant :**

```powershell
$purchase = "normal-" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
node --env-file=.env.client client.mjs $purchase none
```

Le client demande le prix, vérifie le réseau, le bénéficiaire, l'actif et le montant, sauvegarde une autorisation, paie, vérifie le résultat et accuse sa réception.

Résultat attendu : PASS, une transaction et un total calculé de 2500 unités monétaires de facture. Ce montant de facture est distinct du prix du service, ici 100000 unités atomiques de XLM Testnet (0,01 XLM).

La sortie affiche le résultat et le hash de transaction, jamais la clé ou l'autorisation. Le rapport est conservé dans .local/report-<identifiant>.json.

## 6. Perdre la réponse et reprendre le même achat

Dans le terminal 3 :

```powershell
$purchase = "drop-" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
node --env-file=.env.client client.mjs $purchase drop
node --env-file=.env.client client.mjs $purchase none
```

Le premier appel se termine volontairement avec le code 2 et un message de réponse indisponible. Le second affiche « Original authorization reused », puis PASS et une seule transaction.

Ne pas changer $purchase entre les deux appels. Ne pas supprimer .local/client-<identifiant>.json. Un nouvel identifiant représente un nouvel achat et peut entraîner un nouveau paiement.

## 7. Tester les autres pannes

**Crash :** lancer le client avec un nouvel identifiant et crash. Le terminal 2 s'arrête avec le code 86. Redémarrer exactement le même serveur, depuis le même dossier et avec le même journal, puis relancer le même identifiant avec none.

**Confirmation inaccessible :** lancer avec un nouvel identifiant et confirmation-lost. Le client retourne UNKNOWN avec le code 2. Attendre quelques secondes puis reprendre le même identifiant avec none. Si HTTP 202 persiste, attendre et répéter ; ne pas recréer d'autorisation.

Pour consulter l'état avant reprise :

```powershell
Invoke-RestMethod "http://127.0.0.1:3004/paid/reports/$purchase"
```

UNKNOWN indique une preuve ou un accusé manquant. Cela ne prouve pas l'absence de paiement.

## 8. Brancher votre propre traitement

Dans server.mjs, createPaidRouter reçoit validate et produce importés depuis domain.mjs. Remplacer ces deux fonctions par la validation et le traitement de votre service. Conserver un serviceId stable et un databasePath durable ; adapter port et basePath au montage réel.

produce doit retourner une valeur JSON et pouvoir être rappelé sans dommage. Un crash avant sauvegarde peut répéter cette fonction : emails, livraisons et autres effets externes demandent leur propre idempotence.

Le kit conserve le paiement et le résultat, mais ne garantit pas la résolution automatique de toute interruption. Une soumission incertaine sans reçu peut rester UNKNOWN.

## Dépannage

| Symptôme | Vérification |
| --- | --- |
| Module introuvable | Installer l'archive depuis le dossier indépendant ; vérifier son nom et type=module. |
| Échec au démarrage | Node 24, paramètres publics valides et facilitator actif sur 4022. |
| Port occupé | Arrêter les autres serveurs manuels sur 3004 ; ne pas lancer la campagne automatique en parallèle. |
| HTTP 403 | Activer les hooks pour cet essai, puis redémarrer le serveur. |
| HTTP 409 | Reprendre avec le même contenu, identifiant et fichier d'autorisation. |
| Code 2 / UNKNOWN | Préserver les fichiers, attendre ou redémarrer le serveur selon la panne, puis réessayer le même achat. |
| Solde insuffisant / réseau réinitialisé | Revoir la configuration Testnet ; ne pas effacer les preuves pour masquer l'état d'un ancien achat. |

## Validation et limites

[Retours de répétition du guide](QUICKSTART_REVIEW.md) décrit l'essai effectué par l'agent dans un dossier vierge. Cela ne remplace pas un essai autonome par un autre développeur.

Les quatre scénarios de référence A sont visibles comme archives dans le dashboard. Ils ne déclenchent pas une nouvelle exécution. La troisième API n'est pas ajoutée au sélecteur interactif.

Le client fourni est un script pédagogique pour ce guide ; aucun package client pour agents n'est distribué. La publication npm, la licence et la disponibilité du nom restent des décisions ultérieures.
