# Prompt Codex — exécuter la démo agent Ollama + Lumaid

Copie le bloc ci-dessous dans Codex (ou un autre agent) depuis la racine du dépôt.

---

Tu es sur le dépôt Lumaid / ChaosPay (Windows, PowerShell). **N’implémente rien de nouveau** sauf si une étape échoue et qu’un correctif minimal est nécessaire. Ton job : **exécuter la démo agent Ollama**, montrer les résultats, et résumer clairement ce qui s’est passé pour une vidéo / présentation.

## Objectif de la démo

1. Un agent IA local (Ollama `qwen2.5`) appelle l’outil `purchase_invoice_check`.
2. Paiement x402 réel sur **Stellar Testnet** (0,01 XLM test).
3. Panne injectée `drop` : réponse perdue **après** règlement → statut `PENDING`.
4. L’agent appelle `recover_purchase` (Lumaid) → même achat, résultat récupéré → `COMPLETED`.
5. Résultat métier : total calculé `2900`, déclaré `3000`, écart `100` (pas de devise).
6. **Un seul** règlement Testnet attendu ; afficher le `txHash`.

Le paiement achète la **vérification arithmétique**, il ne règle pas la facture.

## Contraintes

- Ne jamais afficher, committer ou coller `BUYER_SECRET`, `FACILITATOR_SECRET`, ni le contenu de `.env`.
- Ne pas pousser sur git sauf demande explicite.
- Testnet uniquement.
- Ne pas lancer un achat juste pour « tester » hors du scénario demandé : un run `agent` ou `purchase` = vrai paiement Testnet.
- Si les services tournent déjà, réutilise-les ; ne pas en démarrer des doublons sur les mêmes ports.

## Prérequis à vérifier (rapide)

```powershell
node --version          # >= 24
ollama --version
ollama list             # qwen2.5 doit être présent ; sinon: ollama pull qwen2.5
Test-Path .env          # doit exister à la racine avec MERCHANT_ADDRESS et BUYER_SECRET
```

Si `.env` racine manque : `npm run setup:testnet` puis `npm run check:connections`.

## Étapes à exécuter dans l’ordre

### A — Connexions Testnet

Depuis la racine du dépôt :

```powershell
npm run check:connections
```

Attendu : buyer, merchant, facilitator `funded=true`.

### B — Facilitator (terminal / process dédié, laisser tourner)

```powershell
npm run dev:facilitator
```

Attendu : `Facilitator: http://127.0.0.1:4022`.

### C — API facture isolée avec panne (autre process, laisser tourner)

Suivre le pattern de `docs/QUICKSTART.md` :

```powershell
$taskRepo = (Get-Location).Path
npm run build:recovery
New-Item -ItemType Directory -Force .local/packages | Out-Null
npm pack ./packages/recovery --pack-destination .local/packages --json

$consumerB = Join-Path $env:TEMP ('chaospay-agent-demo-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $consumerB | Out-Null
Get-ChildItem -LiteralPath (Join-Path $taskRepo 'examples/invoice-check-api') -File |
  Copy-Item -Destination $consumerB
New-Item -ItemType Directory -Path (Join-Path $consumerB 'vendor') | Out-Null
Copy-Item -LiteralPath (Join-Path $taskRepo '.local/packages/chaospay-recovery-0.1.0.tgz') -Destination (Join-Path $consumerB 'vendor')
Set-Location $consumerB
npm install --ignore-scripts --no-audit --no-fund
Get-Content -LiteralPath (Join-Path $taskRepo '.env') |
  Where-Object { $_ -match '^(MERCHANT_ADDRESS|FACILITATOR_URL|PAYMENT_AMOUNT_ATOMIC|TOKEN_CONTRACT)=' } |
  Set-Content -LiteralPath .env.public -Encoding ascii
Add-Content -LiteralPath .env.public -Value 'CHAOSPAY_ENABLE_FAULTS=1'
node --env-file=.env.public server.mjs
```

Attendu : `Invoice check API: http://127.0.0.1:3004`.

Vérifier :

```powershell
Invoke-RestMethod http://127.0.0.1:3004/paid/health
Invoke-RestMethod http://127.0.0.1:4022/health
```

### D — Client agent

```powershell
Set-Location $taskRepo\examples\agent-invoice-demo
npm ci
npm test
```

Configurer `.env` **sans afficher les secrets** : copier `MERCHANT_ADDRESS` et `BUYER_SECRET` depuis le `.env` racine, plus :

```
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5
```

(`.env.example` est le modèle.)

Journal vierge pour un run propre :

```powershell
Remove-Item -Recurse -Force .local -ErrorAction SilentlyContinue
```

### E — Lancer la démo agent (scénario vidéo)

```powershell
$id = 'demo-video-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
Write-Host "PURCHASE_ID=$id"
npm start -- agent $id invoice.json drop
Write-Host "EXIT=$LASTEXITCODE"
```

## Résultats à montrer explicitement dans ta réponse finale

Affiche clairement (sans secrets) :

1. `PURCHASE_ID`
2. Les événements `tool` / `result` / `message` du terminal
3. Statut final : doit être `COMPLETED` (exit 0)
4. Résultat métier : `computedTotalMinor=2900`, `declaredTotalMinor=3000`, `totalsMatch=false`
5. `txHash` unique + lien : `https://stellar.expert/explorer/testnet/tx/<txHash>`
6. Preuve qu’il y a eu `PENDING`/`INTERRUPTED` puis `recover_purchase` → `COMPLETED` / `RECOVERED`
7. Phrase de démo utilisable en vidéo :  
   « Le paiement a réussi ; Lumaid a permis de récupérer le résultat après la perte de réponse. »

## Plan B si Ollama échoue / trop lent

Ne pas abandonner la démo Lumaid. Sur un **nouveau** id et journal vierge :

```powershell
Remove-Item -Recurse -Force .local -ErrorAction SilentlyContinue
$id = 'demo-manual-' + (Get-Date -Format 'HHmmss')
npm start -- purchase $id invoice.json drop   # attendu EXIT=2, PENDING
npm start -- recover $id                      # attendu EXIT=0, COMPLETED
```

Montre les mêmes preuves (écart 100 + un `txHash`).

## Interprétation des codes

| Exit | Statut | Signification |
| --- | --- | --- |
| 0 | COMPLETED | Succès démo |
| 2 | PENDING | Panne / attendre reprise (normal après `drop`) |
| 1 | BLOCKED / autre | Échec ; diagnostiquer sans exposer les secrets |

## Ce qu’il ne faut pas dire

- Pas « réparation de la blockchain », pas « remboursement », pas « paiement de la facture ».
- Les tests unitaires simulés ≠ paiements réels ; cette campagne Testnet est l’exécution réelle.

## Livrable

Réponds en français, concis, avec les preuves listées ci-dessus et le lien stellar.expert. Indique si tu as utilisé le mode `agent` (Ollama) ou le plan B (`purchase`/`recover`).

---

Guides liés : `examples/agent-invoice-demo/README.md`, `docs/QUICKSTART.md`, `docs/README_AGENT_DEMO.md`.
