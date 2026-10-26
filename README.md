<div align="center">

<img src="https://nielslecodeur.github.io/Lumaid/lumaid-mark.svg" alt="Lumaid" width="72">

# Lumaid

**Your payment never failed.**

Recover an interrupted Stellar payment without blindly paying twice.

[**Explore the demo**](https://nielslecodeur.github.io/Lumaid/#try) · [How it works](https://nielslecodeur.github.io/Lumaid/#docs) · [Installation](https://nielslecodeur.github.io/Lumaid/#install)

`Stellar Testnet` · `test funds only`

</div>

---

## What Lumaid does

Lumaid is a local failure-and-recovery lab for paid applications on Stellar. It reproduces what happens when a payment succeeds but the response is lost, and compares what the customer receives before and after recovery.

One intent, one verified payment, one result that gets through.

| Step | What happens | Status |
|---|---|---|
| 1. Request | The client asks for a service and signs a payment authorization | **Authorized** |
| 2. Network | The payment is confirmed on Stellar | **Settled** |
| 3. Recovery | A lost response is recovered from the saved purchase | **Result recovered** |
| 4. Receipt | The client acknowledges the delivery | **Receipt acknowledged** |

## Try the demo

**[nielslecodeur.github.io/Lumaid](https://nielslecodeur.github.io/Lumaid/#try)**: no installation, no account, no payment.

1. Pick an application.
2. Pick a failure (for example, payment confirmed but response lost).
3. Run the **Simulation** and see what the customer receives.

The simulations run in your browser with fictional amounts and results. No payment is sent and no real service is called.

## Local Testnet lab

The local lab makes real **Stellar Testnet** transactions with test funds. A confirmed transaction cannot be cancelled.

| Run mode | What it does |
|---|---|
| **Simulation** | Fictional data, no payment, no network request |
| **Testnet** | Real test payment (0.01 test XLM) on Stellar Testnet |

The Testnet lab runs two applications: **CSV conversion** and **JSON receipt generation**. The instant demo also shows fictional market-quote, research-brief, parcel-tracking and weather examples; these are not live integrations. The payment buys the demo service result; it does not pay an invoice represented in that result.

A third API, built by our team and installed from the package, has historical evidence. Integration by an external team has not yet been validated. An acknowledgment confirms receipt by the client software, not that a person has read it.

### Naive and durable

- **Durable** mode records a purchase before sending payment. After an interruption, it finds the same purchase and returns the saved result.
- **Naive** mode deliberately creates a new payment authorization on retry and pays a second time.

The naive mode is a counterexample from our demo merchant. It does not demonstrate a flaw in Stellar.

### Automatic retry, bots and agents

In the “Bug before settlement” Testnet scenario, the runner injects an error before calling the facilitator, then retries automatically with the same purchase ID, request body and signed authorization. The first attempt submits no transaction; the retry can create one real Testnet payment.

If a transaction may already have been submitted, its status can be uncertain. The kit checks the facilitator receipt and Stellar evidence, and does not blindly create a new authorization. A refund would be a separate transaction.

This approach can be integrated into a bot or agent that pays for APIs, but it is not automatic just by installing this demo. The bot or client must persist its purchase ID, exact request body and authorization, and retry with those same values after a lost response or HTTP 202. The dashboard runner implements that loop; a separate bot integration needs its own client logic and testing.

## Installation

### Windows: download, extract, launch

No separate Git, Node.js or npm installation is required. Windows 64-bit only.

1. [Download the project ZIP](https://github.com/nielslecodeur/Lumaid/archive/refs/heads/main.zip) and extract the entire folder.
2. Double-click **`Lancer-Lumaid.cmd`**. The first launch downloads a portable Node.js runtime, verifies its SHA256 and installs dependencies. Internet is required.
3. Your browser opens at <http://127.0.0.1:3002>. Keep the terminal open; `Ctrl+C` stops the server.

Open the dashboard and select **Simulation**: this path needs no Testnet setup and makes no payment.

For Testnet, stop the server, run **`Configurer-Testnet.cmd`**, then launch Lumaid again. Existing credentials are preserved. If port 3002 is occupied, close the previous server. See the [simple installation guide](docs/INSTALLATION_SIMPLE.md).

### Developer installation

You need **Git** and **Node.js 24 or newer**. No AI API key, financial-service account or `.env` file is needed for the simulation.

```bash
git clone https://github.com/nielslecodeur/Lumaid.git
cd Lumaid
npm run quickstart
```

Open <http://127.0.0.1:3002>, choose **Demo**, and run a scenario in **Simulation** mode. To start it again later, run `npm run dev:dashboard`.

For a real Testnet experiment, stop the dashboard, then:

```bash
npm run setup:testnet
npm run check:connections
npm run dev:dashboard
```

The setup creates three dedicated Stellar Testnet accounts and requests free test XLM from Friendbot. Credentials stay in `.env` and `.local/`, both excluded from Git. **Never share or commit them.**

## Command line

To run the client on its own, stop the dashboard, then start the facilitator and the merchant in two terminals:

```bash
npm run dev:facilitator
npm run dev:merchant
```

In a third terminal, the first call is deliberately interrupted; the second recovers the result without a second payment:

```bash
npm run smoke:payment -- demo-coupure durable drop
npm run smoke:payment -- demo-coupure durable none
```

If the client stops before recovery completes, list and resume a saved purchase:

```bash
npm run recover -- --list
npm run recover -- demo-coupure
```

If payment status is uncertain, Lumaid keeps the `UNKNOWN` result instead of authorizing another payment. See the [recovery guide](docs/RECOVER.md).

## Verify

```bash
npm run typecheck
npm test
npm run verify:dashboard
```

Stop any manually launched servers first. `verify:dashboard` runs interruption, restart, concurrency and the naive counterexample on Testnet, so it submits real test-network transactions. Redacted reports are written to [`evidence/public/`](evidence/public/), and transaction hashes can be checked independently on Stellar Testnet.

## Integrate an API

The recovery kit is the `@chaospay/recovery` package, delivered as a local archive. It is not published on npm and stays private until a license is chosen.

```bash
npm run build:recovery
npm pack ./packages/recovery --pack-destination .local/packages
npm install /path/to/chaospay-recovery-0.1.0.tgz express@5.3.0
```

```ts
import { createPaidRouter } from "@chaospay/recovery/stellar-http";

const paid = await createPaidRouter({
  serviceId: "my-service",
  port: 3004,
  basePath: "/paid",
  databasePath: "./.local/purchases.sqlite",
  validate: body => body.text,
  produce: text => ({ length: text.length }),
});
app.use("/paid", paid.router);
```

Added routes:

| Route | Purpose |
|---|---|
| `POST /paid/purchases/:id` | Challenge, then signed purchase |
| `POST /paid/purchases/:id/ack` | Acknowledgment |
| `GET /paid/reports/:id` | Evidence and verdict |
| `GET /paid/health` | Health check |

The adapter is limited to loopback HTTP. The server kit makes repeat requests recoverable; it does not retry a disconnected client’s request for it. A bot must securely persist the original purchase ID, request body and signed authorization, then retry with exactly those values. Do not create a new authorization while the prior submission may be unknown: a confirmed Stellar transaction cannot be cancelled, and a refund is a separate payment. Full guide: [`docs/INTEGRATION_A.md`](docs/INTEGRATION_A.md).

## Limitations

Lumaid is an experimental local lab, not a production payment service.

- Testnet fixture: two services (CSV conversion and JSON receipt generation), one Testnet asset (native XLM) and explicit failure points.
- The market-quote, research, parcel-tracking and weather examples use fictional data and do not call live services.
- A third service installed from the package has historical evidence; no external team has tried it yet.
- The lab listens only on `127.0.0.1`. Do not expose it to the internet, use real money, or put private keys in browser code.
- A timeout or missing receipt is not proof that a payment failed. Confirmed Stellar transactions cannot be cancelled; refunds require a separate transaction.
- The tests are not a security audit and do not guarantee universal single-payment behavior.
- A known dependency advisory (Zod) is documented in [`docs/versions.md`](docs/versions.md).

## Documentation

- [Simple installation guide](docs/INSTALLATION_SIMPLE.md)
- [Integrate the package into an existing API](docs/INTEGRATION_A.md)
- [Recovery kit, scenarios and campaign](docs/RECOVERY_KIT.md)
- [Recover an interrupted purchase](docs/RECOVER.md)
- [Setup details and architecture](docs/SETUP_A.md)
- [Runner and dashboard API](docs/ENGINE_API.md)
- [Recovery and reconciliation operations](docs/RECOVERY_OPERATIONS.md)
- [Project scope and limitations](docs/PROJECT.md)
- [Versions and dependencies](docs/versions.md)
- [Roadmap](docs/ROADMAP_TO_100.md)
- [Contributing](CONTRIBUTING.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## License

The license for the team’s own code has not yet been chosen. Third-party components retain their respective licenses and notices.