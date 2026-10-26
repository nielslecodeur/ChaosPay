# Versions et provenance

## Vérifié pendant cette implémentation

- Node.js : v24.12.0
- npm : 11.6.2
- @stellar/stellar-sdk : 16.4.1
- @x402/core et @x402/stellar : 2.23.0
- Express : 5.3.0
- Versions exactes restantes dans package.json et package-lock.json ; installation reproductible avec npm ci.

Le SDK 16.4.1 correspond à celui embarqué par @x402/stellar 2.23.0. Le SDK 17.0.1 emploie un nouveau format XDR ; il n'a pas été conservé afin d'éviter deux modèles incompatibles.

## Source étudiée

https://github.com/stellar/x402-stellar
SHA : 953caa5da960a7499b58a784359d23cfb3504a83

Le facilitator et le serveur utilisent les API et le schéma exact du projet officiel. Les ajouts propres à ChaosPay sont les journaux SQLite, le hash persisté avant broadcast, la reprise, les défauts contrôlés, le rapprochement et les tests. Voir THIRD_PARTY_NOTICES.md.

## Réseau

stellar:testnet ; passphrase : Test SDF Network ; September 2015.
RPC : https://soroban-testnet.stellar.org
Horizon : https://horizon-testnet.stellar.org

Actif : XLM natif via SAC ; contrat dérivé avec Asset.native().contractId(Networks.TESTNET).
Prix : 100000 unités atomiques (0,01 XLM). Frais payés par le facilitator, distincts du prix.

## Dépendances : limite connue

npm audit signale un avis élevé sur Zod, propagé à @x402/core et @x402/stellar : GHSA-mrhx-c7xc-m3w5, épuisement mémoire sur collections surdimensionnées. Le SDK core déclare Zod ^3.24.2 ; l'audit ne propose pas de correction compatible automatique. Le laboratoire limite la taille des requêtes et écoute uniquement sur 127.0.0.1. Pas de remplacement forcé par une version majeure sans validation.

Vérification répétée avec `npm ls zod --depth=4` : Zod 3.25.76. `npm audit --omit=dev` signale toujours le même avis HIGH et n'offre pas de correction. La limite JSON à 64 KB et l'écoute loopback réduisent l'exposition du laboratoire, mais ne corrigent pas la dépendance vulnérable. Recontrôler avant une publication ou une mise à jour : `npm audit`. Ce code n'est pas déclaré prêt pour la production.
