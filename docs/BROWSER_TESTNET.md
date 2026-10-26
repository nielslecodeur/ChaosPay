# Démo Testnet sans installation

Ouvrir https://nielslecodeur.github.io/Lumaid/#local-lab après le déploiement GitHub Pages.

1. Choisir **Testnet** : le client de facture scripté est sélectionné automatiquement.
2. Choisir **The response disappears**, puis **Run Testnet experiment** et confirmer.
3. Attendre `RESPONSE_LOST`. Deux comptes temporaires sont financés par Friendbot, puis un paiement réel de **0,01 XLM de test**, hors frais réseau, est envoyé.
4. Recharger la page pour montrer que la référence survit.
5. Cliquer **Recover saved purchase (no new payment)**.
6. Montrer le reçu reconstruit et ouvrir la transaction dans Stellar Expert. La reprise consulte le hash initial : elle ne signe ni ne soumet de transaction.

Pour un achat normal, sélectionner le scénario sans panne. Pour un autre achat, archiver explicitement la preuve après récupération, puis confirmer le nouveau paiement.

## Fonctionnement et limites

- Aucun serveur Lumaid, Node.js ou Ollama n'est requis chez le visiteur. Les fichiers sont servis par GitHub Pages ; le navigateur appelle Friendbot et Horizon Testnet directement.
- Le journal est enregistré dans `localStorage` **avant** l'envoi. Les clés privées sont uniquement temporaires en mémoire et ne sont jamais enregistrées. Ne jamais importer de portefeuille personnel ni envoyer de vrais fonds à ces comptes.
- Les onglets sont coordonnés avec Web Locks. HTTPS et un navigateur compatible sont nécessaires. Le stockage doit être accessible.
- Une reprise vérifie le hash, l'enveloppe, la réussite, l'émetteur, le destinataire, l'actif natif et le montant. Une confirmation introuvable ou inaccessible reste incertaine : aucune nouvelle transaction n'est créée.
- Fermer l'onglet juste avant l'envoi peut laisser une intention sans transaction. Cette démo ne renvoie pas automatiquement la transaction. Conserver le hash et diagnostiquer ; ne pas présenter cet état comme un succès.
- Effacer le stockage ou changer de navigateur fait perdre la référence active. Les preuves archivées restent locales. Les réinitialisations Testnet peuvent rendre l'historique indisponible.
- **Le client est scripté, sans modèle IA.** Le reçu de facture est déterministe et reconstruit localement. Ce n'est ni un marchand x402, ni l'exécution du package serveur de reprise, ni une preuve de récupération d'un résultat métier distant. Pour cela, utiliser l'intégration serveur existante.
- Seulement achat normal et perte de réponse sont proposés ici. Friendbot/Horizon peuvent être indisponibles ou limiter les requêtes : aucune disponibilité permanente n'est garantie.

## Validation

`npm test` inclut les tests du moteur navigateur : achat normal, perte de réponse, reprise avec une nouvelle instance, timeout d'envoi, confirmation indisponible, transaction échouée et stockage bloqué.

Une validation dans Edge, servant uniquement les fichiers statiques et appelant directement Testnet, a confirmé un paiement, rechargé la page puis récupéré le reçu avec **une seule requête de soumission**. Preuve publique : `evidence/public/browser-testnet.json`. Cette preuve ne constitue pas un test du backend marchand.

## Déploiement

Le workflow `Deploy browser demo` publie `apps/dashboard` lorsque ses fichiers sont poussés sur `main`. Aucun secret GitHub ou service d'hébergement supplémentaire n'est nécessaire. Attendre la réussite du workflow, puis recharger le site.

Le SDK Stellar navigateur 16.4.1 est inclus avec sa licence dans `apps/dashboard/vendor`. Il correspond à la dépendance verrouillée du projet ; pas de script distant chargé depuis un CDN.
