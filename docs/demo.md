# Démonstration ChaosPay

Depuis la racine du projet, avec Node 24 :

```sh
npm ci
npm run dev:dashboard
```

Ouvrir **http://127.0.0.1:3002**. Le dashboard est en HTML/CSS/JavaScript natif.


## Démo de deux minutes : installation indépendante et reprise

Préparation : suivre [QUICKSTART.md](QUICKSTART.md), conserver le dossier indépendant et ses journaux, puis ouvrir dans le dashboard les archives « Intégration indépendante ». Le réseau est utilisé avant la présentation pour préparer les preuves. Dire clairement qu'une archive est un résultat historique.

| Temps | Action | Message |
| --- | --- | --- |
| 0:00–0:20 | Montrer le dossier indépendant, son package.json et l'import @chaospay/recovery/stellar-http | « Cette API installe une archive npm. Elle ne copie pas notre marchand et n'importe pas les sources du dépôt. » |
| 0:20–0:40 | Montrer le montage sous /paid et la fonction métier | « Le service vérifie le calcul d'une facture. Le paiement rémunère cette vérification ; il ne règle pas la facture. » |
| 0:40–1:00 | Montrer la commande client avec drop et son interruption préparée | « Le paiement est passé, mais le client n'a pas reçu la réponse. Il conserve son identifiant et son autorisation. » |
| 1:00–1:20 | Montrer la commande du même identifiant avec none et la sortie PASS | « La reprise restitue le résultat sans créer une nouvelle autorisation. » |
| 1:20–1:45 | Ouvrir l'archive du scénario réponse perdue | « Avant : inconnu et réception non confirmée. Après : résultat accusé et un seul transfert attendu. Voici l'empreinte du paquet testé. » |
| 1:45–2:00 | Télécharger l'export et afficher les limites | « Cette intégration a été répétée par notre agent, pas encore par une équipe extérieure. Nous conservons les journaux ; les effets métier doivent pouvoir être rejoués sans dommage. » |

Si un achat est exécuté en direct, annoncer qu'il s'agit de Testnet et attendre sa preuve : ne pas promettre que les opérations réseau tiendront dans ces deux minutes. Ne jamais supprimer le journal ou changer l'identifiant pour obtenir artificiellement un résultat vert.


## Variante : comparaison des deux applications de démonstration

Préparer les essais **avant** la présentation pour ne pas dépendre des délais Testnet : CSV / « Comparer deux façons de reprendre », puis Reçus / « L’application s’arrête ». Garder le runner ouvert : son historique local n’est pas rechargé après redémarrage. Vérifier que les rapports sont bien TESTNET et les exports disponibles. Ne jamais présenter une simulation comme une preuve réseau.

| Temps | À montrer | À dire |
| --- | --- | --- |
| 0:00–0:20 | Les quatre étapes : application → panne → exécution → bilan | « Le client paie. L’application tombe en panne. Va-t-il recevoir son résultat, ou payer encore ? » |
| 0:20–0:45 | Essai CSV comparatif, carte « Recommencer en payant » | « Ici, notre exemple naïf crée volontairement un second paiement. Le client reçoit son résultat, mais paie deux fois. Ce n’est pas une faille de Stellar. » |
| 0:45–1:10 | Carte « Retrouver le même achat » | « Avec la reprise, l’achat existant est retrouvé : un seul règlement et le résultat confirmé. Voici le montant observé et le temps de reprise mesuré. » |
| 1:10–1:35 | Essai Reçus après crash : paiement, résultat, délai | « Cette autre application utilise le même kit. Après redémarrage, elle retrouve également l’achat. Les deux applications sont aujourd’hui nos exemples ; l’adoption par une équipe externe reste à prouver. » |
| 1:35–1:55 | Ouvrir « Vérifier les preuves Stellar et les mesures », un lien de transaction et l’export JSON | « Le bilan repose sur des transferts observés et un accusé du client logiciel. Les preuves sont consultables et exportables. » |
| 1:55–2:00 | Revenir au bilan | « Notre prochaine validation : un développeur extérieur intègre le kit avec notre documentation. » |

En cas de réseau indisponible, utiliser une campagne ARCHIVE en annonçant sa date et son caractère historique. Les campagnes regroupent plusieurs achats : ne pas comparer arbitrairement deux cartes comme si elles provenaient du même scénario. En dernier recours, utiliser la simulation en disant explicitement « ceci illustre le comportement, ce n’est pas une nouvelle exécution réelle ».

## Parcours sans explication technique

1. **Application** : choisir ce que le client achète. Le reçu JSON rémunère une génération, pas une facture.
2. **Panne** : choisir une situation décrite en langage courant. La comparaison est proposée en premier.
3. **Exécution** : simulation par défaut, ou Testnet explicitement choisi. Les contrôles sont bloqués pendant l’essai pour éviter les doubles lancements.
4. **Bilan** : lire le paiement observé, la réception confirmée et le délai. Les preuves Stellar et la timeline sont dépliables, sans masquer les marqueurs de simulation ou d’archive.

Un montant nul avec des preuves incomplètes est affiché « Non établi », jamais « le client n’a pas payé ». Sans accusé, afficher « Pas confirmé ». Une exécution terminée n’est pas nécessairement un achat réussi : le bilan traduit séparément PASS, FAIL, UNKNOWN et UNSUPPORTED. Le délai utilise la mesure client lorsqu’elle existe, sinon celle du serveur, avec son origine explicitement indiquée ; aucune durée fictive n’est inventée pour la simulation.

