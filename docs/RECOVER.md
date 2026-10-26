# Reprendre un achat interrompu

```sh
npm run recover -- achat-123
npm run recover -- --list          # achats retrouvables dans .local/
```

Après la fermeture du client ou du runner, une seule commande retrouve l'achat à partir de son identifiant et de ses fichiers sauvegardés, consulte le marchand et le facilitator, tente une reprise sûre et affiche un bilan. Si elle ne peut pas conclure, elle explique pourquoi, indique l'action recommandée et conserve toutes les données. Les serveurs doivent tourner (`npm run dev:facilitator`, puis `dev:merchant` ou `dev:receipt`).

Options : `--mode durable|naive` (seulement si l'identifiant existe dans les deux modes), `--attempts N` (entier de 1 à 20, défaut 6), `--interval S` (0 à 60 secondes, défaut 2), `--json` (bilan structuré sur la sortie standard, progression sur stderr), `--dir <dossier>`.

## Garanties

- **Aucune nouvelle autorisation n'est signée.** La commande n'a pas besoin de `BUYER_SECRET`; elle rejoue uniquement le payload sauvegardé et n'injecte jamais de panne (`X-Chaos-Fault: none`). La prévention d'une nouvelle soumission dépend des journaux durables du marchand et du facilitator ; leur perte simultanée n'est pas couverte par une promesse d'exactly-once.
- Le résultat renvoyé est contrôlé (hash du contenu et hash de transaction), écrit atomiquement dans `.local/result-*.json` **avant** l'accusé, puis son intégrité est revérifiée lors d'une reprise ultérieure. Une perte ou corruption du disque local reste hors garantie.
- **L'autorisation ne part que vers 127.0.0.1.** Une requête ou une autorisation locale incohérente est refusée avant tout envoi.
- Relancer après un PASS dont le résultat local est valide ne fait aucun appel d'achat ; un résultat absent ou invalide est récupéré depuis le marchand.

## Fichiers utilisés (`.local/`, ignoré par Git)

| Fichier | Contenu | Écrit par |
| --- | --- | --- |
| `client-<mode>-<id>.json` | autorisation originale | runner, `smoke:payment` |
| `request-<mode>-<id>.json` | application, URL, chemin et corps de la requête | runner, `smoke:payment` |
| `result-<mode>-<id>.json` | résultat vérifié | `recover` |
| `recovery-<mode>-<id>.json` | journal des étapes de la reprise | `recover` |

Les achats `smoke:payment` créés avant cette commande n'ont pas de fichier `request-*`. Le corps de démonstration est alors supposé et signalé ; s'il est faux, le marchand répond 409 avant tout paiement.

## Diagnostics et actions

| Cause | Signification | Action | Sortie |
| --- | --- | --- | --- |
| `RECOVERED` | Un paiement confirmé, résultat vérifié et accusé | Rien | 0 |
| `CONFIRMATION_PENDING` | Transaction connue, le RPC ne la voit pas encore (pas une preuve d'échec) | Relancer dans quelques secondes | 2 |
| `RPC_UNAVAILABLE` | Le RPC Stellar est injoignable côté marchand ; état inconnu, pas échoué | Relancer plus tard (`npm run check:connections`) | 2 |
| `RESULT_NOT_ACKNOWLEDGED` | Paiement confirmé, accusé manquant | Relancer : le résultat enregistré est restitué puis accusé | 2 |
| `FACILITATOR_UNAVAILABLE` | Le facilitator ne répond pas ; impossible de savoir s'il a reçu la demande | Le démarrer, relancer | 2 |
| `RECEIPT_ABSENT` | Pas de hash connu ou reçu incomplet ; l'absence de reçu ne prouve pas l'absence de paiement | Vérifier indépendamment sur Stellar Testnet et escalader ; pas de nouvelle autorisation avant rapprochement | 1 ou 2 |
| `SERVICE_UNREACHABLE` / `SERVICE_ERROR` | Marchand arrêté, redémarrage ou erreur 503 | Le démarrer, relancer | 2 |
| `AUTHORIZATION_REJECTED` | HTTP 402 lors de la reprise ; cela ne prouve pas que toute tentative antérieure n'a pas été réglée | Vérifier l'historique du compte et rapprocher avant toute nouvelle autorisation | 1 |
| `REQUEST_MISMATCH` | Le marchand refuse le corps ou l'autorisation (409/400) | Vérifier `request-*.json` sans le modifier | 1 |
| `PAYMENT_FAILED`, `PAYMENT_UNSUPPORTED`, `DOUBLE_PAYMENT` | Échec confirmé, transfert non interprétable ou plusieurs paiements | Ne pas relancer ; rapprochement manuel | 1 |
| `RESULT_INTEGRITY`, `WRONG_SERVICE`, `REPORT_UNAVAILABLE` | Hash incohérent, mauvais service, bilan illisible | Voir le message affiché | 1 / 1 / 2 |

Codes de sortie : 0 terminé, 1 bloqué ou erreur (décision humaine), 2 en attente (relancer la même commande est sûr).

## Limites connues

- **Règlement échoué = achat potentiellement bloqué.** Si le facilitator est injoignable (ou rejette l'autorisation) au premier règlement, le journal du marchand peut passer en `UNKNOWN` sans hash et ne resoumet plus. `recover` ne peut pas prouver le non-paiement à partir d'un reçu absent ; il demande un rapprochement manuel. Le test « reçu absent » de `tests/recover.test.ts` documente cette limite.
- La fenêtre de validité d'une autorisation est d'environ 2 minutes (`maxTimeoutSeconds`). Passé ce délai, une autorisation jamais soumise sera probablement rejetée ; la commande le signale mais n'en déduit pas de verdict définitif.
- La distinction entre états inconnus repose sur les messages de l'observateur (`packages/stellar-observer`). Les tests utilisent l'observateur réel : un changement de message les fait échouer.
- Testnet et services locaux uniquement. Les tests utilisent le vrai kit et SQLite derrière un faux réseau ; ils ne remplacent pas une campagne sur Testnet.
