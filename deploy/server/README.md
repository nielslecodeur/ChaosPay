# Serveur autonome : préparation, pas encore déployé

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
