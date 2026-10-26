# Serveur autonome : préparation, pas encore déployé

**Ce guide s'exécute sur une nouvelle VM Ubuntu, pas dans le terminal Windows du projet**, sauf l'étape SSH indiquée. Ne pas lancer toute la page d'un bloc : vérifier le résultat de chaque étape. Il prépare une démo privée Testnet ; il ne garantit pas sa disponibilité permanente.

Objectif : le runner, ses sous-processus, les journaux SQLite et Ollama tournent sur une VM Linux. Le PC du développeur peut être arrêté. Le site complet est servi par ce serveur sous HTTPS. GitHub Pages reste la vitrine statique ; un lien vers le serveur sera ajouté dès que son URL existe.

## Budget zéro : condition préalable

Créer un compte Oracle Cloud et obtenir une VM **Always Free eligible** dans la région principale. La documentation consultée le 26 octobre 2026 annonce pour Ampere A1 un quota équivalent à **2 OCPU / 12 Go RAM**, et 200 Go de stockage bloc cumulé. Vérifier le quota réellement affiché dans le compte, les ressources déjà utilisées et le coût estimé avant création. Ne pas passer au payant ni utiliser une instance facturée pour contourner un manque de capacité.

Source : https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm

Capacité gratuite et disponibilité non garanties ; les instances inactives peuvent être récupérées. Les performances du modèle qwen2.5 sur CPU ARM restent à mesurer. Prévoir des sauvegardes privées des journaux. Le budget zéro ne constitue pas une garantie de disponibilité permanente.

## Préparation de la VM

