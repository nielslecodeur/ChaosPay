# Réglages GitHub

Dépôt : https://github.com/nielslecodeur/hackmeridian_tristana

## À configurer dans les paramètres GitHub

- Vérifier la visibilité avec l'équipe et inviter les collaborateurs.
- Autoriser les fusions par squash et la suppression automatique des branches fusionnées.
- Protéger main : pull request avant fusion, résolution des conversations, blocage des force pushes et des suppressions.
- Demander une approbation si un coéquipier peut relire.
- Activer les alertes de sécurité et la détection de secrets si disponibles pour ce dépôt.
- Ajouter une description et les sujets du projet.

## Après le choix de la stack

- Documenter installation, développement, tests, lint et build dans le README.
- Ajouter ces contrôles dans GitHub Actions, puis les rendre obligatoires après leur premier passage.
- Configurer Dependabot pour les gestionnaires de dépendances utilisés.
- Ajouter `.env.example` avec les noms des variables, sans secrets.
- Stocker les secrets de déploiement dans GitHub Actions Secrets.
- Choisir une licence avec l'équipe.

## Publier la préparation après relecture

```sh
git switch -c chore/github-setup
git add README.md .gitignore .gitattributes .editorconfig CONTRIBUTING.md docs .github
git commit -m "chore: préparer le dépôt pour le hackathon"
git push -u origin chore/github-setup
```

Ouvrir ensuite une pull request sur GitHub.
