# Démonstration ChaosPay

Depuis la racine du projet, avec Node 24 :

```sh
npm ci
npm run dev:dashboard
```

Ouvrir **http://127.0.0.1:3002**. Le dashboard est en HTML/CSS/JavaScript natif.

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

```sh
npm run typecheck
npm test
npm run verify:dashboard
```

Exécuter ces commandes successivement : les tests HTTP et le dashboard utilisent le même port. La campagne couvre huit scénarios sur deux applications et écrit evidence/public/recovery-campaign.json.

Le laboratoire est local et exclusivement Testnet. Il reste à éprouver le kit sur une application externe ; les deux intégrations actuelles appartiennent à ce dépôt.
