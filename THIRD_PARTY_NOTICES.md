# Composants et références externes

- Stellar x402 examples : https://github.com/stellar/x402-stellar ; licence Apache-2.0. Commit étudié : 953caa5da960a7499b58a784359d23cfb3504a83. L'initialisation du facilitator, le signataire Ed25519 et le schéma de paiement s'appuient sur ses exemples. Licence conservée dans docs/licenses/stellar-x402-Apache-2.0.txt.
- @x402/core et @x402/stellar : bibliothèques de paiement installées via npm ; leurs licences et mentions restent dans leurs paquets.
- @stellar/stellar-sdk et Express : bibliothèques installées via npm ; leurs licences et mentions restent dans leurs paquets.

Wasit et SELO sont des références concurrentielles. Aucun code de ces projets n'a été copié dans cette implémentation.

Les scénarios et preuves générés ici ne doivent pas être présentés comme une faille découverte dans les bibliothèques officielles.
