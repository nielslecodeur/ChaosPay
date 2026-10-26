# Lumaid

Recover an interrupted Stellar payment without blindly paying twice.

Lumaid is a local failure-and-recovery lab for paid applications on Stellar. It demonstrates what happens when payment succeeds but the response is lost, and compares payment evidence before and after recovery.

**Browser demo URL after GitHub Pages is enabled:** <https://nielslecodeur.github.io/Lumaid/> — no installation, account, or payment required.

## Try it locally — no Testnet setup

You only need **Git** and **Node.js 24 or newer**. No AI API key, financial-service account, or `.env` file is needed to try the simulation.

```sh
git clone https://github.com/nielslecodeur/Lumaid.git
cd Lumaid
npm run quickstart
```

Open <http://127.0.0.1:3002>, choose **Demo**, and run a scenario in **Simulation** mode. The simulation uses fictional data, makes no payment, and sends no request to a payment network.

The first run installs the exact dependencies from the lockfile, then starts the dashboard. Stop it at any time with **Ctrl+C**. To start it again after dependencies are installed, run `npm run dev:dashboard`.

### Install Git and Node.js

- **Windows:** install Git and Node.js with `winget install --id Git.Git --exact` and `winget install --id OpenJS.NodeJS.LTS --exact`, then reopen PowerShell.
- **macOS/Linux:** install Git with your system package manager and Node.js 24+ using [Node.js](https://nodejs.org/) or [nvm](https://github.com/nvm-sh/nvm).

Check that Node.js is version 24 or newer:

```sh
node --version
npm --version
```

## Run a real Stellar Testnet experiment

The dashboard's Testnet mode makes real **test-network** transactions; these funds have no real-world value, but a confirmed transaction cannot be cancelled. Start with the simulation above. When ready, stop the dashboard and configure the local test accounts:

```sh
npm run setup:testnet
npm run check:connections
npm run dev:dashboard
```

Open <http://127.0.0.1:3002>, select an available Testnet application and scenario, then confirm the Testnet run in the dashboard. The setup creates three dedicated Stellar Testnet accounts and requests free test XLM from Friendbot. It writes credentials to `.env` and `.local/`; both are excluded from Git. **Do not share or commit them.**

The fixture currently supports two Testnet services: JSON-to-CSV conversion and JSON invoice-receipt generation. The market-quote, parcel-tracking, research, and weather examples are fictional browser simulations, not live integrations. The payment buys the demo service result; it does not pay an invoice represented in that result.

If setup stops after creating `.env`, keep that file and follow the message printed by the setup command. It preserves existing credentials rather than replacing them.

## Run the standalone payment client

This optional path runs the merchant and facilitator separately. First complete the Testnet setup above, then use three terminals from the project directory:

**Terminal 1 — facilitator**

```sh
npm run dev:facilitator
```

**Terminal 2 — merchant**

```sh
npm run dev:merchant
```

**Terminal 3 — make a small Testnet payment**

```sh
npm run smoke:payment -- first-purchase durable none
```

The demo payment is **0.01 test XLM**. It has no real-world value. Do not use real funds or real payment credentials with this lab.

### Reproduce a lost response and recover

Run both commands with the same purchase ID:

```sh
npm run smoke:payment -- demo-outage durable drop
npm run smoke:payment -- demo-outage durable none
```

The first run intentionally drops the response. The second recovers the original result using the saved authorization; it does not create a replacement authorization or a second payment.

If the client or runner stops before recovery completes, list and resume a saved purchase:

```sh
npm run recover -- --list
npm run recover -- demo-outage
```

Keep the merchant and facilitator running during recovery. If payment status is uncertain, Lumaid preserves the `UNKNOWN` result instead of blindly authorizing another payment. See the [recovery guide](docs/RECOVER.md) for options, diagnostics, and limitations.

## Verify the project

These commands run local checks and do not submit Testnet payments:

```sh
npm run typecheck
npm test
```

The following campaigns do submit real test-network transactions. Run them only after Testnet setup, and stop manually started services first:

```sh
npm run verify:dashboard
# Legacy CSV-only campaign:
npm run verify:engine
```

Redacted campaign reports are written to `evidence/public/`. Transaction hashes and transfer events can be independently checked on Stellar Testnet.

## What is included

- A browser-only, fictional simulation for instant exploration.
- A local dashboard and runner with simulation, Testnet, and archived evidence modes.
- A Stellar Testnet x402 fixture for CSV conversion and JSON receipt generation.
- Recovery scenarios for dropped responses, process restarts, concurrency, delayed confirmation, and lost acknowledgments.
- A shared TypeScript recovery kit and APIs for integration experiments.

## Documentation

- [Integrate the package into an existing API](docs/INTEGRATION_A.md)
- [Recovery kit, scenarios, and campaign](docs/RECOVERY_KIT.md)
- [Recover an interrupted purchase](docs/RECOVER.md)
- [Setup details and architecture](docs/SETUP_A.md)
- [Runner and dashboard API](docs/ENGINE_API.md)
- [Recovery and reconciliation operations](docs/RECOVERY_OPERATIONS.md)
- [Project scope and limitations](docs/PROJECT.md)
- [Versions and dependencies](docs/versions.md)
- [Roadmap](docs/ROADMAP_TO_100.md)
- [Contributing](CONTRIBUTING.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## Important limitations

Lumaid is an experimental local lab, not a production payment service. It supports a small deterministic fixture, one Testnet asset (native XLM), and explicit failure hooks. A timeout or missing receipt is not proof that a payment failed. Stellar transactions that have been confirmed cannot be cancelled; refunds require a separate transaction.

The tests do not constitute a security audit or guarantee exactly-once payments in every system. Do not expose this lab to the internet, use real money, or put private keys in browser code. See [known dependency limitations](docs/versions.md).

## License

The license for the team's own code has not yet been chosen. Third-party components retain their respective licenses and notices.
