# Roadmap vers la meilleure note possible

## Objectif et limites

Cette roadmap vise à maximiser la qualité technique, la fiabilité, la sécurité, l’utilité et la démonstration de Lumaid. **100/100 est un objectif de travail, pas une promesse** : la note dépend du barème et du jury. La priorité est de produire des preuves solides et reproductibles, pas d’ajouter des fonctionnalités pour gonfler le périmètre.

Le périmètre actuel est un laboratoire local sur Stellar Testnet : XLM de test, services déterministes, SQLite et hooks de panne. Ce projet ne doit pas être présenté comme une infrastructure de paiement prête pour la production.

## État de départ

- La base possède un kit de reprise, deux services de démonstration, un runner et un dashboard.
- Les états `UNKNOWN`, `FAILED` et `PASS` sont distingués ; les archives et simulations sont identifiées comme telles.
- Les corrections de comptage multi-payeurs, d’export CSV, de décodage XDR et de revendication SQLite multi-connexions sont maintenant couvertes par des tests déterministes.
- La suite `npm test` (35 tests) et `npm run typecheck` ont réussi pendant la passe P0/P1. La suite ne réalise pas de paiement Testnet.
- L’avis HIGH de Zod persiste : Zod 3.25.76 est toujours résolu et `npm audit --omit=dev` n’annonce pas de correctif. La surface loopback et la limite de requête réduisent l’exposition sans supprimer la vulnérabilité ; la production reste bloquée.
- Le patch local proposant une commande `recover` reste non intégré et non inclus dans ces changements ; il ne doit pas être appliqué sans revue et tests.
- Les campagnes Testnet historiques ne constituent pas une exécution fraîche. Ne pas présenter leurs résultats comme tels.

## Principes de réalisation

1. **Pas de promesse d’exactly-once universel.** SQLite, Stellar et les effets métiers externes ne partagent pas de transaction atomique.
2. **L’incertitude reste visible.** Un timeout, un reçu absent ou un RPC indisponible ne prouvent pas un échec de paiement.
3. **Aucune nouvelle autorisation automatique** tant que le paiement précédent n’est pas réconcilié.
4. **Chaque capacité démontrée a un test correspondant.** Une fixture simulée ne prouve pas un comportement RPC réel.
5. **Testnet uniquement** pendant cette roadmap. Ne jamais utiliser de fonds réels pour les essais ou la démo.
6. Ne jamais versionner, afficher ou transmettre `.env`, clés privées, signatures ou bases locales.

## État de la passe P0/P1

**Réalisé et vérifié localement :** l’agrégation des transferts entre payeurs et la neutralisation CSV ont des tests de régression ; l’observateur est testé avec XDR sérialisé pour les formes i128 SEP-41 et map SAC ainsi qu’avec les mauvais contrats, payeurs, destinataires et montants ; des connexions SQLite distinctes prouvent l’unicité du claim ; le crash simulé après `SUBMITTING` reste `UNKNOWN` sans resoumission ; la documentation explique la réconciliation et la répétition possible de `produce`. Le test HTTP runner utilise désormais un port isolé.

**Encore ouvert avant de fermer entièrement P0/P1 :** l’avis Zod n’a pas de résolution compatible vérifiée ; les tests de crash du kit utilisent un gateway simulé et ne remplacent pas des tests du processus facilitator aux frontières signature/broadcast/reçu ; aucune nouvelle campagne Testnet n’a été lancée. Le code n’est donc pas validé pour production ou pour une promesse universelle d’exécution unique.

## P0 — Fiabiliser les preuves et les risques immédiats

### 1. Finaliser les corrections locales des rapports et du CSV

**Fichiers :** `packages/evidence/src/index.ts`, `packages/recovery/src/index.ts`, `apps/demo-merchant/src/conversion.ts`, `tests/engine.test.ts`, `tests/recovery.test.ts`.

