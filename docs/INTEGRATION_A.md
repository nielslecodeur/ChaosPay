# Intégrer ChaosPay à une API existante

## Ce qui est livré

Le kit est empaquetable en archive npm locale. Une API de vérification arithmétique de factures le consomme par son nom de package, sans import relatif vers le dépôt. La validation l'installe dans un dossier temporaire hors du dépôt, compile un consommateur TypeScript et teste de vrais paiements Testnet.

Cette API est écrite par notre équipe : ce n'est pas un pilote chez un client externe. Il reste à faire suivre ce guide par un autre développeur et recueillir ses difficultés.

## Préparer le paquet

Depuis la racine, avec Node 24 et les dépendances installées :

```powershell
npm run build:recovery
New-Item -ItemType Directory -Force .local/packages
npm pack ./packages/recovery --pack-destination .local/packages
```

Le paquet est .local/packages/chaospay-recovery-0.1.0.tgz. Il contient le JavaScript compilé, les déclarations TypeScript et les modules de preuve/observation nécessaires. Pas de sources d'application, de clés ou de base SQLite.

Dans votre application Express :

```sh
npm install /chemin/vers/chaospay-recovery-0.1.0.tgz express@5.3.0
```

Pour TypeScript : installer aussi typescript, @types/node et @types/express en dépendances de développement.

Aucune publication npm n'est faite. Le package reste private et UNLICENSED tant que la licence du projet n'est pas choisie.

## Monter les routes

```js
import express from "express";
import { createPaidRouter } from "@chaospay/recovery/stellar-http";

const app = express();
app.get("/catalog", (_, res) => res.json({ services: ["mon-service"] }));

const paid = await createPaidRouter({
  serviceId: "mon-service",
  port: 3004,
  basePath: "/paid",
  databasePath: "./.local/purchases.sqlite",
  description: "Mon service sur Stellar Testnet",
  validate: body => {
    if (typeof body?.text !== "string") throw new Error("Invalid input");
    return body.text;
  },
  produce: text => ({ length: text.length }),
});

app.use("/paid", paid.router);
const server = app.listen(3004, "127.0.0.1");
server.once("close", paid.close);
```

Le port et basePath doivent correspondre à l'adresse réellement exposée. Ce premier adaptateur reste limité à HTTP loopback ; ne pas le placer derrière une URL publique.

Routes montées :
- POST /paid/purchases/:id?mode=durable : challenge 402, puis achat signé.
- POST /paid/purchases/:id/ack?mode=durable : accusé après vérification du résultat.
- GET /paid/reports/:id?mode=durable : preuves et verdict.
- GET /paid/health : santé du composant.

Les routes existantes de votre API restent disponibles. Choisir un serviceId stable, sans deux-points, et conserver son journal.

## Configuration Stellar

Le marchand utilise MERCHANT_ADDRESS (clé publique du bénéficiaire), FACILITATOR_URL (par défaut http://127.0.0.1:4022), et facultativement PAYMENT_AMOUNT_ATOMIC et TOKEN_CONTRACT. Le client payeur et le facilitator ont leurs propres clés ; le marchand n'en a pas besoin.

Ce kit dépend du facilitator de démonstration ChaosPay pour les reçus durables. Il n'est pas encore compatible avec un facilitator arbitraire. Suivre SETUP_A.md pour les comptes et lancer npm run dev:facilitator avant votre API.

Le paiement est en XLM natif sur Stellar Testnet. Dans notre exemple, il achète une vérification de calcul ; il ne règle pas la facture.

## Règles de reprise

Le client sauvegarde l'identifiant, le corps et l'autorisation avant envoi. Après une interruption ou HTTP 202, il renvoie exactement ces données. Il vérifie SHA-256(JSON.stringify(result)) contre resultHash avant de poster l'accusé.

produce doit être déterministe et sans effet externe non idempotent. Après un crash entre production et sauvegarde, le kit peut rappeler cette fonction. Une livraison, un email ou un virement supplémentaire doit avoir sa propre protection.

Une réponse de soumission n'est pas une confirmation finale : la documentation Stellar distingue la soumission et la consultation du résultat. [Guide officiel](https://developers.stellar.org/docs/build/guides/transactions/submit-transaction-wait-js)

Le kit conserve UNKNOWN en l'absence de preuve suffisante. Un reçu absent ne déclenche pas de nouvelle autorisation. Une panne après revendication de soumission et avant appel réseau peut nécessiter une intervention manuelle. Ne pas promettre une reprise automatique dans tous les cas.

## Tester une panne

Les hooks sont désactivés par défaut dans createPaidRouter. Pour un test local, passer enableFaults: true. L'exemple accepte CHAOSPAY_ENABLE_FAULTS=1. Un hook désactivé est rejeté avec HTTP 403 avant création de l'achat.

Les deux applications historiques utilisent createPaidService, qui garde les hooks activés pour le laboratoire. Ne pas confondre ce wrapper de démo avec une configuration de production.

## Validation reproductible

Depuis la racine du dépôt :

```sh
npm run verify:integration
```

La commande :
1. Compile et empaquette le kit.
2. Installe l'archive dans un nouveau dossier temporaire, sans résolution vers le node_modules du dépôt.
3. Exécute les tests métier et le contrôle TypeScript de l'application consommatrice.
4. Vérifie que /catalog reste accessible et qu'une entrée invalide est rejetée avant paiement.
5. Vérifie le refus des hooks lorsque désactivés.
6. Exécute sans panne, réponse perdue, crash et confirmation indisponible.
7. Vérifie UNKNOWN avant reprise, un seul transfert exact après reprise, le contenu du résultat, l'accusé et le conflit sur corps modifié.
8. Écrit evidence/public/integration-a.json.

Les autorisations restent dans .local/integration-authorizations/ et le journal du consommateur dans le dossier temporaire dont le chemin est affiché. Les serveurs lancés par le script sont arrêtés. Conserver ces fichiers pour une éventuelle réconciliation.

## Prochaine validation humaine

Donner uniquement l'archive, ce guide et les paramètres Testnet à une équipe volontaire. Observer les étapes bloquantes, mesurer le temps d'intégration et lui faire rejouer les trois pannes sur son propre service. Aucune validation externe n'est revendiquée avant cet essai.

## Raven

Raven est configuré à https://raven.stellar.org/mcp, mais ses outils n'étaient pas disponibles dans la session ayant préparé cette intégration. L'appel direct initialize a renvoyé HTTP 401. Aucune revue Raven n'a été obtenue ; les vérifications reposent sur les SDK installés, la documentation Stellar et les tests.

Quand Raven sera accessible, lui demander de revoir les états après soumission incertaine, les preuves de transfert et les limites de rétention RPC. Ne transmettre ni clés, ni signatures payables, ni .env.
