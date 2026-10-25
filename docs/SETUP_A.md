# Démarrer le périmètre A

Le moteur fonctionne sans compte bancaire, clé OpenAI, API d'IA ni contrat Rust à déployer.

## Prérequis

Node.js 24 et npm. pnpm n'est pas nécessaire. Depuis la racine hackmeridian_tristana :

```sh
npm ci
npm run setup:testnet
npm run check:connections
```

Le setup crée trois comptes dédiés et utilise Friendbot pour leurs XLM de test. Il écrit les clés dans .env et .local/, ignorés par Git. Il ne remplace pas un .env existant. Ne partagez pas ces fichiers : chaque développeur exécute le setup sur son poste.

Le prix est 100000 unités atomiques, soit 0,01 XLM (7 décimales), sans valeur réelle. Le MVP ne prend en charge que le contrat natif XLM Testnet. Il ne s'agit pas d'USDC.

## Connexions API

- RPC : https://soroban-testnet.stellar.org ; sans clé dans cette configuration.
- Horizon : https://horizon-testnet.stellar.org ; lecture des comptes, sans clé.
- Friendbot : https://friendbot.stellar.org ; distribution gratuite de XLM Testnet.
- Facilitator : notre processus local, http://127.0.0.1:4022 ; signe et soumet le paiement.
- Marchand : http://127.0.0.1:3001 ; conversion JSON vers CSV.

La passphrase du RPC est vérifiée avant le lancement du marchand. Le code rejette les autres réseaux et actifs.

Si Friendbot échoue après la création du .env, ne supprimez pas les clés : les adresses publiques sont affichées dans le setup et dans le contrôle des connexions. Financez le compte manquant via Stellar Lab en Testnet, puis relancez le contrôle.

## Lancer le moteur

Terminal 1 :

```sh
npm run dev:facilitator
```

Terminal 2 :

```sh
npm run dev:merchant
```

Terminal 3 :

```sh
npm run smoke:payment -- mon-achat durable none
```

Réutiliser exactement cet identifiant réutilise aussi le payload original sauvegardé localement. Le résultat et le transfert décodé sont affichés ; le rapport est écrit dans .local/. Un accusé du client confirme qu'il a reçu le CSV attendu.

## Démontrer la panne

```sh
npm run smoke:payment -- demo-coupure durable drop
npm run smoke:payment -- demo-coupure durable none
```

Le premier appel est volontairement interrompu, code de sortie 2. Le second retrouve le résultat et le même hash de transaction, sans second règlement.

Pour un crash, utiliser un nouvel identifiant et le défaut crash ; le marchand quitte avec le code 86. Relancer npm run dev:merchant, puis reprendre avec le même identifiant et le défaut none.

Le client conserve les autorisations dans .local/ ; ne les publiez pas.

## Vérification complète

Arrêter les deux serveurs manuels avant la campagne :

```sh
npm run typecheck
npm test
npm run verify:engine
```

La campagne lance ses propres serveurs, teste coupure, crash, concurrence, mode naïf et redémarrage des deux serveurs. Elle écrit un rapport sans clés dans evidence/public/. Elle utilise réellement Testnet et nécessite une connexion réseau.

## Agent IA et Raven

Le client de paiement est un script déterministe. Aucun agent LLM ne décide des paiements : aucune clé OpenAI, Anthropic ou autre n'est nécessaire.

Raven est un MCP d'aide au développement déjà ajouté dans Codex ; il reste séparé du moteur. Sa présence n'est pas requise pour lancer ou tester ChaosPay. Les connexions des outils IA sont propres à chaque développeur.

## À transmettre à l'IA B

Lire docs/ENGINE_API.md pour les routes et les rapports. Le serveur est local et ne configure pas de CORS : utiliser le backend du runner ou un proxy Vite local. Ne jamais intégrer les clés du .env à un bundle navigateur.

## Limites

Fixture locale, un actif, un service déterministe et deux modes pédagogiques. Le rapport prouve les transferts observés et un accusé applicatif du résultat ; il ne prouve pas qu'un humain a lu le fichier. Un RPC indisponible produit UNKNOWN. Les SDK et le stockage ne rendent pas SQLite et Stellar atomiques.

SQLite natif de Node émet un avertissement expérimental sur le runtime vérifié. Les dépendances x402 ont un avis npm transitoire concernant Zod, décrit dans docs/versions.md. Ne pas exposer ce laboratoire sur Internet ni utiliser de fonds réels.

## Dashboard et kit partagé

Après configuration Testnet, lancer npm run dev:dashboard et ouvrir http://127.0.0.1:3002. Arrêter les serveurs manuels avant une expérience TESTNET. Le runner gère les deux API. npm run verify:dashboard lance la campagne complète ; voir [RECOVERY_KIT.md](RECOVERY_KIT.md).