- Relire le périmètre d’agrégation des transferts : déterminer explicitement quels paiements appartiennent à une même intention logique et compter les transferts pertinents sans les attribuer au mauvais payeur.
- Tester deux autorisations et payeurs distincts pour la même intention ; le rapport doit totaliser tous les paiements au marchand et ne pas afficher `PASS` si l’invariant est violé.
- Conserver les tests de chaînes CSV précédées de `=`, `+`, `-`, `@`, espaces et tabulations. Vérifier les nombres négatifs et les cellules ordinaires pour éviter de transformer des nombres en texte ou de casser le format.
- Refaire le typecheck et la suite déterministe après toute modification.

**Sortie attendue :** rapports dont le montant et le verdict sont cohérents avec toutes les observations, et export CSV prudent pour une ouverture dans un tableur.

### 2. Décider de l’avis Zod sans mise à jour hasardeuse

**Fichiers :** `package.json`, `package-lock.json`, `docs/versions.md`.

- Vérifier l’avis et la version réellement résolue par le lockfile.
- Vérifier auprès de la chaîne x402 quelle correction est compatible ; ne pas forcer une version majeure de Zod sans validation de compatibilité.
- Si une correction compatible existe, mettre à jour de façon reproductible et exécuter les tests de schémas/paiement. Sinon, conserver le confinement loopback, les limites de taille, et documenter le risque résiduel et la date de réévaluation.
- Refaire `npm audit` après la décision.

**Sortie attendue :** résultat d’audit reproductible, justification vérifiable et décision explicite. Aucun déploiement public tant que l’avis applicable n’est pas résolu ou accepté avec une analyse de risque.

### 3. Revoir intégralement la proposition `recover` avant intégration

**Fichiers proposés dans le patch :** `packages/client-recovery/src/diagnosis.ts`, `packages/client-recovery/src/resume.ts`, `packages/client-recovery/src/local-files.ts`, `scripts/recover.ts`, `tests/recover.test.ts`.

- Avant toute conclusion de non-paiement, interroger et prendre en compte le journal du facilitator ; HTTP 402 ou reçu absent ne prouve pas que le réseau n’a pas réglé l’opération.
- Ne pas recommander un nouvel achat si un reçu ou hash existe, si le marchand est indisponible, ou si l’observation est incertaine.
- À la reprise, valider le contenu et le hash du résultat déjà enregistré avant de conclure que l’achat est terminé.
- Valider les limites de tentatives et d’intervalle, le JSON des rapports, les chemins de fichiers, l’URL locale et les codes de sortie.
- Tester base marchand perdue avec reçu facilitator existant, résultat local tronqué, répétition de commande, ACK perdu et panne pendant la reprise.

**Sortie attendue :** les états ambigus ne peuvent pas être présentés comme « aucun paiement » et n’entraînent jamais une nouvelle autorisation automatique. Le patch reste non appliqué tant que ces conditions ne sont pas satisfaites.

### 4. Garder le produit dans son périmètre sûr

- Pas de Mainnet, fonds réels, API exposée sur Internet, prise en charge d’actifs supplémentaires ou de nouveaux services pendant les corrections P0.
- Garder le `.env` privé ; vérifier uniquement l’ignorance Git et les règles de packaging, sans lire son contenu.
- Rendre visible dans la démo que les scénarios d’agent hors CSV/reçu sont simulés.

**Porte de sortie P0 :** typecheck et tests concernés réussis ; aucune promesse de succès en état `UNKNOWN` ; avis Zod documenté ; aucune régression sur l’usage local.

## P1 — Prouver les frontières critiques

### 5. Couvrir le décodage réel des événements Stellar

**Fichiers :** `packages/stellar-observer/src/index.ts`, `tests/engine.test.ts`.

- Construire des fixtures XDR valides pour un transfert exact et pour les variantes supportées de l’événement SAC/SEP-41.
- Couvrir contrat inattendu, actif, montant, payeur, destinataire, événement absent, événement mal formé, transaction `FAILED`, `NOT_FOUND` et erreur RPC.
- Vérifier qu’une transaction confirmée sans événement interprétable n’est jamais déclarée `PASS`.

**Porte de sortie :** tests XDR reproductibles et verdicts négatifs explicites pour les événements non supportés.

### 6. Tester les crashes entre journal et réseau

**Fichiers :** `packages/recovery/src/index.ts`, `packages/recovery/src/store.ts`, `apps/demo-merchant/src/facilitator.ts`, tests associés.

