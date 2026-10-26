# Roadmap UX/UI — faire progresser Lumaid

## Objectif

Cette roadmap convertit l’audit de l’interface réellement inspectée en actions priorisées et vérifiables. Le score actuel estimé est **71/100** ; ce n’est ni une mesure normalisée ni une prédiction de jury. Viser **85/100 avant une présentation**, puis **90+** après tests avec des utilisateurs, vérification accessibilité et validation sur plusieurs tailles d’écran. **100/100 n’est pas garanti** : le résultat dépend des utilisateurs et du barème.

Périmètre : accueil, Demo, laboratoire Testnet, historique des runs, documentation et installation. L’interface doit rester honnête sur les simulations, les archives, les paiements confirmés et les états inconnus. Les exemples et libellés historiques « ChaosPay » ne sont pas une priorité de cette roadmap ; le nom produit considéré est **Lumaid**.

## État de référence observé

- L’identité visuelle sombre et spatiale est distinctive et cohérente ; la première impression est néanmoins dominée par le décor et le slogan avant que la valeur produit soit expliquée.
- La simulation dans le navigateur présente clairement une comparaison fictive **2 règlements contre 1**, sans requête réseau de paiement.
- Le laboratoire distingue `SIMULATED`, `TESTNET` et `ARCHIVE`, et affiche un avertissement quand Testnet est choisi.
- Les résultats distinguent le statut d’un run du verdict du rapport, mais les mots « Complete » et « Purchase succeeded » peuvent être confondus.
- À 390 px, la Demo inspectée ne débordait pas horizontalement, mais Installation mesurait environ 528 px et Documentation environ 416 px : elles nécessitaient un défilement horizontal global.
- Le lancement Testnet ne demande pas de confirmation finale résumant l’action. Aucun lancement Testnet n’a été effectué pendant l’audit.
- Les onglets d’installation fonctionnent au clavier, mais l’orientation ARIA déclarée est verticale tandis que leur présentation mobile est horizontale.
- La réduction du mouvement est prise en compte par une partie de l’animation, pas uniformément.
- Aucun audit automatique WCAG complet, test avec lecteur d’écran, ou étude utilisateur n’a été réalisé.

Fichiers principaux concernés : `apps/dashboard/index.html`, `apps/dashboard/style.css`, `apps/dashboard/app.js`, `apps/dashboard/quick-demo.js` et `apps/dashboard/copy-commands.js`.

## Principes non négociables

1. Ne jamais présenter `UNKNOWN`, une absence de reçu ou une expérience terminée comme une preuve de paiement réussi ou échoué.
2. Distinguer partout **état de l’expérience** et **état du paiement**.
3. Faire confirmer explicitement toute action susceptible d’envoyer un paiement Testnet ; indiquer combien de règlements elle peut générer.
4. Ne pas utiliser uniquement la couleur pour représenter `PASS`, `FAIL`, `UNKNOWN` ou les modes.
5. Ne pas ajouter de graphiques/KPI sans décision utilisateur qu’ils facilitent.
6. Tester les mises en page réelles et la navigation clavier ; une feuille CSS ou un test DOM seul ne démontre pas l’accessibilité.

## Avancement de l’implémentation

Les améliorations suivantes sont intégrées dans le dashboard ; cela ne signifie pas que la roadmap est entièrement terminée ni que le score UX a été recalculé :

