# Retour de répétition — guide B

Date : 25 octobre 2026. Base : dd7ab1f ; branche de travail : feat/developer-experience-b.

## Nature de l'essai

Le guide a été répété par l'agent dans un nouveau dossier temporaire hors du dépôt. Les commandes d'installation et les fichiers décrits dans QUICKSTART.md ont été utilisés. Les services ont été pilotés par un script local pour vérifier leurs codes de sortie et conserver les preuves.

Ce n'est pas un test réalisé par une personne indépendante. Aucun temps d'intégration humain ni compréhension sans assistance n'est revendiqué.

## Ce qui a été vérifié

- npm init, configuration ESM, installation de l'archive locale et des dépendances explicites du client.
- Import du kit par son nom de package, sans import des sources internes et sans copie du marchand.
- API consommatrice lancée avec un fichier marchand contenant seulement la configuration publique.
- Client lancé avec sa propre configuration et sa clé Testnet.
- Route /catalog conservée après montage du kit sous /paid.
- Achat normal : PASS, résultat calculé vérifié et un transfert.
- Réponse perdue : première commande interrompue, reprise du même identifiant, même fichier d'autorisation et PASS.
- Crash : arrêt du serveur, redémarrage avec le même journal, puis reprise et PASS.
- Confirmation inaccessible : UNKNOWN, attente puis reprise et PASS.
- Une seule création d'autorisation par achat ; aucune modification du fichier d'autorisation pendant les reprises.
- Rapports chargés comme archives dans le dashboard avec scénario, empreinte du paquet et preuves avant/après.

Preuves réseau : [quickstart-b.json](../evidence/public/quickstart-b.json).
L'empreinte de l'archive testée est enregistrée dans ce fichier. Les journaux et autorisations restent locaux, hors Git.

## Difficultés relevées et corrections

| Difficulté du guide précédent | Correction apportée |
| --- | --- |
| L'installation du serveur était expliquée, mais pas la signature du premier achat | Script client pédagogique fourni et commandes de premier achat documentées |
| La reprise automatique du test A masquait les gestes à faire après une panne | Deux commandes distinctes, codes 2 et 86 expliqués, redémarrage du serveur explicite |
| La répartition des secrets entre composants était ambiguë | Fichiers .env.merchant et .env.client séparés ; le facilitator conserve sa propre configuration |
| Les chemins et variables entre terminaux pouvaient être confondus | Chaque commande indique le dossier et le terminal ; variables non partagées signalées |
| Le service de factures était confondu avec un paiement de facture | Prix en XLM et total arithmétique de facture distingués |
| Les archives regroupaient plusieurs scénarios sous un titre générique | Une entrée par scénario d'intégration, avec appariement du rapport avant/après |
| Une installation indépendante pouvait être présentée comme un client externe | Provenance « API écrite par notre équipe » affichée et guide explicite |

L'essai a nécessité des outils d'orchestration pour exécuter les commandes et vérifier les sorties. Le prochain essai humain doit noter toute explication demandée, toute commande corrigée et le temps réellement passé.

## Démonstration et limites restantes

Le scénario de deux minutes est dans demo.md. Préparer les rapports avant la présentation ; le réseau Testnet n'a pas de délai garanti.

Les tests de présentation vérifient les libellés et la logique avec un DOM minimal. Ils ne remplacent pas une revue visuelle dans un navigateur, notamment sur mobile.

La troisième API est consultable via ses archives. Elle n'est pas ajoutée au sélecteur d'exécution du runner. Les changements de lecture des archives sont compatibles avec les rapports existants et filtrent les métadonnées exportées.

Restent à valider par une autre personne : lisibilité du guide, effort d'intégration sur son propre service, compréhension de UNKNOWN et obligations d'idempotence métier. Aucune publication npm dans cette étape.