Tester les arrêts aux frontières suivantes : écriture de l’intention, claim `SUBMITTING`, signature, hash enregistré, broadcast, confirmation, sauvegarde du résultat et accusé.

- Utiliser deux connexions SQLite et, si possible, deux processus concurrents.
- Redémarrer le marchand et le facilitator indépendamment.
- Vérifier qu’aucun état incertain n’est converti en échec confirmé et qu’une transaction connue n’est pas soumise une seconde fois.
- Vérifier la durée de blocage et la procédure d’escalade des états `UNKNOWN`.

**Porte de sortie :** matrice de panne avec état initial, point de crash, état persistant, action autorisée/interdite et résultat vérifié.

### 7. Concevoir une réconciliation opérable

Ne pas implémenter une résoumission automatique fondée sur un simple `404`. Définir une machine à états et un guide opérateur pour les cas où le hash existe, le reçu existe sans hash, ou les deux sont absents.

- Décrire les preuves nécessaires avant toute décision manuelle.
- Documenter délais de conservation et limites historiques du RPC.
- Si la preuve ne permet pas de conclure, rester en `UNKNOWN` et escalader ; ne pas conseiller de payer une deuxième fois sans décision explicite.

**Porte de sortie :** un opérateur peut expliquer le prochain pas sans confondre absence d’observation avec absence de paiement.

### 8. Maîtriser les effets métier

**Fichiers :** `packages/recovery/src/index.ts`, documentation d’intégration et exemples.

- Définir `produce` comme calcul pur et déterministe, ou introduire un outbox/identifiant d’idempotence pour les effets externes.
- Ajouter un test où le processus tombe après un effet métier mais avant la sauvegarde du résultat.
- Décrire la responsabilité de l’application intégratrice pour les emails, expéditions ou écritures externes.

**Porte de sortie :** aucun effet externe non idempotent n’est présenté comme protégé par le seul journal SQLite.

## P2 — Renforcer le produit et la démonstration

### 9. Fiabiliser le runner et ses diagnostics

**Fichiers :** `packages/runner/src/server.ts`, `packages/runner/src/processes.ts`, `packages/runner/tests/server.test.ts`.

- Restaurer l’historique local `.local/runner` au démarrage, sans le confondre avec les preuves archivées.
- Rendre l’écriture des rapports atomique et les erreurs consultables sans exposer de secrets.
- Remplacer les tests dépendants du port fixe par des ports configurables/éphémères lorsque possible.
- Vérifier la fermeture des sous-processus, leur état après timeout et la conservation des erreurs utiles.

**Porte de sortie :** un redémarrage local ne fait pas disparaître les runs ; tests HTTP répétables et sans conflit de port.

### 10. Finir l’expérience d’intégration

- Choisir une licence pour le code propre au projet et clarifier les dépendances tierces.
- Stabiliser les types et les versions du contrat d’API et expliquer la politique de migration.
- Faire intégrer le kit par une personne ou une équipe qui n’a pas écrit le dépôt ; enregistrer les difficultés et corriger le guide.
- Harmoniser nom de projet, package, commandes, interface et documentation (`Lumaid`/`ChaosPay`).
- Éviter le slogan absolu « Your payment never failed » : il peut y avoir des états inconnus ou bloqués.

**Porte de sortie :** une installation vierge suivie par un tiers réussit sans explication orale ni accès aux secrets de développement.

### 11. Faire une répétition de jury

Préparer un scénario court et une fiche de preuve :

1. Demande d’un service et autorisation de paiement XLM Testnet.
2. Interruption après règlement, avant réponse au client.
3. Hash de transaction et événement de transfert visibles et vérifiables indépendamment.
4. Reprise avec l’autorisation d’origine et résultat restitué, sans deuxième transfert.
5. Comparaison avec le cas naïf, en expliquant que le mode naïf crée volontairement une nouvelle autorisation.
6. Cas `UNKNOWN` présenté honnêtement, sans prétendre que la transaction est annulée ou échouée.

