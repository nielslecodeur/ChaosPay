# ChaosPay — HackMeridian

[GitHub](https://github.com/nielslecodeur/Lumaid) · [Installation Windows, macOS et Linux](INSTALL.md)

Que devient un achat quand le paiement est confirmé mais que la réponse HTTP disparaît ?

ChaosPay est un laboratoire local de pannes et de reprise pour les applications payantes sur Stellar. Le moteur x402, le runner et le dashboard sont intégrés. Un kit de reprise partagé équipe deux API : conversion CSV et génération de reçus JSON. Les rapports comparent les preuves avant/après reprise et les modes naïf/durable.

## Démarrage

Prérequis : Node.js 24 et npm.

```sh
npm ci
npm run setup:testnet
npm run check:connections
```

Pour le dashboard, lancer npm run dev:dashboard, puis ouvrir http://127.0.0.1:3002. Choisir CSV ou reçus JSON, TESTNET et un scénario ; le runner gère ses serveurs.

Pour le client CLI seul, arrêter le dashboard, puis lancer npm run dev:facilitator dans un terminal et npm run dev:merchant dans un deuxième.

Dans un troisième :

```sh
npm run smoke:payment -- premier-achat durable none
```

Aucune clé d'API IA ou de prestataire financier nécessaire. Trois comptes dédiés sont financés gratuitement sur Testnet. Le paiement porte sur 0,01 XLM de test, sans valeur réelle. Les clés et journaux restent dans .env et .local/, ignorés par Git.

## Différenciation

Existing tools such as Wasit, SELO and official end-to-end suites validate protocol conformance. ChaosPay complements them: it injects a deterministic failure after settlement and before HTTP delivery, then compares the intended purchase, observed transfers and recovered response. Its verdict is economic and application-level, not a protocol-conformance verdict.

The comparison is explicit: the durable and naive cards are separate demonstration purchases. In the local naive fixture, a new payment authorization is deliberately created after the interruption; the two observed transfers are not evidence of a Stellar replay vulnerability.

### What we do NOT claim

- ChaosPay is not a security audit.
- ChaosPay is not a replacement for Wasit, SELO or official conformance suites.
- ChaosPay does not guarantee exactly-once payments.
- Fault injection is explicit in our local fixture; we do not inject faults into third-party services.
- The two demo APIs are team-built examples; we do not claim an external customer pilot.

## Panne et reprise

```sh
npm run smoke:payment -- demo-coupure durable drop
npm run smoke:payment -- demo-coupure durable none
```

Le premier appel est volontairement interrompu. Le second réutilise l'autorisation originale et récupère le résultat sans second paiement.

## Vérifier

```sh
npm run typecheck
npm test
```

Après arrêt des serveurs manuels :

```sh
npm run verify:dashboard
# Ancienne campagne CLI CSV, également disponible :
npm run verify:engine
```

La campagne exécute réellement coupure, redémarrage, concurrence et contre-exemple naïf sur Testnet. Les rapports expurgés sont écrits dans evidence/public/. Les hashes et événements de transfert permettent une vérification indépendante de la réponse du marchand.

Pour vérifier les hashes de la campagne et consulter les trois scénarios documentés, voir [les preuves publiques Testnet](evidence/public/README.md). Le script de présentation vidéo de 90 secondes est dans [docs/demo-video-90s.md](docs/demo-video-90s.md).

## Documentation

- [Démarrer depuis un dossier vierge](docs/QUICKSTART.md)
- [Retours de validation du guide](docs/QUICKSTART_REVIEW.md)


- [Intégrer le paquet dans une API existante](docs/INTEGRATION_A.md)
- [Kit de reprise et campagne sur deux API](docs/RECOVERY_KIT.md)
- [Kit de reprise et campagne sur deux API](docs/RECOVERY_KIT.md)
- [Guide de connexion et lancement A](docs/SETUP_A.md)
- [API pour le runner et le dashboard B](docs/ENGINE_API.md)
- [Cadrage et limites](docs/PROJECT.md)
- [Répartition entre deux IA](docs/WORK_SPLIT.md)
- [Versions et dépendances](docs/versions.md)
- [Contribution](CONTRIBUTING.md)
- [Crédits](THIRD_PARTY_NOTICES.md)

## Limites

Fixture locale : deux services déterministes (CSV et reçus JSON), un actif Testnet et des hooks de panne explicites. Un timeout reste UNKNOWN tant que le réseau n'a pas fourni de preuve. Les tests ne constituent pas un audit de sécurité ni une garantie universelle de paiement unique.

Le mode naïf introduit volontairement une nouvelle autorisation au retry ; il ne démontre pas une faille de replay de Stellar. Le laboratoire ne doit pas gérer d'argent réel ni être exposé sur Internet. Les dépendances ont une limite connue documentée dans docs/versions.md.

## Licence

La licence du code propre à l'équipe reste à choisir. Les composants tiers conservent leurs licences et mentions.
