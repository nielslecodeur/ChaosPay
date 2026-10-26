# Installer simplement Lumaid

## Sans installation

Ouvrez https://nielslecodeur.github.io/Lumaid/ pour les simulations. Cette version ne lance pas de paiements Testnet.

## Laboratoire local Windows

1. Sur le dépôt GitHub, cliquez sur **Code → Download ZIP**.
2. Extrayez tout le ZIP dans un dossier personnel accessible en écriture.
3. Double-cliquez sur **Lancer-Lumaid.cmd**.
4. Attendez la préparation initiale : le navigateur s'ouvre sur http://127.0.0.1:3002.

Windows 64 bits et une connexion Internet sont nécessaires. Git, Node.js et npm n'ont pas à être installés séparément. Le lanceur télécharge Node.js 24.12.0 depuis nodejs.org, vérifie le SHA256 avec le manifeste officiel puis installe les dépendances du lockfile. Le moteur est conservé dans `%LOCALAPPDATA%\Lumaid\runtime`. Le PATH système n'est pas modifié et aucun droit administrateur n'est demandé.

Les lancements suivants réutilisent les dépendances tant que le lockfile ne change pas. Gardez la fenêtre ouverte ; Ctrl+C arrête le serveur. Si le port 3002 est occupé, fermez le serveur précédent. Si Windows bloque le téléchargement, vérifiez sa provenance avant de débloquer le fichier.

## Préparer Testnet

Arrêtez le serveur, puis double-cliquez sur **Configurer-Testnet.cmd**. Le script crée des comptes et demande des XLM Testnet gratuits. Si `.env` existe, il conserve les comptes et vérifie leurs connexions. Relancez ensuite **Lancer-Lumaid.cmd** et choisissez une expérience Testnet.

Conservez `.env` et `.local` : ils contiennent les clés, journaux et autorisations nécessaires à la reprise. Ne les partagez pas. Si Friendbot échoue après création de `.env`, les comptes ne sont pas recréés : suivez le message affiché pour terminer leur financement.

## Limites

Ce lanceur prépare le laboratoire Windows. L'intégration du kit dans une API Node reste décrite dans [QUICKSTART.md](QUICKSTART.md). macOS et Linux peuvent utiliser la démo web ou l'installation développeur du README. Aucun package npm n'est publié par le lanceur.