1. Ubuntu ARM64 ou x64, stockage persistant et accès SSH. Seuls SSH (limité à l'administrateur), HTTP 80 et HTTPS 443 doivent être ouverts. Garder 3002, 3014, 4032 et 11434 privés.
2. Installer Git, Node.js 24 compatible avec l'architecture, Ollama et Caddy >= 2.8 depuis leurs distributions officielles. Vérifier que Node est accessible sous `/usr/bin/node`, sinon adapter le service.
3. Créer l'utilisateur système `lumaid`, cloner le dépôt dans `/opt/lumaid`, puis installer les dépendances avec `npm ci`. Ne pas réutiliser un node_modules Windows.
4. Initialiser `.local` avec propriétaire `lumaid`, mode 700. Exécuter `npm run setup:testnet` sous cet utilisateur pour créer de nouvelles clés Testnet, puis `npm run check:connections`. Garder `.env` lisible uniquement par cet utilisateur. Ne pas écraser un `.env` existant.
5. Démarrer Ollama sur loopback et télécharger `qwen2.5:latest`. Vérifier `/api/tags` sur le serveur. Choisir un autre modèle nécessite une nouvelle validation de la démo.
6. Installer `lumaid.service` dans `/etc/systemd/system/`, puis `sudo systemctl daemon-reload` et `sudo systemctl enable --now lumaid`.

Le service charge `.env` lors des exécutions Testnet. Son durcissement autorise l'écriture uniquement dans `.local` ; la génération initiale de `.env` doit donc précéder son démarrage. Conserver tout le dossier `.local`, pas seulement l'historique du runner.

## HTTPS et accès

Utiliser un nom DNS ou sous-domaine gratuit pointant vers la VM. Configurer les variables `LUMAID_DOMAIN` (nom seul, sans schéma) et `LUMAID_PASSWORD_HASH` dans l'environnement systemd de Caddy. Générer le hash avec `caddy hash-password` ; ne pas committer le mot de passe.

Copier le Caddyfile fourni, puis **valider sur la VM** avec `caddy validate --config /etc/caddy/Caddyfile` dans un environnement contenant les deux variables avant de redémarrer Caddy. Le proxy exige une authentification, refuse les origines étrangères, puis traduit Host/Origin pour le runner loopback. Le garde d'écriture `X-ChaosPay-Local` reste exigé. Aucun endpoint de paiement ni Ollama n'est exposé directement.

La démo distante est réservée aux personnes disposant du mot de passe, pas un service public de paiement sans limites. L'avis Zod documenté dans `docs/versions.md` reste ouvert : ne pas déclarer cette configuration prête pour la production.

## Validation obligatoire avant de publier l'URL

- [ ] VM réellement gratuite provisionnée et accès SSH disponible.
- [ ] Configuration Caddy validée, HTTPS et authentification vérifiés.
- [ ] Accès sans mot de passe refusé ; requête avec Origin étranger refusée.
- [ ] `/runtime-config.js` identifie le backend ; le navigateur appelle `/api/state` sur le serveur distant.
- [ ] Achat normal puis perte de réponse et récupération avec un règlement attendu sur Testnet.
- [ ] Reprise avec les mêmes journaux après redémarrage du service.
- [ ] Test depuis un autre appareil, PC du développeur éteint.
- [ ] Sauvegarde chiffrée des données de reprise hors VM.

Ces fichiers ne créent pas de compte, de VM ou de DNS. Aucun serveur distant n'a encore été provisionné ; aucun test d'hébergement Linux/Caddy/Ollama ARM n'est annoncé comme passé.

## Pas à pas : 1. Créer la machine gratuite

Dans la console Oracle Cloud :

1. Ouvrir **Compute → Instances → Create instance**.
2. Nommer la machine `lumaid-demo`, choisir une image Ubuntu compatible ARM et la forme `VM.Standard.A1.Flex`.
3. Sélectionner au plus **2 OCPU et 12 Go de mémoire**, dans les quotas gratuits disponibles du compte. Vérifier les indications de gratuité et le récapitulatif financier ; ne pas valider une ressource facturée ou seulement couverte par un crédit d'essai temporaire.
4. Garder un disque de démarrage persistant, par exemple 50 Go, si le quota gratuit restant le permet. Ne pas ajouter de sauvegarde automatique ou autre option facturée.
5. Choisir un sous-réseau public avec adresse IP publique et accès Internet.
6. Ajouter une clé SSH publique ou télécharger la paire générée. Garder la clé privée sur le PC ; ne pas la mettre sur GitHub ni dans le chat.
7. Créer la machine et noter son IP publique. Si la capacité gratuite est indisponible, arrêter ici : aucun serveur n'a été obtenu et le site ne peut pas encore exécuter Testnet.

Dans les règles réseau OCI du sous-réseau/NSG : autoriser TCP 22 depuis votre IP publique `/32`, et TCP 80/443 depuis Internet. Vérifier aussi le pare-feu Ubuntu : les mêmes accès doivent être autorisés. Ne jamais supprimer toutes les règles du pare-feu pour résoudre un problème de connexion.

## 2. Se connecter depuis Windows

Dans PowerShell, remplacer les deux valeurs :

```powershell
ssh -i "C:\chemin\cle-privee.key" ubuntu@IP_PUBLIQUE
```

Vérifier l'empreinte SSH avec celle du serveur via la console avant d'accepter la première connexion. **Toutes les commandes suivantes sont exécutées dans la session SSH Ubuntu.**

```bash
uname -m
free -h
df -h /
sudo apt-get update
sudo apt-get install -y git curl ca-certificates xz-utils gnupg
```

Attendu : `aarch64` pour Ampere, environ 12 Go de RAM et suffisamment de disque pour le modèle et les dépendances.

## 3. Installer Node.js

Installation isolée d'une version précise compatible avec le projet. Le script refuse une architecture inconnue et vérifie le SHA256 officiel avant extraction.

```bash
(
set -eu
case "$(uname -m)" in
  aarch64) NODE_ARCH=arm64 ;;
  x86_64) NODE_ARCH=x64 ;;
  *) echo 'Architecture non prise en charge'; exit 1 ;;
esac
NODE_VERSION=24.12.0
NODE_ARCHIVE="node-v${NODE_VERSION}-linux-${NODE_ARCH}"
NODE_TMP=$(mktemp -d)
cd "$NODE_TMP"
curl -fSLO "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}.tar.xz"
curl -fSLO "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
grep "  ${NODE_ARCHIVE}.tar.xz$" SHASUMS256.txt | sha256sum -c -
sudo tar -xJf "${NODE_ARCHIVE}.tar.xz" -C /opt
sudo ln -s "/opt/${NODE_ARCHIVE}/bin/node" /usr/local/bin/node
sudo ln -s "/opt/${NODE_ARCHIVE}/bin/npm" /usr/local/bin/npm
)
node --version
npm --version
```

Si les liens existent déjà, ne pas les écraser : vérifier leur version. Les commandes ci-dessus installent Node sous `/usr/local/bin/node` ; adapter le service à ce chemin à l'étape 6. La version est celle utilisée par le projet, pas une promesse de dernière version disponible.

## 4. Installer Lumaid et préparer Testnet

Sur une machine neuve, où `/opt/lumaid` et l'utilisateur `lumaid` n'existent pas encore :

```bash
sudo useradd --system --create-home --home-dir /var/lib/lumaid --shell /usr/sbin/nologin lumaid
sudo install -d -o lumaid -g lumaid -m 750 /opt/lumaid
sudo -u lumaid git clone https://github.com/nielslecodeur/Lumaid.git /opt/lumaid
cd /opt/lumaid
sudo -u lumaid /usr/local/bin/npm ci --include=dev
sudo -u lumaid /usr/local/bin/npm run typecheck
sudo -u lumaid /usr/local/bin/npm test
sudo install -d -o lumaid -g lumaid -m 700 /opt/lumaid/.local
sudo -u lumaid /usr/local/bin/npm run setup:testnet
sudo chmod 600 /opt/lumaid/.env
sudo -u lumaid /usr/local/bin/npm run check:connections
```

Les dépendances de développement sont nécessaires à l'exécution actuelle (`tsx`). Si `.env` existe déjà, sauter `setup:testnet` et conserver les clés. Si Friendbot échoue, ne pas effacer `.env` pour réessayer : terminer le financement des adresses publiques indiquées par le script.

Les contrôles de connexion peuvent signaler des services marchand/facilitator non démarrés ; le runner les démarre lors de l'expérience. Vérifier surtout réseau, comptes, configuration et soldes. Les messages de succès réels font foi.

## 5. Installer Ollama sur le serveur

Télécharger et examiner le script officiel, puis l'exécuter :

```bash
curl -fsSL https://ollama.com/install.sh -o /tmp/lumaid-ollama-install.sh
less /tmp/lumaid-ollama-install.sh
sh /tmp/lumaid-ollama-install.sh
sudo systemctl enable --now ollama
ollama pull qwen2.5:latest
curl -fsS http://127.0.0.1:11434/api/tags
```

La liste doit contenir exactement `qwen2.5:latest`. Ollama doit écouter sur loopback, pas sur une interface publique. Les appels locaux peuvent être plus lents sur le CPU de la VM que sur la carte graphique du PC ; le délai actuel par appel du modèle est limité à 180 secondes. S'il est dépassé, diagnostiquer les performances avant de déclarer le parcours fonctionnel.

Documentation : [installation Linux Ollama](https://docs.ollama.com/linux).

## 6. Activer le service Lumaid

```bash
sudo cp /opt/lumaid/deploy/server/lumaid.service /etc/systemd/system/lumaid.service
sudo sed -i 's|ExecStart=/usr/bin/node |ExecStart=/usr/local/bin/node |' /etc/systemd/system/lumaid.service
sudo systemctl daemon-reload
sudo systemctl enable --now lumaid
sudo systemctl status lumaid --no-pager
curl -fsS http://127.0.0.1:3002/runtime-config.js
curl -fsS http://127.0.0.1:3002/api/state
```

Attendu : service `active (running)`, configuration `globalThis.LUMAID_SERVER = true;`, puis un état JSON. Les journaux sont accessibles avec `sudo journalctl -u lumaid -n 100 --no-pager`. Ne pas copier de fichiers secrets dans un rapport de diagnostic.

## 7. Obtenir un nom DNS et installer Caddy

Créer un enregistrement DNS **A** pour un domaine/sous-domaine que vous contrôlez, vers l'IP publique de la VM. Pour rester à 0 €, utiliser un sous-domaine gratuit ou déjà disponible. Ne pas acheter un domaine dans ce parcours. Ne pas ajouter d'AAAA si IPv6 n'est pas configuré.

Installer Caddy avec les commandes Ubuntu de sa [documentation officielle](https://caddyserver.com/docs/install#debian-ubuntu-raspbian). Vérifier ensuite :

```bash
caddy version
sudo cp /opt/lumaid/deploy/server/Caddyfile /etc/caddy/Caddyfile
caddy hash-password
```

Choisir un mot de passe de démo et conserver le hash affiché. Créer le fichier privé :

```bash
sudo install -m 600 /dev/null /etc/caddy/lumaid.env
sudoedit /etc/caddy/lumaid.env
```

Y écrire les **vraies valeurs**, sans chevrons ni espaces autour de `=` :

```dotenv
LUMAID_DOMAIN=lab.votre-sous-domaine.example
LUMAID_PASSWORD_HASH='$2a$...hash-complet-produit-par-caddy...'
```

Les apostrophes préservent le hash littéral ; ne pas mettre le mot de passe en clair. Ne pas relancer la commande `install` ci-dessus sur un fichier déjà configuré : elle le viderait.

```bash
sudo systemctl edit caddy
```

Dans l'éditeur, ajouter :

```ini
[Service]
EnvironmentFile=/etc/caddy/lumaid.env
```

Valider avec le même environnement que le service, puis démarrer HTTPS :

```bash
sudo systemctl daemon-reload
sudo systemd-run --wait --pipe --collect --property=EnvironmentFile=/etc/caddy/lumaid.env /usr/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl restart caddy
sudo systemctl status caddy --no-pager
```

La validation doit réussir avant le redémarrage. Caddy gère le certificat HTTPS lorsque le nom DNS pointe vers la VM et que 80/443 sont accessibles. L'identifiant de connexion du navigateur sera **`demo`**, avec le mot de passe choisi.

## 8. Vérifier depuis un autre appareil

Remplacer le domaine, depuis un terminal disposant de curl :

```bash
curl -I https://lab.votre-sous-domaine.example/
curl -u demo https://lab.votre-sous-domaine.example/runtime-config.js
curl -u demo -H 'Origin: https://untrusted.example' -i https://lab.votre-sous-domaine.example/api/state
```

Attendus : **401** sans identifiants, configuration serveur avec identifiants, **403** avec origine étrangère. `curl -u demo` demande le mot de passe sans le mettre dans l'historique de commandes.

Ouvrir `https://lab.votre-sous-domaine.example/#local-lab` dans le navigateur. Sélectionner l'agent facture, le scénario de réponse perdue, puis confirmer Testnet. Vérifier successivement appel d'achat, interruption, appel de reprise, résultat et rapport. Un texte rassurant du modèle ne remplace pas un verdict fondé sur le transfert.

Refaire depuis un téléphone en réseau mobile, **PC de développement éteint**. Garder le hash et le rapport. Cette étape établit l'indépendance réelle du PC.

## 9. Relier GitHub Pages au serveur

La page GitHub Pages ne devient pas un backend avec un simple push. Une fois l'étape 8 validée, ajouter sur la vitrine un lien **Ouvrir le laboratoire Testnet** vers l'URL HTTPS obtenue. L'utilisateur s'authentifie sur le serveur ; aucun mot de passe n'est intégré au JavaScript public.

Ne pas configurer le site public pour appeler arbitrairement une API distante avec des clés embarquées. Dans cette architecture, le laboratoire et son API partagent le même domaine HTTPS sur la VM.

## 10. Reprise, mises à jour et sauvegarde

Pour reprendre un achat déjà enregistré, attendre qu'aucune expérience ne soit active, puis dans `/opt/lumaid` :

```bash
sudo -u lumaid /usr/local/bin/npm run recover:agent -- IDENTIFIANT_DU_RUN
```

Cette commande nécessite les journaux originaux, réutilise l'achat et n'appelle pas le modèle. Conserver le rapport et redémarrer le runner lorsqu'il est inactif pour qu'il recharge l'historique modifié.

Avant une mise à jour, arrêter le runner uniquement lorsqu'il n'est pas occupé, sauvegarder `.env` et **tout** `.local` (SQLite, WAL, autorisations et historique) dans une archive privée chiffrée hors VM. Ne pas sauvegarder ces données dans Git ou dans un répertoire web. Une sauvegarde cohérente se fait services de paiement arrêtés ; une archive non chiffrée contient les secrets.

```bash
sudo systemctl stop lumaid
cd /opt/lumaid
# Effectuer et vérifier la sauvegarde privée avant de continuer.
sudo -u lumaid git pull --ff-only
sudo -u lumaid /usr/local/bin/npm ci --include=dev
sudo -u lumaid /usr/local/bin/npm run typecheck
sudo -u lumaid /usr/local/bin/npm test
sudo systemctl start lumaid
```

Exécuter les commandes séparément : en cas d'échec des tests, ne pas reprendre automatiquement le service avec une version non validée. Prévoir également une sauvegarde des modèles/configuration si leur retéléchargement est incompatible avec le temps de reprise souhaité.

## Dépannage rapide

| Symptôme | Contrôle |
| --- | --- |
| SSH inaccessible | IP publique, clé, utilisateur Ubuntu, règles OCI et pare-feu |
| Certificat HTTPS indisponible | DNS A, absence d'AAAA erroné, ports 80/443 et logs Caddy |
| Caddy refuse de démarrer | Variables de son EnvironmentFile, hash complet et `caddy validate` |
| Page OK mais bouton Testnet désactivé | Ouvrir le domaine de la VM, pas GitHub Pages ; vérifier `/runtime-config.js` |
| Agent interrompu avant achat | `/api/tags`, nom du modèle, mémoire disponible et logs Ollama |
| Port occupé | Une ancienne commande manuelle peut occuper 3014/4032 ; identifier son propriétaire avant arrêt |
| UNKNOWN après paiement | Conserver journaux et autorisation ; reprendre le même run, ne pas créer un nouvel achat |
| Serveur gratuit indisponible | Vérifier capacité/quota/récupération d'instance ; ne pas basculer sur du payant avec ce budget |

## État de livraison

Le guide et les configurations sont préparés. **La création de VM, le DNS, la validation Caddy et l'essai Testnet sur serveur distant restent à effectuer.** Les tests locaux de Lumaid ne remplacent pas ces vérifications de déploiement.
