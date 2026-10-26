# Agent IA facture dans le laboratoire local

## Lancer une expérience

1. Démarrer Ollama avec un modèle installé. Par défaut le runner utilise `qwen2.5:latest`. Pour un autre modèle, définir `OLLAMA_MODEL` dans l'environnement du runner ou le `.env` racine.
2. Préparer les comptes Stellar Testnet via `Configurer-Testnet.cmd` si nécessaire. Garder le `.env` existant.
3. Démarrer `Lancer-Lumaid.cmd`, puis ouvrir http://127.0.0.1:3002/#local-lab.
4. Choisir **AI agent — verify an invoice (local Ollama)** dans les services.
5. Choisir **The response disappears** ou **Everything works**. Les autres pannes sont indisponibles pour cette première intégration.
6. Confirmer le lancement Testnet. Il peut créer un achat de 0,01 XLM Testnet maximum.

Le service facture vérifie l'arithmétique de la facture fictive du dépôt. Il ne règle pas cette facture. Le modèle choisit les outils ; le client contrôle le prix, conserve l'autorisation originale et vérifie le résultat.

## Ce que montre le laboratoire

La chronologie technique contient les appels `purchase_invoice_check` et `recover_purchase`, les états retournés et l'explication du modèle. Cette explication est distincte des preuves de paiement. Le rapport affiche le transfert observé, le résultat reconnu et le lien vers la transaction.

Les services de cette intégration sont démarrés et arrêtés par le runner sur les ports **3014** (API facture) et **4032** (facilitator). Ils ne remplacent pas les services manuels des ports 3004/4022. Ollama reste sur 11434. Le runner refuse un port déjà occupé.

Les journaux client restent dans `.local/agent-runs/<runId>.sqlite`, le journal marchand dans `.local/agent-invoice-merchant.sqlite`, et l'historique dans `.local/runner`. Ne pas supprimer ces données pour résoudre un blocage. Un nouvel essai du dashboard crée un nouvel achat : ce n'est pas une commande de reprise d'un run interrompu antérieur.

GitHub Pages peut montrer l'interface, mais ne peut pas lancer Ollama ni effectuer ces expériences Testnet. Utiliser le laboratoire local.

## Validation effectuée

Le 26 octobre 2026, une exécution réelle avec `qwen2.5:latest` a appelé l'achat, obtenu `PENDING: INTERRUPTED` après perte de réponse injectée, puis appelé la reprise et obtenu `COMPLETED: RECOVERED`.

- Verdict observé : `PASS`.
- Règlement observé : 100000 unités atomiques, soit 0,01 XLM Testnet.
- Nombre de transferts dans le rapport : 1.
- Résultat : total calculé 2900, total déclaré 3000, différence 100 unités mineures.
- Hash : `3e60216eea72f2a543e0bde94dd3ca6986436989a4ede80d1182a5794383ac79`.
- Rapport expurgé : [agent-invoice-lab.json](../evidence/public/agent-invoice-lab.json).

Cette exécution valide le scénario de réponse perdue avec ce modèle et cette configuration. Elle ne valide pas toutes les pannes possibles, ni un environnement de production. Le modèle a employé une formulation imprécise dans son résumé : le paiement était déjà confirmé, c'est le résultat qui a été récupéré. Les preuves et le statut déterministe font foi.
