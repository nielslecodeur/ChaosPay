# Agent facture x402 + Lumaid

Client indépendant du dashboard, avec journal SQLite et deux outils pilotables par Ollama : achat de la vérification arithmétique et reprise du même achat.

## Statut réel

- Achat, reprise, journal durable et boucle Ollama `/api/chat` avec tool calling implémentés.
- Tests déterministes avec réseau et modèle simulés : perte de réponse, redémarrage, journal marchand absent, intégrité, concurrence et garde-fous des outils.
- Ce nouveau client n'a pas encore de campagne Testnet archivée ni d'essai réel Ollama validé. Ne pas présenter les tests simulés comme des paiements réels.
- Le modèle et le réseau ne réparent pas un journal perdu. Une reprise sans journal marchand est bloquée.

## Préparer les services

Suivre [le guide du kit serveur](../../docs/QUICKSTART.md) pour construire l'archive et installer `examples/invoice-check-api` dans un dossier indépendant. Démarrer le facilitator local et cette API sur `http://127.0.0.1:3004`.

Pour la panne de démonstration, démarrer l'API facture avec `CHAOSPAY_ENABLE_FAULTS=1` dans son environnement. Le modèle ne contrôle pas ce réglage. Le point `drop` coupe la réponse après règlement et stockage du résultat.

## Installer Ollama

Ollama doit tourner en local (Windows : [ollama.com/download](https://ollama.com/download)). Puis télécharger un modèle compatible tool calling :

```powershell
ollama pull qwen2.5
ollama list
```

Vérifier l'API : `http://127.0.0.1:11434`. Autres modèles possibles : `llama3.1`, `mistral-nemo`.

## Installer le client

Copier ce dossier dans un dossier séparé en excluant `.env`, `.local` et `node_modules`, puis ouvrir un terminal dans ce dossier :

```powershell
npm ci
npm test
Copy-Item .env.example .env
```

Cette première version développeur nécessite Node.js 24+. Le futur lanceur agent sans installation manuelle de Node reste à réaliser ; les lanceurs actuels du dépôt ouvrent le laboratoire.

Configurer localement `.env` :

- `MERCHANT_ADDRESS` : adresse publique de l'API facture, identique à sa configuration.
- `BUYER_SECRET` : clé du compte acheteur Testnet, nécessaire pour le premier achat seulement.
- `OLLAMA_HOST` : URL locale Ollama (défaut `http://127.0.0.1:11434`). Aucune clé API requise.
- `OLLAMA_MODEL` : nom du modèle Ollama compatible tool calling (ex. `qwen2.5`).

Le client fixe le réseau à Testnet, l'actif à XLM natif, la destination à l'adresse configurée, l'API au loopback et le plafond à 100000 unités atomiques (0,01 XLM Testnet). Le journal autorise **un achat distinct maximum** pour cette démo. Les refus/interruptions de préparation consomment aussi cette réservation : c'est un choix conservateur.

## Tester sans modèle

```powershell
npm start -- purchase demo-001 invoice.json drop
npm start -- recover demo-001
```

La première commande attend une interruption et retourne normalement le code 2 (`PENDING`). La seconde récupère le résultat, l'enregistre avant ACK et vérifie le rapport. Réutiliser exactement le même identifiant. La reprise n'a pas besoin de `BUYER_SECRET`.

## Lancer l'agent Ollama

Pour faire poursuivre l'achat précédent à l'agent :

```powershell
npm start -- agent demo-001 invoice.json drop
```

Pour filmer une panne fraîche, utiliser un **dossier client vierge** avec son propre journal et un identifiant jamais utilisé côté serveur, au lieu d'effacer un journal d'achat existant. Le mode `agent` peut créer un achat : le lancer constitue l'action explicite de démarrer la démo payante Testnet. Les appels Ollama restent locaux et gratuits.

Le terminal affiche les événements `tool`, `result` et `message`. Le statut final déterministe fait foi, pas une affirmation libre du modèle. La facture fictive est transmise à Ollama ; les clés de paiement et autorisations restent locales. La boucle est bornée à six tours et six appels d'outils.

Résultat métier attendu pour `invoice.json` : total calculé 2900, déclaré 3000, écart 100 unités mineures. Aucune devise n'est déduite. Le service ne paie pas la facture.

## Interpréter les sorties

| Statut | Signification |
| --- | --- |
| COMPLETED | Résultat vérifié et sauvegardé, ACK reçu, rapport cohérent avec le règlement attendu |
| PENDING | Preuves ou réponse encore indisponibles ; reprendre le même achat |
| BLOCKED | Intervention nécessaire, aucune nouvelle autorisation automatique |
| NOT_EXECUTED | Le modèle n'a exécuté aucun outil ; aucun succès démontré |

Conserver `.local/agent.sqlite` et ses fichiers WAL : ils contiennent la requête et l'autorisation originales. Une réservation interrompue avant sauvegarde de l'autorisation reste bloquée. La perte de journal marchand, même avant un premier envoi effectif, bloque la reprise par prudence.

## Suite à valider

1. Exécuter et archiver un achat Testnet réel avec panne puis reprise depuis ce client.
2. Exécuter la boucle avec Ollama et vérifier le comportement du modèle choisi.
3. Ajouter interface vidéo, lanceur dédié et export de preuves expurgées.
4. Compléter les cas RPC indisponible, erreurs de disque, crash aux frontières et fixtures d'intégration réelles.

Contrat Ollama utilisé : [tool calling](https://docs.ollama.com/capabilities/tool-calling). Plan complet : [README_AGENT_DEMO.md](../../docs/README_AGENT_DEMO.md).
