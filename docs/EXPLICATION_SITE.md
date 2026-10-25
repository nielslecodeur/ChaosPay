# ChaosPay : à quoi sert concrètement notre site ?

## L'idée en une phrase

ChaosPay permet de tester ce qui arrive à un achat lorsqu'une application rencontre une panne, puis de vérifier si elle peut retrouver le résultat sans faire payer une seconde fois le client.

Le site est l'interface de ce laboratoire : on choisit une application, une panne et un mode de test, puis on consulte le bilan et les preuves.

## Un exemple concret

Un client paie pour convertir des données en fichier CSV.

1. Son paiement est confirmé sur Stellar.
2. L'application prépare le fichier.
3. La connexion est coupée avant que le client reçoive la réponse.
4. Le client ne sait pas si son achat a fonctionné.

Une application mal conçue peut lui faire recommencer avec un nouveau paiement. Il reçoit finalement son fichier, mais a payé deux fois.

Avec notre kit de reprise, l'application retrouve l'achat enregistré, vérifie le paiement et restitue le résultat en réutilisant l'autorisation originale.

ChaosPay reproduit ces situations et affiche ce qui s'est réellement passé.

## À qui cela sert-il ?

Le produit vise les développeurs d'applications et d'API payantes sur Stellar. Une API est un service qu'un autre logiciel peut appeler, par exemple pour générer un document ou transformer des données.

Le développeur veut répondre à trois questions :

- Le client a-t-il payé, et combien de fois ?
- Le client a-t-il reçu le résultat acheté ?
- L'application a-t-elle réussi à reprendre après la panne, et en combien de temps ?

Le site actuel permet de démontrer ces questions sur nos exemples. Pour tester sa propre application, un développeur doit d'abord intégrer le kit ; il ne suffit pas de saisir l'adresse de n'importe quel site.

## Ce que l'utilisateur fait sur le site

### 1. Choisir une application

Deux services sont disponibles dans l'interface :

| Application | Ce que le client achète |
| --- | --- |
| Conversion CSV | La transformation de données en un fichier CSV, utilisable dans un tableur. |
| Génération de reçu JSON | La création d'un reçu structuré, lisible par un logiciel. Le paiement achète sa génération ; il ne règle pas la facture représentée. |

Ces applications servent à montrer que le même kit peut être réutilisé pour des services différents.

### 2. Choisir une situation à tester

| Situation | Ce que l'on cherche à vérifier |
| --- | --- |
| Sans panne | Un achat normal aboutit avec un seul paiement et un résultat reçu. |
| Interruption avant soumission | L'achat peut reprendre alors que la demande de règlement n'avait pas encore été envoyée. |
| Confirmation indisponible | L'application attend une preuve du paiement au lieu de considérer immédiatement l'achat comme réussi ou de faire repayer. |
| Réponse perdue | Le résultat sauvegardé peut être restitué après une coupure de connexion. |
| Arrêt de l'application | Après redémarrage, l'application peut retrouver le paiement et produire le résultat. |
| Accusé de réception perdu | Le résultat a été envoyé, mais sa réception n'est pas encore confirmée ; la reprise permet de terminer l'échange. |
| Deux requêtes simultanées | Deux appels portant sur le même achat ne doivent pas déclencher deux paiements. |
| Comparaison de deux façons de reprendre | On compare une nouvelle tentative avec nouveau paiement et une reprise du même achat. |

Les pannes sont déclenchées volontairement dans nos applications de test. Le scénario de confirmation indisponible masque la confirmation au marchand ; il ne provoque pas une panne du réseau Stellar.

### 3. Choisir comment exécuter l'expérience

| Mode | Ce qu'il signifie |
| --- | --- |
| **SIMULATED** | Illustration avec des données fictives. Aucun paiement réseau n'est effectué. |
| **TESTNET** | Exécution réelle sur le réseau de test Stellar, avec des XLM de test sans valeur réelle. |
| **ARCHIVE** | Consultation d'une campagne déjà enregistrée. Ce n'est pas une nouvelle exécution ni une nouvelle vérification réseau. |

SIMULATED et TESTNET se choisissent pour lancer une expérience. Les archives se consultent dans l'historique.

En Testnet, le logiciel local démarre les services nécessaires, exécute le scénario, récupère les rapports et arrête les services qu'il a lancés.

### 4. Lire le bilan

Le site présente d'abord les conséquences pour le client :