Vérifier avant la répétition : services locaux arrêtés si nécessaire, environnement Testnet configuré, identifiants de test uniques, fonds suffisants en XLM Testnet et procédure de récupération connue. Ne jamais publier de clés ou de signatures.

**Porte de sortie :** une personne externe comprend en deux minutes ce qui est réel, ce qui est simulé, ce qui est prouvé et ce qui reste inconnu.

## P3 — Évolutions après preuve et pilote

Ne lancer ces travaux qu’après P0–P2 :

- Client de reprise réutilisable, documenté et licencié.
- Pilote accompagné sur Testnet avec une API indépendante et autorisation explicite de l’équipe partenaire.
- Rapprochement sur plusieurs sources RPC, après définition claire des règles de confiance et d’escalade.
- Outbox durable si les cas d’usage nécessitent des effets externes.
- Support d’autres actifs/réseaux uniquement après analyse séparée des risques, des finalités, des événements et des frais.

**Interdit dans cette roadmap :** basculer en production ou Mainnet comme raccourci pour rendre la démo plus impressionnante.

## Jalons et calendrier

| Horizon | Livrables | Critère de décision |
|---|---|---|
| **24 heures** | Terminer P0 ; tests multi-payeurs/CSV ; décision Zod ; revue de la proposition `recover`. | Aucun nouveau défaut de preuve connu ; tests et typecheck verts. |
| **7 jours** | Fixtures XDR ; matrice de crash ; test multi-process SQLite ; procédure `UNKNOWN` ; historique runner restauré. | Les principales frontières de panne sont reproductibles et documentées. |
| **30 jours** | Licence/API stabilisées ; installation vérifiée par un tiers ; répétition de jury ; nouvelle campagne Testnet explicitement autorisée. | Démo indépendante et honnête ; aucune confusion entre archive, simulation et exécution fraîche. |
| **Après 30 jours** | Pilote Testnet, réconciliation opérateur, outbox selon besoin ; audit sécurité indépendant avant toute extension d’exposition. | Décision go/no-go documentée pour le périmètre suivant. |

## Tableau de score interne

Évaluer les preuves, pas le nombre de fonctionnalités. Le score est une auto-évaluation de préparation, pas une prédiction garantie du jury.

| Axe | Pour viser le maximum, il faut démontrer… |
|---|---|
| Technique | Architecture compréhensible, contrat d’intégration stable, types cohérents et frontières de panne testées. |
| Sécurité | Pas de secret exposé, avis dépendances traité, CSV sûr, surface locale contrôlée et revue indépendante. |
| Innovation | Un problème précis et une démonstration originale fondée sur des preuves, sans revendiquer une nouveauté non vérifiée. |
| Utilité | Un intégrateur externe confirme que le cas est réel et que le kit simplifie son travail. |
| Fiabilité | Tests de crash/concurrence, états incertains prudents, aucune double soumission non maîtrisée et procédure de réconciliation. |
| UX | Parcours simple, erreurs compréhensibles, historique persistant et séparation claire entre simulation et Testnet. |
| Démonstration | Exécution fraîche, hash vérifiable, panne visible, reprise reproductible et limites annoncées spontanément. |

## Définition de « prêt à présenter »

- [ ] Typecheck et tests déterministes passent.
- [ ] Les changements locaux sont relus et ne se mélangent pas au patch non suivi sans décision.
- [ ] Les tests XDR couvrent les événements qui justifient un `PASS`.
- [ ] Les conclusions de rapports multi-payeurs sont couvertes par des tests de régression.
- [ ] Le risque Zod est vérifié, documenté et non masqué.
- [ ] Le scénario Testnet a été exécuté fraîchement et ses transactions vérifiées indépendamment.
- [ ] Simulation, preuve historique et exécution fraîche sont identifiables au premier regard.
- [ ] Aucune clé, autorisation ou donnée privée n’est montrée ou publiée.
- [ ] Le cas bloqué `UNKNOWN` est expliqué sans inventer une résolution.
- [ ] Une répétition complète a été réussie par quelqu’un qui ne connaît pas l’implémentation.

**La note maximale devient crédible quand chaque affirmation importante est appuyée par une preuve indépendante et que les limites sont traitées comme des résultats, pas cachées comme des détails.**
