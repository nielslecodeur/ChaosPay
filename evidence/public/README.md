# Vérifier les preuves Testnet

Ces rapports proviennent de la campagne non simulée `recovery-campaign.json`, exécutée le 25 octobre 2026 sur Stellar Testnet. Les verdicts de scénario sont ceux du moteur d'observation de ChaosPay ; `npm run verify:evidence` ajoute une vérification indépendante en consultant le RPC public, puis en comparant l'état de la transaction, son ledger et l'événement de transfert aux champs du rapport.

```sh
npm run verify:evidence
```

La commande accepte aussi un ou plusieurs chemins de fichiers de campagne :

```sh
npm run verify:evidence -- evidence/public/recovery-campaign.json
```

Chaque hash ressort en `PASS`, `FAIL` ou `UNKNOWN`. `PASS` exige une transaction confirmée sur le Testnet, le ledger attendu et un événement de transfert correspondant exactement à l'actif, l'émetteur, le destinataire et le montant du rapport. Une transaction absente du RPC ou une erreur réseau reste `UNKNOWN` ; la commande termine alors avec un code différent de zéro. Les rapports `UNKNOWN` sans hash (par exemple avant soumission) ne sont pas présentés comme des transactions vérifiées.

## Scénarios documentés

Les montants sont en unités atomiques XLM : `100000` = `0,01 XLM`. Les liens ouvrent les transactions sur l'explorateur Testnet. Ils ne remplacent pas la vérification RPC ci-dessus.

### 1. Référence : un règlement et un résultat livré

Campagne `csv/baseline`, achat `runner-340ff8a7-9066-4cf0-8747-df719b92ad32` : un hash de transfert, `100000` unités atomiques, réponse récupérée et verdict du rapport `PASS`.

- Transaction : [`77afa8ff36dc0e21d57c2c45a0fab932dd2e86b383fec00195614b5b04c0543c`](https://stellar.expert/explorer/testnet/tx/77afa8ff36dc0e21d57c2c45a0fab932dd2e86b383fec00195614b5b04c0543c)
- Ledger : `5383004`

### 2. Fixture naïve : deux transferts pour un achat logique

Campagne `csv/comparison`, achat `runner-622cf627-dae6-4961-bb49-661fab608e0f` : la fixture crée volontairement une nouvelle autorisation après la coupure. Le rapport contient deux hashes, deux transferts de `100000` unités atomiques et le verdict `FAIL` pour surpaiement.

- Premier transfert, ledger `5383015` : [`3acb354cad7220fe27628e5cbbf4882c2c473d1ed8e5f40d81ba314863a15b06`](https://stellar.expert/explorer/testnet/tx/3acb354cad7220fe27628e5cbbf4882c2c473d1ed8e5f40d81ba314863a15b06)
- Second transfert, ledger `5383017` : [`d6dad47c0cee8b1fcd311a17ca1c2060515b65e8ca0cb346e0a03ccef375f52b`](https://stellar.expert/explorer/testnet/tx/d6dad47c0cee8b1fcd311a17ca1c2060515b65e8ca0cb346e0a03ccef375f52b)

Ce double transfert est observé dans la fixture ; ce n'est pas une faille de rejeu de Stellar. Le mode naïf crée un deuxième achat/une deuxième autorisation dans le scénario.

### 3. Mode durable : un transfert et le résultat récupéré

Campagne `csv/comparison`, achat distinct `runner-fe28b0a1-da23-4546-88f4-1cb76af4335d` : après la coupure contrôlée, le résultat est récupéré avec un seul transfert et le rapport donne `PASS`.

- Transaction : [`f399ac7dbedda64027f045ce0ee8f8155d9916ad5411071fad1ffe469a9ccbe8`](https://stellar.expert/explorer/testnet/tx/f399ac7dbedda64027f045ce0ee8f8155d9916ad5411071fad1ffe469a9ccbe8)
- Ledger : `5383013`

Les modes durable et naïf sont deux achats distincts de la même campagne `comparison`, et non un même identifiant de paiement rejoué dans les deux modes. Le hash seul ne prouve pas la livraison applicative : celle-ci est indiquée séparément par `responseRecovered` et le verdict du rapport.