| Priorité | Changements réalisés | Vérification / limites |
|---|---|---|
| P0.1 | Confirmation modale avant tout lancement Testnet, avec scénario, service, maximum de règlements et rappel d’irréversibilité ; annulation, Escape et confirmation explicite séparés. | Tests de présentation : aucun POST à l’ouverture/annulation, un POST uniquement après confirmation explicite. Dans le navigateur, ouverture puis annulation testées ; aucune requête de run ni transaction envoyée. |
| P0.2 | Slogan non absolu et sous-titre expliquant la reprise de l’achat et les états incertains. | **Révisé à la demande de l’utilisateur :** le slogan et la présentation de landing d’avant ont été restaurés avec le curseur astronaute. La recommandation UX initiale n’est donc plus appliquée. |
| P0.3 | Statuts du run renommés séparément des verdicts, avec une zone « Payment evidence » et une prochaine action prudente pour `UNKNOWN`. | Tests sur les quatre verdicts et les trois statuts de run. |
| P1.4 | Présentation précédente de la landing rétablie, avec le curseur astronaute visible sur les appareils à pointeur fin (sauf préférence de réduction du mouvement). | À vérifier dans le navigateur après rechargement ; la séquence et le lien « How it works » sont masqués dans cette landing comme auparavant. |
| P1.5 | Grilles Documentation/Installation rétractables, blocs de code confinés, onglets d’installation disposés en trois colonnes. | Largeurs de document vérifiées dans le navigateur à 320, 360, 390, 768 et 1024 px ; aucun débordement horizontal du document. |
| P1.6 | Explication permanente du mode choisi et confirmation qui estime jusqu’à trois règlements pour la comparaison. | Le sélecteur Testnet ouvre la modale ; son annulation a été vérifiée sans POST `/api/runs`. Aucun paiement Testnet n’a été lancé. |
| P1.7 | Filtre d’historique par Simulation, Testnet et Archive. | Test de rendu avec deux sources différentes. |
| P2.8–10 | Orientation ARIA des onglets cohérente avec leur disposition, navigation clavier horizontale, noms contextuels des boutons de copie et préférence de réduction du mouvement respectée plus largement. | Tests de présentation ; le curseur astronaute est actif sur pointeur fin, sauf si l’utilisateur préfère réduire le mouvement. Pas d’audit WCAG complet ni de lecteur d’écran. |

**Reste à faire avant de viser 90+ :** étude modérée avec au moins cinq utilisateurs, mesure des contrastes et des cibles WCAG 2.2 AA, essai réel au clavier/lecteur d’écran, validation sur zoom élevé et correction des difficultés observées. Le score de référence de 71/100 n’est pas une note post-correction.

## P0 — Sécurité de décision et confiance

### 1. Ajouter une confirmation avant tout lancement Testnet

**Problème :** sélectionner Testnet puis lancer déclenche le run sans étape finale de confirmation. Un scénario de comparaison peut générer plusieurs paiements de test.

**Fichiers :** `apps/dashboard/app.js`, éventuellement `apps/dashboard/index.html` et `apps/dashboard/style.css`.

**Changement recommandé :**

- En simulation, conserver le lancement direct.
- En Testnet, intercaler une boîte de dialogue accessible avant le POST.
- Récapituler le scénario, l’application, le nombre maximal de règlements (par exemple « jusqu’à 3 paiements XLM Testnet » pour la comparaison), et rappeler qu’un transfert confirmé sur Stellar ne s’annule pas.
- Proposer des actions explicites « Annuler » et « Confirmer le test Testnet » ; ne pas présélectionner la confirmation.
- Désactiver les actions concurrentes pendant l’envoi et prévenir le double-clic.

**Critère de sortie :** aucun POST `/api/runs` en mode Testnet avant confirmation ; Escape/Annuler ne crée aucun run ; un double-clic ne crée qu’un lancement. Tests automatisés du flux et vérification clavier/focus dans le navigateur.

**Effort :** moyen · **Impact :** très élevé.

### 2. Remplacer la promesse absolue de l’accueil

**Problème :** « Your payment never failed » peut être compris comme une garantie de réussite, alors que des paiements peuvent rester `UNKNOWN` ou nécessiter un rapprochement humain.

**Fichier :** `apps/dashboard/index.html`.

**Changement recommandé :** choisir une phrase qui exprime le bénéfice sans garantir l’issue, par exemple **« Recover interrupted payments without blindly paying twice »**, puis sous-titrer : **« Lumaid reuses the original purchase and keeps uncertain payment states visible. »**

**Critère de sortie :** cinq personnes qui découvrent le produit peuvent expliquer en moins de dix secondes le problème traité et comprennent qu’une récupération n’est pas toujours possible ou confirmée.

**Effort :** faible · **Impact :** très élevé.

### 3. Séparer le statut du run du statut du paiement

**Problème :** « Complete » décrit la fin de l’expérience, pas le paiement ; la proximité visuelle avec le verdict favorise une lecture rapide erronée.

**Fichiers :** `apps/dashboard/app.js`, `apps/dashboard/style.css`.

**Changement recommandé :**

