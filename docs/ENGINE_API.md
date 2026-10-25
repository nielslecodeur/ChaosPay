# Contrat moteur et runner

Réseau : stellar:testnet uniquement. CSV : http://127.0.0.1:3001 ; reçus JSON : http://127.0.0.1:3003 ; facilitator : http://127.0.0.1:4022 ; dashboard : http://127.0.0.1:3002.

## Achat

POST /purchases/:purchaseId?mode=durable (ou naive). Identifiant : 1 à 80 caractères alphanumériques, tirets ou underscores.

Corps CSV :
```json
{"rows":[{"item":"demo","amount":42}]}
```

Corps reçus :
```json
{"invoice":{"reference":"demo","amountMinor":"4200","currency":"EUR"}}
```

Le reçu est un exemple : le paiement rémunère sa génération, pas la facture.

Sans PAYMENT-SIGNATURE : HTTP 402, corps x402 PaymentRequired v2 et en-tête PAYMENT-REQUIRED JSON/base64. Avec PAYMENT-SIGNATURE : payload x402 v2 JSON/base64. Conserver le payload, le corps et l'identifiant avant envoi. L'URL du challenge doit correspondre au service et à l'achat.

X-Chaos-Fault : none, before-submit, confirmation-lost, crash, drop, ack-lost. Points précis et limites dans [RECOVERY_KIT.md](RECOVERY_KIT.md). Le runner simule ack-lost en omettant l'accusé ; le hook moteur enregistre le début de cette interruption.

HTTP 200 : purchaseId, mode, status READY, txHash, recovered, result, resultHash, evidence. Le CSV conserve aussi les alias csv et csvHash. Hash : SHA-256 de JSON.stringify(result).

HTTP 202 : status UNKNOWN, FAILED ou UNSUPPORTED, txHash et reason ; aucune preuve de livraison. Reprendre avec l'autorisation originale, sans re-signature automatique.

HTTP 409 : corps ou autorisation en conflit, ou autre URL de ressource. HTTP 402 : vérification rejetée. HTTP 400 : entrée invalide. HTTP 503 : erreur à réconcilier.

## Accusé

POST /purchases/:purchaseId/ack?mode=durable avec PAYMENT-SIGNATURE original et corps {"resultHash":"hash retourné"}. csvHash reste accepté pour les clients CSV existants.

Le client vérifie le résultat avant d'accuser. Sans accusé, un paiement correct reste UNKNOWN.

## Rapport

GET /reports/:purchaseId?mode=durable retourne :
- schemaVersion: 1, purchaseId, mode, network, serviceId, tokenContract ;
- expectedAmountAtomic et settledAmountAtomic (chaînes d'entiers) ;
- transfers: [{txHash, tokenContract, from, to, amountAtomic, ledger}] ;
- responseRecovered, verdict, reason, observations et attempts ;
- recoveryMs (nombre ou null), unknownObservations (entier).

PASS exige transfert exact et accusé ; dépassement du prix confirmé : FAIL ; absence de preuve : UNKNOWN. attempts compte les autorisations, pas les appels HTTP.

## Facilitator

POST /verify et POST /settle : interfaces x402.
POST /submit : extension locale, HTTP 202 après enregistrement durable de la demande, sans attendre la confirmation ; peut rester UNKNOWN après une panne.
GET /receipts/:authDigest : reçu durable local. Un 404 ne prouve pas le non-paiement. Le hash final est enregistré avant broadcast ; un règlement incertain n'est pas soumis une seconde fois.

## Runner

POST /api/runs, en-tête X-ChaosPay-Local: 1 :
```json
{"scenario":"confirmation-lost","source":"TESTNET","application":"receipt"}
```

application : csv (défaut) ou receipt. source : SIMULATED ou TESTNET.
Scénarios : baseline, before-submit, confirmation-lost, crash, drop, ack-lost, concurrent, comparison.

GET /api/state : scénarios, exécutions, état busy.
GET /api/runs/:id/export : exécution filtrée avec reports finaux et checkpoints avant reprise.

Les simulations sont fictives. ARCHIVE désigne une preuve historique, pas une nouvelle vérification réseau. Les contrôles restent locaux ; aucun CORS public ni secret dans l'export.