Pour évaluer la compréhension, montrer un bilan à quelqu’un sans commentaire et lui demander : « Le client a-t-il payé ? A-t-il reçu son résultat ? Qu’a changé la reprise ? » Ce test utilisateur reste à organiser ; les vérifications techniques ne le remplacent pas.

## Parcours conseillé

1. Choisir **CSV**, **TESTNET**, puis **Naïf vs durable**. Montrer les deux rapports : un paiement en mode durable, deux dans la fixture naïve.
2. Choisir **Confirmation indisponible**. Montrer le checkpoint UNKNOWN, puis le transfert confirmé et le résultat accusé après reprise.
3. Choisir **API de reçus JSON**, puis **Crash marchand**. Montrer que la seconde application utilise la même reprise après redémarrage.
4. Télécharger l'export JSON et ouvrir un hash de transaction sur l'explorateur Testnet.

Le paiement de la seconde API achète la génération d'un reçu ; il ne paie pas la facture représentée.

Les huit scénarios sont : sans panne, avant soumission, confirmation indisponible, réponse perdue, crash, accusé perdu, deux requêtes et comparaison naïf/durable. Leur définition précise figure dans [RECOVERY_KIT.md](RECOVERY_KIT.md).

## Simulation et archives

SIMULATED fonctionne sans clés et produit des résultats fictifs, y compris dans l'export.
ARCHIVE charge les preuves de evidence/public/ ; aucune nouvelle vérification réseau n'est effectuée.

## Exécution Testnet

Suivre [SETUP_A.md](SETUP_A.md) pour créer .env et financer les comptes de test. Arrêter les serveurs manuels avant une exécution : le runner démarre et arrête ses propres processus, et refuse de prendre le contrôle d'un serveur existant.

Une exécution à la fois. La comparaison peut effectuer trois règlements Testnet au prix configuré. Le mode naïf crée intentionnellement une seconde autorisation ; ce résultat ne révèle pas une faille de replay Stellar.

## Lire les résultats

Les cartes affichent les transferts, montants atomiques, accusé, durée de reprise et nombre de retours UNKNOWN. Les checkpoints montrent l'état avant reprise ; la timeline sépare les requêtes HTTP des autorisations.

Un PASS exige un transfert exact observé et un accusé applicatif. Une réponse HTTP seule ne suffit pas. La durée inclut l'attente et les redémarrages ; elle ne mesure pas uniquement Stellar.

L'export utilise une liste explicite de champs publics : pas de clés, signatures ou corps applicatifs.

## Reprise après interruption du runner

Conserver .local et .env. Le runner sauvegarde l'autorisation dans .local/client-<mode>-<purchaseId>.json et le corps original avec l'application et l'URL dans .local/request-<mode>-<purchaseId>.json.

Pour une reprise manuelle, redémarrer le facilitator et l'application concernée, puis envoyer le même corps au même achat avec le payload original en PAYMENT-SIGNATURE (JSON/base64). Vérifier resultHash avant d'envoyer l'accusé. Le client smoke:payment est réservé à son propre format CSV ; il ne reprend pas les reçus JSON.

Les rapports locaux restent dans .local/runner/. Ils ne sont pas rechargés automatiquement dans l'historique au démarrage. Aucun renouvellement automatique d'autorisation après un état incertain.

## Vérifier

Les vérifications de présentation (UNKNOWN, comparaison, simulation, archives, lancement et connexion indisponible) sont isolées dans le périmètre dashboard :

```sh
node --test apps/dashboard/presentation.test.mjs
```

Elles exécutent la logique avec un DOM minimal ; elles ne valident pas le rendu CSS dans un navigateur. Vérifier manuellement le parcours sur écran large et mobile, l’accès au clavier, le téléchargement et l’ouverture des détails avant la présentation.

```sh
npm run typecheck
npm test
npm run verify:dashboard
```

Exécuter ces commandes successivement : les tests HTTP et le dashboard utilisent le même port. La campagne couvre huit scénarios sur deux applications et écrit evidence/public/recovery-campaign.json.

Les contrôles vérifient aussi le nombre exact de transactions distinctes, les montants, les accusés, les deux mesures de reprise et l’identité de l’export avec le rapport affiché. Hors comparaison naïve, la timeline doit contenir une seule autorisation. Chaque panne doit produire UNKNOWN avant récupération.

La campagne de référence B est conservée dans `evidence/public/recovery-campaign.json`. La campagne publiée par A au commit `64bd455` reste disponible séparément dans `evidence/public/recovery-campaign-A-64bd455.json`.

Le laboratoire est local et exclusivement Testnet. Il reste à éprouver le kit sur une application externe ; les deux intégrations actuelles appartiennent à ce dépôt.


## Mesures et validation ajoutées par B

Les montants en XLM conservent les sept décimales exactes, sans conversion flottante. Le nombre de règlements compte les transactions distinctes ; les unités atomiques restent visibles.

recoveryDurationMs mesure côté runner le temps monotone entre la détection de l’interruption et le premier accusé réussi. recoveryMs mesure côté moteur le temps depuis l’interruption enregistrée dans le journal. Les deux durées ont des points de départ différents ; elles incluent le redémarrage et la reprise. Sans mesure terminée, afficher « Non mesuré ». Un montant observé nul avec UNKNOWN ne prouve pas l’absence de paiement.

La validation complémentaire de B couvre les cinq scénarios CSV initiaux. Avec le dashboard déjà lancé :

    node --import tsx packages/runner/verify-testnet.ts

Elle vérifie verdicts, transactions distinctes, montants, accusés, durée côté runner et export. Les résultats restent dans .local/runner/validation-<timestamp>.json. Pour les huit scénarios sur les deux API, arrêter le dashboard et lancer npm run verify:dashboard.
