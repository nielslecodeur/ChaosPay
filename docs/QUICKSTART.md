# Installer le kit dans une API séparée

Ce guide utilise `@chaospay/recovery@0.1.0` livré sous forme d’archive locale. Le nom npm n’est pas une publication : ne pas lancer `npm install @chaospay/recovery` depuis le registre. Le package reste `private` et `UNLICENSED` ; la licence et la publication restent à décider.

Objectif : installer le kit hors du dépôt, conserver les routes d’une API de vérification de factures, puis vérifier la reprise d’un achat. L’exemple est écrit par notre équipe ; une installation isolée n’est pas une adoption par une équipe extérieure.

## 1. Prérequis et préparation

Les commandes ci-dessous sont pour **PowerShell**, avec **Node 24** et npm. Vérifier `node --version`. Réseau nécessaire : registre npm, RPC Stellar Testnet et, pour la création des comptes, Friendbot/Horizon.

Dans le dépôt ChaosPay :

```powershell
npm ci
# Seulement si le .env n’existe pas encore :
npm run setup:testnet
npm run check:connections
```

Si `.env` existe, conserver ce fichier et passer directement au contrôle des connexions. Il contient les clés du client payeur et du facilitator. Ne pas le transmettre avec le package. Les paiements utilisent des XLM Testnet, sans valeur réelle.

## 2. Construire l’archive

Toujours depuis le dépôt :

```powershell
$taskRepo = (Get-Location).Path
npm run build:recovery
New-Item -ItemType Directory -Force .local/packages | Out-Null
npm pack ./packages/recovery --pack-destination .local/packages --json
```

Résultat attendu : `.local/packages/chaospay-recovery-0.1.0.tgz`. Examiner la liste retournée par npm : seuls `dist/`, `README.md` et `package.json` doivent être présents. Les déclarations TypeScript sont incluses ; ni `.env`, ni SQLite, ni application marchande ne doivent entrer dans l’archive.

## 3. Installer dans un dossier vierge

Dans **le même terminal**, pour conserver `$taskRepo` :

```powershell
$consumerB = Join-Path ([System.IO.Path]::GetTempPath()) ('chaospay-guide-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $consumerB | Out-Null
Get-ChildItem -LiteralPath (Join-Path $taskRepo 'examples/invoice-check-api') -File |
  Copy-Item -Destination $consumerB
New-Item -ItemType Directory -Path (Join-Path $consumerB 'vendor') | Out-Null
Copy-Item -LiteralPath (Join-Path $taskRepo '.local/packages/chaospay-recovery-0.1.0.tgz') -Destination (Join-Path $consumerB 'vendor')
Set-Location $consumerB
npm install --ignore-scripts --no-audit --no-fund
npm test
npm run typecheck
node --input-type=module -e "console.log(import.meta.resolve('@chaospay/recovery'))"
```

Les tests métier et TypeScript doivent passer. La dernière commande doit afficher un chemin dans **le `node_modules` du nouveau dossier**, pas dans le dépôt ChaosPay. Le `package.json` de l’exemple installe l’archive depuis `vendor/`.

Le code métier est `domain.mjs`. L’intégration est dans `server.mjs` : import de `createPaidRouter` depuis `@chaospay/recovery/stellar-http`, montage sous `/paid`, et transmission de `validateInvoice` et `checkInvoice`. Aucun fichier du marchand CSV n’est copié.

## 4. Démarrer les services

Dans un **second terminal**, revenir au dépôt ChaosPay et lancer :

```powershell
npm run dev:facilitator
```

Le package utilise encore le facilitator de démonstration ChaosPay, avec ses reçus durables. L’application consommatrice est isolée, mais l’ensemble n’est pas autonome vis-à-vis de ce service. Aucun remplacement par un facilitator arbitraire n’est validé.

Dans le premier terminal, toujours dans `$consumerB`, créer une configuration contenant uniquement les valeurs publiques :

```powershell
Get-Content -LiteralPath (Join-Path $taskRepo '.env') |
  Where-Object { $_ -match '^(MERCHANT_ADDRESS|FACILITATOR_URL|PAYMENT_AMOUNT_ATOMIC|TOKEN_CONTRACT)=' } |
  Set-Content -LiteralPath .env.public -Encoding ascii
node --env-file=.env.public server.mjs
```

L’API doit annoncer `http://127.0.0.1:3004`. Elle n’a pas besoin des clés privées du client ou du facilitator. Les hooks de panne restent désactivés par défaut.

Dans un troisième terminal :

```powershell
Invoke-RestMethod http://127.0.0.1:3004/catalog
Invoke-RestMethod http://127.0.0.1:3004/paid/health
```

Attendu : le catalogue existant reste disponible et la route payante indique `serviceId: invoice-check`, réseau Testnet et prix atomique.

## 5. Comprendre le branchement dans sa propre API

