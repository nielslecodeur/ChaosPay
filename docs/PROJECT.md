# ChaosPay

## Décision

Laboratoire de pannes et de reprise pour les applications payantes sur Stellar. Le dépôt conserve son nom hackmeridian_tristana.

## Problème

Un paiement est confirmé, puis la réponse HTTP disparaît. Après redémarrage, l'application doit retrouver cet achat sans faire repayer le client.

## MVP

- [x] Paiement x402 réel sur Stellar Testnet.
- [x] Vérification indépendante du transfert : hash, actif, payeur, bénéficiaire et montant.
- [x] Coupure contrôlée dans notre marchand après règlement, avant réponse.
- [x] Redémarrage et récupération du même achat avec stockage durable.
- [x] Comparaison entre modes naïf et durable.
- [x] Deux requêtes simultanées pour le même achat.
- [x] Dashboard avec timeline, preuves et export JSON expurgé.
- [x] Kit source partagé, seconde API et trois nouveaux points de panne.
- [x] Rapports avant/après avec durée de reprise et états inconnus.
- [ ] Tests, installation reproductible, documentation et vidéo.

## Première décision technique

Obtenir dans les deux premières heures un paiement Testnet confirmé et son transfert décodé. Sinon réduire le périmètre ou envisager ClaimBack Batch.

## Architecture prévue

TypeScript, x402, Node 24, SQLite et dashboard HTML/CSS/JavaScript. Le même kit équipe la conversion CSV et les reçus JSON. Versions verrouillées dans package-lock.json.

## Invariants

Identifiant et empreinte du contenu par achat. Même identifiant avec un autre contenu : conflit. Tentatives HTTP, paiements et livraisons sont séparés. Montants entiers, sérialisés en chaînes, frais séparés. Un timeout ou un RPC indisponible produit UNKNOWN, jamais automatiquement FAILED ou PASS. SQLite et Stellar ne forment pas une transaction atomique : prévoir la réconciliation.

## Différenciation

Comparer les scénarios existants de Wasit et SELO avant de revendiquer une fonction nouvelle. Apport visé : pannes reproductibles, reprise et conséquences financières vérifiables. Créditer les composants réutilisés et respecter leurs licences.

La fixture naïve peut créer une nouvelle autorisation après timeout ; cela ne prouve pas une faille de replay dans Stellar. Aucune garantie universelle d'exécution unique.

## Hors MVP

Mainnet, argent réel, MPP, LLM, nouveau wallet et prise en charge arbitraire de marchands externes.

## Validation utilisateur

Faire confirmer le besoin par un mentor et chercher une équipe API prête à essayer le scénario.

## Validation du moteur A

Les huit scénarios du runner ont réussi sur chacune des deux API sur Testnet. Les preuves publiques sont dans evidence/public/recovery-campaign.json. Guide : docs/RECOVERY_KIT.md ; contrat : docs/ENGINE_API.md.
