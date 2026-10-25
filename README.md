# Lumaid — HackMeridian

What happens to a purchase when payment is confirmed but the HTTP response disappears?

Lumaid is a local failure-and-recovery lab for paid applications on Stellar. The x402 engine, runner and dashboard are integrated. A shared recovery kit powers two APIs: CSV conversion and JSON receipt generation. Reports compare evidence before and after recovery, as well as naive and durable modes.

## Getting started

Choose your operating system and follow its setup instructions. You will need Git and Node.js 24 to clone the project and prepare the Stellar Testnet demo.

### Windows

Open PowerShell and install Git and Node.js 24 with Windows Package Manager (`winget`):

```powershell
winget install --id Git.Git --exact
winget install --id OpenJS.NodeJS.LTS --exact
```

Close and reopen PowerShell, then clone and set up Lumaid:

```powershell
git clone https://github.com/nielslecodeur/Lumaid.git
cd Lumaid
npm ci
npm run setup:testnet
npm run check:connections
npm run dev:dashboard
```

### Linux

Install Git with your distribution's package manager if needed. In Bash, install Node Version Manager (`nvm`):

```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

Open a new terminal, install Node.js 24, then clone and set up Lumaid:

```sh
nvm install 24
nvm use 24
git clone https://github.com/nielslecodeur/Lumaid.git
cd Lumaid
npm ci
npm run setup:testnet
npm run check:connections
npm run dev:dashboard
```

### macOS

Install Git with Apple's Command Line Tools or Homebrew if needed. In Terminal, install Node Version Manager (`nvm`):

```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

Quit and reopen Terminal, install Node.js 24, then clone and set up Lumaid:

```sh
nvm install 24
nvm use 24
git clone https://github.com/nielslecodeur/Lumaid.git
cd Lumaid
npm ci
npm run setup:testnet
npm run check:connections
npm run dev:dashboard
```

Open http://127.0.0.1:3002. Choose CSV or JSON receipts, select TESTNET and a scenario; the runner manages its servers.

To run the CLI client on its own, stop the dashboard, then run `npm run dev:facilitator` in one terminal and `npm run dev:merchant` in a second.

In a third terminal:

```sh
npm run smoke:payment -- first-purchase durable none
```

No AI API key or financial-service provider account is required. Three dedicated accounts are funded for free on Testnet. The payment is 0.01 test XLM and has no real-world value. Keys and logs stay in `.env` and `.local/`, which are excluded from Git.

## Failure and recovery

```sh
npm run smoke:payment -- demo-outage durable drop
npm run smoke:payment -- demo-outage durable none
```

The first call is intentionally interrupted. The second reuses the original authorization and recovers the result without making a second payment.

## Verification

```sh
npm run typecheck
npm test
```

After stopping any manually started servers:

```sh
npm run verify:dashboard
# The legacy CSV CLI campaign is also available:
npm run verify:engine
```

The campaign runs real Testnet scenarios for dropped responses, restarts, concurrency and the naive counterexample. Redacted reports are written to `evidence/public/`. Transaction hashes and transfer events allow independent verification beyond the merchant's response.

## Documentation

- [Integrate the package into an existing API](docs/INTEGRATION_A.md)
- [Recovery kit and two-API campaign](docs/RECOVERY_KIT.md)
- [Setup guide and launch path A](docs/SETUP_A.md)
- [Runner and dashboard API B](docs/ENGINE_API.md)
- [Project scope and limitations](docs/PROJECT.md)
- [Work split between two AI agents](docs/WORK_SPLIT.md)
- [Versions and dependencies](docs/versions.md)
- [Contributing](CONTRIBUTING.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## Limitations

The local fixture includes two deterministic services (CSV and JSON receipts), one Testnet asset and explicit failure hooks. A timeout remains UNKNOWN until the network provides evidence. The tests are not a security audit or a universal guarantee of exactly-once payments.

Naive mode deliberately creates a new authorization on retry; it does not demonstrate a Stellar replay vulnerability. This lab must not handle real money or be exposed to the internet. Known dependency limitations are documented in [docs/versions.md](docs/versions.md).

## License

The license for the team's own code has not yet been chosen. Third-party components retain their respective licenses and notices.
