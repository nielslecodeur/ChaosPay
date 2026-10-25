# Contribuer

## Branches

Partir d'une branche main à jour :

```sh
git switch main
git pull --ff-only
git switch -c feat/nom-de-la-tache
```

Utiliser `feat/`, `fix/` ou `docs/` selon la tâche.

## Pull requests

- Limiter chaque PR à une tâche.
- Mettre à jour la documentation nécessaire.
- Lancer les tests, le lint et le build disponibles dans la stack retenue.
- Vérifier `git diff` et `git status` avant de committer.
- Expliquer les vérifications effectuées et faire relire par un coéquipier si possible.
- Ne jamais pousser de force sur main.

## Commits

Utiliser des messages descriptifs, par exemple `feat: ajouter le formulaire de paiement` ou `docs: documenter le lancement local`.