- Renommer les états de run en « Experiment finished », « Experiment running » et « Experiment interrupted ».
- Afficher une zone séparée avec un titre explicite « Payment evidence » et un verdict compréhensible : « Confirmed », « Not confirmed — status unknown », « Failed according to observed evidence » ou « Unsupported evidence ».
- Pour `UNKNOWN`, placer la prochaine action sûre près du statut : vérifier/relancer plus tard/rapprocher manuellement. Ne pas suggérer de nouveau paiement.
- Garder le code technique (`UNKNOWN`, etc.) dans le détail ou en complément, pas comme unique explication.

**Critère de sortie :** tests de rendu sur les quatre verdicts et les trois statuts de run ; aucun état `UNKNOWN` n’emploie les termes « success », « paid successfully » ou « failed payment » comme verdict certain.

**Effort :** faible à moyen · **Impact :** très élevé.

## P1 — Clarté des parcours et du responsive

### 4. Expliquer la proposition de valeur sur l’accueil

**Problème :** le premier écran mobile/desktop présente le nom, le slogan et un bouton ; la séquence de récupération et la preuve sont masquées en mode accueil.

**Fichiers :** `apps/dashboard/index.html`, `apps/dashboard/style.css`.

**Changement recommandé :**

- Ajouter une phrase concrète et une mini-séquence lisible en une ligne ou quatre étapes : « Authorize → Settle → Recover result → Acknowledge ».
- Rendre visible un lien secondaire « How it works ».
- Garder la scène cosmique comme identité, mais assurer un contraste constant derrière le texte et éviter qu’elle prenne toute la hiérarchie.
- Faire en sorte qu’une hauteur de fenêtre courte permette d’atteindre Demo sans que le héros masque le contenu utile.

**Critère de sortie :** à 390×844 et 1365×850, la proposition de valeur et l’accès à la Demo sont visibles, sans défilement horizontal ni perte de focus.

**Effort :** moyen · **Impact :** élevé.

### 5. Corriger le débordement mobile de Documentation et Installation

**Problème confirmé :** à 390 px, les deux pages sont plus larges que la fenêtre, ce qui coupe le contenu et déclenche un défilement horizontal global.

**Fichiers :** `apps/dashboard/style.css`, au besoin `apps/dashboard/index.html`.

**Changement recommandé :**

- Corriger les contraintes `min-width`/`minmax` des grilles pour permettre aux colonnes de rétrécir (`min-width: 0` sur enfants pertinents).
- Laisser les blocs `pre`/tableaux défiler localement, sans élargir l’article ou le document entier.
- Revoir les onglets d’OS sur petit écran : trois cibles assez larges, navigation visuelle et sémantique cohérente.
- Vérifier les liens longs, exemples de code et commandes copiables à 320, 390, 768 et 1024 px, puis avec zoom navigateur.

**Critère de sortie :** `document.documentElement.scrollWidth <= window.innerWidth` aux largeurs 320, 360, 390, 768 et 1024 px pour Documentation et Installation ; seuls les blocs de code/tableaux peuvent défiler horizontalement.

**Effort :** moyen · **Impact :** élevé.

### 6. Rendre le choix Simulation/Testnet plus explicite

**Problème :** l’avertissement Testnet existe, mais le contraste fonctionnel avec la simulation reste surtout dans une phrase d’état.

**Fichiers :** `apps/dashboard/index.html`, `apps/dashboard/app.js`, `apps/dashboard/style.css`.

**Changement recommandé :**

- Présenter Simulation et Testnet comme deux choix différenciés, avec sous-texte permanent : « Fictitious; no payment » vs « Sends real testnet transactions; test funds only ».
- Ne pas dépendre uniquement de la couleur ou du libellé du bouton pour identifier le mode.
- Afficher dans la confirmation Testnet le nombre de paiements attendu et l’effet du scénario choisi.
- Donner un état clair de disponibilité locale : dashboard connecté/déconnecté et prérequis manquants, sans diagnostic technique prématuré.

**Critère de sortie :** utilisateur novice sait, avant lancement, s’il effectue une simulation ou soumet des paiements Testnet ; message vérifié avec lecteur d’écran et affichage mobile.

**Effort :** moyen · **Impact :** élevé.

### 7. Rendre l’historique exploitable

