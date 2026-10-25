# Installer ChaosPay

Les installateurs prennent en charge Windows (PowerShell), macOS et Linux (shell). Ils vérifient les prérequis, récupèrent le dépôt si nécessaire et installent les dépendances avec `npm ci`. Ils n'installent pas Node.js ou Git à votre place, ne demandent pas les droits administrateur et ne créent pas de compte Stellar.

Prérequis : Git et Node.js 24 ou plus récent, avec npm. En cas de prérequis manquant, installez-le depuis son site officiel, puis relancez l'installateur.

## Windows

Télécharger [`install.ps1`](https://github.com/nielslecodeur/Lumaid/blob/main/install.ps1) depuis GitHub et l'enregistrer localement. Dans PowerShell, depuis le dossier contenant le fichier :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

Pour installer dans un dossier précis, passer son chemin en argument :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -InstallDir "$HOME\src\chaospay"
```

## macOS et Linux

Télécharger [`install.sh`](https://github.com/nielslecodeur/Lumaid/blob/main/install.sh) depuis GitHub, puis depuis le dossier de téléchargement :

```sh
chmod +x ./install.sh
./install.sh
```

Pour choisir le dossier :

```sh
./install.sh "$HOME/src/chaospay"
```

## Après l'installation

L'installateur n'exécute pas de paiement et ne crée aucun secret. Pour lancer le dashboard en simulation locale :

```sh
npm run dev:dashboard
```

Ouvrir http://127.0.0.1:3002 et sélectionner **Simulation**. La simulation n'effectue aucune transaction réseau.

Pour préparer une démonstration Testnet avec des XLM sans valeur réelle, consulter [SETUP_A.md](docs/SETUP_A.md). Cette étape séparée crée des clés locales dans `.env` et `.local/`; ne partagez et ne publiez jamais ces fichiers.

Les scripts exécutent `npm ci`, qui installe les dépendances du lockfile et peut exécuter leurs scripts d'installation. Consultez le code avant de lancer un installateur téléchargé. Le dépôt public est [nielslecodeur/Lumaid](https://github.com/nielslecodeur/Lumaid).