La même intégration s’applique à un traitement existant :

```javascript
import express from 'express';
import { createPaidRouter } from '@chaospay/recovery/stellar-http';

const app = express();
app.get('/catalog', (_, res) => res.json({ services: ['text-length'] }));
const paid = await createPaidRouter({
  serviceId: 'text-length',
  port: 3004,
  basePath: '/paid',
  databasePath: '.local/purchases.sqlite',
  description: 'Compter les caractères d’un texte',
  validate: body => {
    if (typeof body?.text !== 'string') throw new Error('Texte requis');
    return body.text;
  },
  produce: text => ({ length: text.length }),
});
app.use('/paid', paid.router);
const server = app.listen(3004, '127.0.0.1');
server.once('close', paid.close);
```

Utiliser un fichier `.mjs` ou un projet ESM. Le service, le port et le préfixe doivent être stables et correspondre à l’URL réellement appelée. L’adaptateur actuel ne prend en charge que HTTP local et Stellar Testnet.

`validate` rejette une entrée invalide avant paiement. `produce` calcule un résultat JSON déterministe. Cette fonction peut être rappelée après un crash : ne pas y déclencher un email, une livraison ou une autre action externe sans protection propre contre les doublons.

## 6. Premier achat et reprise : responsabilité du client

Un HTTP 402 est un prix proposé, **pas un paiement réussi**. Les routes de l’exemple sont :

| Action | Route |
| --- | --- |
| Demander puis payer | `POST /paid/purchases/:id?mode=durable` |
| Confirmer la réception | `POST /paid/purchases/:id/ack?mode=durable` |
| Lire le bilan | `GET /paid/reports/:id?mode=durable` |

Le client sauvegarde le corps, l’URL, l’identifiant et l’autorisation signée **avant** l’envoi. Après interruption ou HTTP 202, il réutilise exactement ces données, sans créer une nouvelle autorisation. Il vérifie `SHA-256(JSON.stringify(result)) === resultHash`, puis accuse réception avec `{ "resultHash": "…" }` et le `PAYMENT-SIGNATURE` original.

Il n’existe pas encore de package client autonome. Pour un premier achat reproductible, utiliser la campagne ci-dessous. `smoke:payment` et les deux choix du dashboard ciblent les exemples historiques : ils ne constituent pas un client générique pour cette troisième API.

## 7. Valider les paiements et les pannes

Arrêter avec Ctrl+C les deux services manuels sur **3004 et 4022**, puis revenir au dépôt :

```powershell
Set-Location $taskRepo
npm run verify:integration
```

Cette commande crée **un autre dossier vierge**, installe l’archive et gère ses propres serveurs. Elle effectue quatre achats Testnet : sans panne, réponse perdue, crash et confirmation inaccessible. Elle vérifie le contenu du résultat, les conflits sur entrée modifiée, l’accusé, UNKNOWN avant reprise et un seul règlement par achat.

Attendu : quatre lignes PASS et `evidence/public/integration-a.json`. Les autorisations privées restent dans `.local/integration-authorizations/`. Le chemin du journal consommateur est affiché à la fin : conserver ce dossier et les journaux du facilitator. Ne pas supprimer ni recréer les clés pour « réparer » une interruption.

Pour une panne manuelle, activer `CHAOSPAY_ENABLE_FAULTS=1` avant de lancer l’exemple. Un hook désactivé retourne 403 : c’est une protection attendue. Ne jamais exposer ce laboratoire sur Internet.

## En cas de blocage

| Symptôme | Vérification |
| --- | --- |
| Package introuvable | Installer le `.tgz` local ; compiler avant `npm pack`. |
| Erreur de syntaxe import / SQLite indisponible | Node 24, fichier `.mjs` ou projet ESM. |
| L’API ne démarre pas | Vérifier le facilitator, le RPC et `MERCHANT_ADDRESS`. L’initialisation les contacte. |
| Port occupé | Arrêter les serveurs manuels avant la campagne. Ne pas tuer un processus inconnu. |
| HTTP 402 | Étape normale du protocole ; il manque encore le paiement signé. |
| HTTP 409 | Identifiant réutilisé avec un autre corps, une autre autorisation ou ressource. Conserver l’achat original. |
| HTTP 202 / UNKNOWN | Attendre et réconcilier avec l’autorisation originale ; ne pas conclure « non payé ». |
| Aucun reçu après interruption de soumission | Intervention manuelle parfois nécessaire ; aucune reprise automatique universelle promise. |

Le bilan prouve des transferts observés et un accusé logiciel. Il ne prouve pas la lecture humaine, ni l’exécution unique de tout effet métier. Voir [contrat A](INTEGRATION_A.md), [kit et limites](RECOVERY_KIT.md) et [retour d’essai B](INTEGRATION_REVIEW_B.md).