**Problème :** runs récents et archives se succèdent dans une liste longue, avec des campagnes répétitives ; les résultats difficiles à retrouver augmentent le coût de la démo.

**Fichier :** `apps/dashboard/app.js`, et styles correspondants.

**Changement recommandé :**

- Ajouter filtres sobres : Tous / Simulation / Testnet / Archive, puis éventuellement Confirmé / Inconnu / Échec.
- Trier par date décroissante, regrouper seulement les campagnes réellement liées, et montrer une étiquette de provenance persistante.
- Maintenir les filtres au changement de run ; ajouter une recherche seulement si les tests utilisateur montrent un besoin.

**Critère de sortie :** un utilisateur retrouve en moins de 10 secondes le dernier run Testnet ou l’archive voulue dans un historique de 30 entrées.

**Effort :** moyen · **Impact :** moyen à élevé.

## P2 — Accessibilité, microcopy et qualité de lecture

### 8. Harmoniser l’orientation et le clavier des tabs d’installation

**Problème :** le tablist annonce une orientation verticale tandis que la disposition mobile est horizontale.

**Fichiers :** `apps/dashboard/index.html`, `apps/dashboard/copy-commands.js`, `apps/dashboard/style.css`.

**Changement recommandé :** choisir une orientation cohérente, respecter les flèches clavier correspondantes, conserver un seul tab dans l’ordre de tabulation, et vérifier focus visible sur tous les états.

**Critère de sortie :** test clavier manuel Windows/macOS/Linux ; rôle, orientation, `aria-selected`, `tabindex` et panneau associé restent cohérents au breakpoint mobile.

**Effort :** faible · **Impact :** moyen.

### 9. Respecter `prefers-reduced-motion` partout

**Problème :** la scène animée est réduite côté JavaScript, mais la règle CSS ne neutralise qu’une animation.

**Fichiers :** `apps/dashboard/style.css`, `apps/dashboard/app.js`.

**Changement recommandé :** dans la media query de réduction du mouvement, couper les animations d’arrivée et transitions non nécessaires ; conserver une mise à jour statique compréhensible de la progression. Vérifier aussi que le curseur astronaute n’interfère jamais avec la position du pointeur ou le focus.

**Critère de sortie :** émulation `prefers-reduced-motion: reduce` dans le navigateur ; aucune animation continue ni mouvement d’arrivée non essentiel.

**Effort :** faible · **Impact :** moyen.

### 10. Contextualiser les contrôles et les messages

**Problème :** les boutons de copie ont tous le même nom accessible ; certains labels techniques comme RPC, ledger ou HTTP 402 nécessitent une explication dans le parcours principal.

**Fichiers :** `apps/dashboard/index.html`, `apps/dashboard/copy-commands.js`, `apps/dashboard/app.js`.

**Changement recommandé :**

- Donner aux boutons des noms accessibles liés au titre de leur bloc, ex. « Copier les commandes Windows ».
- Préférer « paiement non confirmé — statut inconnu » à un message qui pourrait laisser entendre « aucun paiement ».
- Expliquer les termes techniques au premier usage et laisser le détail brut dans une section technique repliable.
- Garder les annonces `aria-live` concises : notifier le changement de statut, pas relire tout le rapport à chaque polling.

**Critère de sortie :** chaque bouton a un nom unique et descriptif ; vérification au clavier et avec un lecteur d’écran ; aucun message de statut ne transforme l’incertitude en verdict certain.

**Effort :** faible · **Impact :** moyen.

### 11. Mesurer les contrastes et cibles tactiles

**Problème :** le focus visible est présent, mais les contrastes WCAG et tailles de cible n’ont pas été mesurés sur l’ensemble des états et composants.

**Fichiers :** `apps/dashboard/style.css` et composants correspondants.

**Changement recommandé :** contrôler le texte secondaire, badges, éléments désactivés, erreurs, liens d’explorateur et états sélectionnés ; vérifier cibles tactiles à 200 % de zoom et en usage mobile.

**Critère de sortie :** contraste texte normal ≥ 4,5:1, grand texte ≥ 3:1 et composants/indicateurs pertinents ≥ 3:1 selon WCAG 2.2 AA ; toute exception documentée et corrigée avant présentation.

**Effort :** moyen · **Impact :** moyen.

## P3 — Finition et validation avec de vrais utilisateurs

