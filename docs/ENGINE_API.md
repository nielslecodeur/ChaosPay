# Contrat du moteur pour l'IA B

Serveur marchand : http://127.0.0.1:3001. Facilitator : http://127.0.0.1:4022. Réseau exclusivement stellar:testnet. Les montants sont des chaînes d'entiers atomiques, jamais des nombres flottants.

## Santé

GET /health : status, network, tokenContract, amountAtomic, assetSymbol et assetDecimals. Aucun secret.

## Achat

POST /purchases/:purchaseId?mode=durable (ou naive)

Corps : {"rows":[{"item":"demo","amount":42}]}

Identifiant : 1 à 80 caractères alphanumériques, tirets ou underscores.

Sans PAYMENT-SIGNATURE : HTTP 402, corps x402 PaymentRequired v2 et en-tête PAYMENT-REQUIRED encodé JSON/base64.

Avec PAYMENT-SIGNATURE : payload x402 v2 encodé JSON/base64. Le script scripts/smoke-payment.ts est le client de référence pour signer le challenge et conserver le payload avant envoi.

X-Chaos-Fault : none, drop ou crash. Le hook agit seulement sur la première exécution de ce payload :
- drop : coupe la socket après paiement confirmé et sauvegarde du CSV.
- crash : quitte le marchand, code 86, après paiement confirmé avant sauvegarde du CSV.
- none : réponse normale.

HTTP 200 : purchaseId, mode, txHash, recovered, csv, csvHash et evidence. csvHash est SHA-256 de JSON.stringify(csv). evidence contient status, txHash, transfers et reason.

HTTP 202 : observation incomplète/échec/non supporté, avec status, txHash et reason. Réutiliser le payload original pour réconcilier ; ne pas créer automatiquement de nouvelle autorisation.

HTTP 409 : identifiant durable réutilisé avec un contenu ou un payload différent. HTTP 402 : vérification du paiement rejetée. HTTP 400 : entrée invalide. HTTP 503 : interruption ou erreur à réconcilier.

## Accusé du résultat

POST /purchases/:purchaseId/ack?mode=durable

En-tête PAYMENT-SIGNATURE original. Corps : {"csvHash":"hash renvoyé par le moteur"}.

Le client vérifie le CSV, puis accuse sa réception. Sans accusé, le rapport ne doit pas annoncer la récupération. Cet accusé est applicatif, pas une preuve de lecture humaine.

## Rapport

GET /reports/:purchaseId?mode=durable

Champs :
- schemaVersion : 1
- purchaseId, mode, network, tokenContract
- expectedAmountAtomic et settledAmountAtomic
- transfers : [{txHash, tokenContract, from, to, amountAtomic, ledger}]
- responseRecovered : accusé du client reçu
- verdict : PASS, FAIL, UNKNOWN ou UNSUPPORTED
- reason, observations, attempts

Le runner ajoute runId, scenario et sa timeline autour de ce rapport. Le nombre de lignes attempts correspond aux autorisations enregistrées, pas à toutes les requêtes HTTP ; instrumenter chaque appel dans le runner.

Un PASS exige un transfert attendu et un accusé du résultat. Deux transferts confirmés dépassant le prix d'un achat produisent FAIL. Un RPC indisponible ou un hash manquant reste UNKNOWN.

## Modes de démonstration

durable : l'identifiant d'achat et son contenu restent attachés à une autorisation. La reprise ne soumet pas un autre paiement.

naive : une nouvelle autorisation pour le même identifiant est traitée délibérément comme un nouvel achat. Pour reproduire :
npm run smoke:payment -- demo-naive naive drop
npm run smoke:payment -- demo-naive naive none --new-authorization

La faille appartient à notre fixture. Ce test ne démontre pas une double dépense en rejouant une autorisation Stellar.

## Reprise

Le marchand sauvegarde l'empreinte du payload avant de demander le règlement. Le facilitator sauvegarde le hash de transaction avant le broadcast. Après une interruption, le marchand consulte le reçu du facilitator, puis vérifie le transfert via RPC. Un règlement incertain n'est jamais soumis à nouveau par le journal.

Les bases SQLite et fichiers .local/ doivent être conservés. Perdre les deux journaux peut empêcher la réconciliation ; aucune garantie universelle annoncée.

Le facilitator traite séquentiellement les règlements pour éviter les conflits de numéros de séquence du compte unique. Les routes /verify et /settle sont les interfaces standard x402. GET /receipts/:authDigest est une extension locale de reprise ; elle ne retourne aucune clé ni autorisation.

## Intégration UI

Utiliser un backend du runner ou un proxy de développement local. Le moteur ne fournit pas de CORS. Ne pas exposer le facilitator, les contrôles de panne ou les autorisations à un service public. Un dashboard peut consommer les preuves publiques sans connaître les clés.