- **Paiement observé** : le montant et le nombre de règlements retrouvés.
- **Résultat reçu** : le client logiciel a-t-il confirmé la réception du résultat ?
- **Délai de reprise** : combien de temps s'est écoulé entre l'interruption détectée ou enregistrée et la confirmation de réception ?

La durée peut être mesurée côté client ou côté serveur ; l'interface indique l'origine de la mesure. Elle inclut notamment l'attente et le redémarrage, pas seulement le temps du réseau Stellar.

Les détails permettent ensuite de consulter les transactions, les montants exacts, la chronologie des appels et l'export JSON du rapport.

## Comment interpréter les verdicts ?

| Verdict | Signification |
| --- | --- |
| **PASS** | Un transfert attendu a été observé et la réception du résultat a été confirmée par le client logiciel. |
| **FAIL** | Les preuves contredisent le comportement attendu, par exemple deux paiements confirmés pour un seul achat. |
| **UNKNOWN** | Les informations sont insuffisantes pour conclure, par exemple une confirmation indisponible ou un accusé manquant. |
| **UNSUPPORTED** | L'observateur ne sait pas interpréter les preuves nécessaires à ce cas. |

Un essai terminé n'est donc pas forcément un achat réussi.

Un montant observé nul avec UNKNOWN ne prouve pas que le client n'a pas payé. De même, l'accusé prouve la réception par le logiciel client, pas qu'une personne a ouvert ou lu le résultat.

## Ce que montre la comparaison

La comparaison utilise deux achats de démonstration distincts, soumis à une perte de réponse :

| Façon de reprendre | Comportement de notre exemple | Résultat attendu |
| --- | --- | --- |
| Recommencer en payant | Le client crée volontairement une nouvelle autorisation de paiement. | Deux règlements pour le même achat logique : FAIL. |
| Retrouver le même achat | Le client réutilise son identifiant, son contenu et son autorisation d'origine. | Un seul règlement et un résultat récupéré : PASS. |

Le premier comportement est volontairement mauvais pour illustrer le problème. Il ne démontre pas une faille de Stellar et ne signifie pas que toutes les applications actuelles font payer deux fois.

Le kit ne rembourse pas le deuxième paiement de cet exemple : il montre comment éviter d'en déclencher un nouveau lors de la reprise durable.

## Ce qui fonctionne derrière l'interface

Le projet comprend trois éléments complémentaires :

1. **Le dashboard** : l'écran que l'on utilise pour choisir l'expérience et comprendre le bilan.
2. **Le runner** : le programme qui orchestre les appels, les pannes et les redémarrages.
3. **Le kit de reprise** : la bibliothèque intégrée dans l'application payante, qui conserve l'identité de l'achat et son état dans un journal durable.

Un composant de règlement transmet le paiement à Stellar et conserve un reçu local. Un observateur consulte ensuite le réseau pour vérifier le transfert : actif, payeur, bénéficiaire et montant. Le client vérifie aussi le contenu reçu avant d'envoyer son accusé.

Le bilan ne repose donc pas uniquement sur un message « paiement réussi » affiché par l'application.

## Ce qui est disponible aujourd'hui

- Le dashboard local avec les deux services CSV et reçus JSON.
- Les huit scénarios, la comparaison et les rapports exportables.
- Un kit installable depuis une archive npm locale.
- Une troisième API de vérification arithmétique de factures, testée séparément avec le paquet installé hors du dépôt. Elle n'est pas encore proposée dans le dashboard.

Les trois applications sont des exemples écrits par notre équipe. L'intégration par une équipe extérieure reste à valider.

Le périmètre actuel est local et exclusivement Stellar Testnet. Le journal doit être conservé pour permettre la reprise. Certaines situations restent inconnues et nécessitent une intervention ; le projet ne garantit pas une récupération automatique après toutes les pannes possibles.

## Comment essayer le site ?

Depuis la racine du projet :

```sh
npm run dev:dashboard
```

Ouvrir **http://127.0.0.1:3002**.

Pour une première visite, choisir une application, la comparaison des deux façons de reprendre et le mode SIMULATED. Passer ensuite à TESTNET une fois la configuration réalisée.

Guides complémentaires :

- [Démonstration et présentation de deux minutes](demo.md)
- [Configuration Testnet](SETUP_A.md)
- [Fonctionnement et limites du kit](RECOVERY_KIT.md)
- [Intégration dans une API existante](INTEGRATION_A.md)

## Une phrase pour présenter le projet

> « ChaosPay permet aux développeurs de provoquer une panne pendant un achat sur Stellar et de vérifier, preuves à l'appui, si leur application peut récupérer le résultat sans faire repayer le client. »