### 12. Tester le parcours de démo en trois minutes

Faire tester à au moins trois personnes qui ne connaissent pas le projet, sans leur expliquer où cliquer :

1. Depuis l’accueil, expliquer ce que fait Lumaid.
2. Lancer la simulation browser-only.
3. Expliquer la différence entre le cas naïf et la récupération.
4. Trouver l’accès au laboratoire Testnet sans confondre celui-ci avec la simulation.
5. Interpréter `UNKNOWN` sans conclure à un non-paiement.

Noter le temps, les clics inutiles et les mauvaises interprétations, puis corriger les deux difficultés les plus fréquentes.

**Critère de sortie :** au moins 4 participants sur 5 (pour un test complet) accomplissent ces étapes sans aide ; aucun ne croit qu’une simulation a payé sur Stellar ou qu’un `UNKNOWN` prouve l’échec.

### 13. Polir sans surcharger

- Ajuster les espacements, alignements et tailles après correction des parcours, pas avant.
- Garder l’animation cosmique comme signature, mais éviter une animation continue hors de l’accueil ou lorsque l’utilisateur préfère réduire le mouvement.
- Éviter les KPI et graphiques qui ne répondent pas à une question réelle.
- Sur la page résultat, maintenir le résumé utilisateur en premier et les preuves techniques repliées mais faciles à atteindre.

**Critère de sortie :** la démo en trois minutes est fluide, les preuves restent vérifiables, et les animations ne gênent ni la lecture ni la navigation.

## Roadmap temporelle

| Échéance | Actions | Validation attendue |
|---|---|---|
| **Quelques heures** | Confirmation Testnet ; slogan prudent ; séparer statut de run et verdict de paiement. | Tests automatisés des états et confirmation ; aucun succès affiché sur `UNKNOWN`. |
| **Avant le hackathon** | Débordement mobile ; accueil plus explicatif ; choix Simulation/Testnet ; filtres d’historique ; ARIA tabs et mouvement réduit. | Largeurs 320–1024 px, clavier, revue contraste, scénario Testnet confirmé sans effectuer de paiement lors des tests de composant. |
| **Après la présentation** | Tests avec 5 personnes, tests lecteur d’écran, itérations sur les points de friction et microcopy. | Mesures de réussite documentées et pas d’ambiguïté sur les paiements simulés, Testnet ou inconnus. |

## Barème de progression indicatif

| Axe | Référence observée | Cible après P0/P1 |
|---|---:|---:|
| Première impression | 6,5/10 | 8/10 |
| Qualité visuelle | 8/10 | 8,5/10 |
| Clarté | 6,5/10 | 8,5/10 |
| Navigation | 7/10 | 8/10 |
| Expérience des paiements | 7,5/10 | 9/10 |
| Dashboard | 7/10 | 8,5/10 |
| Accessibilité | 6/10 | 8/10 après vérifications manuelles |
| Responsive | 5,5/10 | 8,5/10 |
| Crédibilité | 7/10 | 9/10 |
| Qualité de démonstration | 8,5/10 | 9/10 |

Ces objectifs ne s’additionnent pas mécaniquement pour garantir un score sur 100. Les améliorations d’accessibilité et de compréhension ne seront considérées validées qu’après les tests correspondants.

## Définition de « prêt pour le jury »

- [ ] Le héros explique le problème et ne promet pas une réussite universelle.
- [ ] Une simulation est identifiable comme fictive avant et après son lancement.
- [ ] Un lancement Testnet est confirmé avec récapitulatif du nombre de paiements possibles.
- [ ] Run terminé et paiement confirmé/inconnu/échoué sont visuellement distincts.
- [ ] Le statut `UNKNOWN` ne suggère jamais qu’il n’y a pas eu de paiement.
- [ ] Documentation et Installation ne causent pas de débordement global à 320–1024 px.
- [ ] Parcours complet utilisable au clavier avec focus visible.
- [ ] Préférence de mouvement réduit prise en compte pour toutes les animations non essentielles.
- [ ] Contrastes et cibles tactiles vérifiés sur les états pertinents.
- [ ] Un nouvel utilisateur sait retrouver l’expérience voulue dans l’historique.
- [ ] Au moins cinq personnes ont essayé le parcours et leurs incompréhensions ont été corrigées.
