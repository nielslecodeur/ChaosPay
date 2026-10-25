# API de vérification de factures

Consommateur indépendant du paquet @chaospay/recovery, écrit par l'équipe ChaosPay. Ce n'est pas une intégration client externe.

Le serveur conserve ses routes /health et /catalog et monte les routes payantes sous /paid. La fonction métier calcule les totaux avec BigInt. Aucun paiement de facture n'est effectué.

Pour un essai reproductible : npm run verify:integration depuis la racine ChaosPay. Le script copie ce dossier hors du dépôt, fournit vendor/chaospay-recovery-0.1.0.tgz, installe les dépendances, puis valide le consommateur et les scénarios Testnet.

Pour une installation manuelle : placer l'archive compilée dans vendor/, npm install, configurer MERCHANT_ADDRESS et FACILITATOR_URL, puis npm start. Le facilitator doit déjà fonctionner. Les clés du client et du facilitator ne sont pas nécessaires à ce serveur.

Guide complet : docs/INTEGRATION_A.md dans le dépôt ChaosPay.
