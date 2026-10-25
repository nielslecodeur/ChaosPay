# Lumaid — HackMeridian

[GitHub](https://github.com/nielslecodeur/Lumaid) · [Install on Windows, macOS or Linux](INSTALL.md)

What happens to a purchase when payment is confirmed but the HTTP response disappears?

Lumaid is a local failure-and-recovery lab for paid applications on Stellar. The x402 engine, runner and dashboard are integrated. A shared recovery kit powers two APIs: CSV conversion and JSON receipt generation. Reports compare evidence before and after recovery, as well as naive and durable modes.

## Quick start

Requirements: Node.js 24 and npm.

```sh
npm ci
npm run setup:testnet
npm run check:connections
```

To use the dashboard, run `npm run dev:dashboard` and open http://127.0.0.1:3002. Choose CSV or JSON receipts, select TESTNET and a scenario; the runner manages its servers.

To run the CLI client on its own, stop the dashboard, then run `npm run dev:facilitator` in one terminal and `npm run dev:merchant` in a second.

In a third terminal:

```sh
npm run smoke:payment -- first-purchase durable none
```

No AI API key or financial-service provider account is required. Three dedicated accounts are funded for free on Testnet. The payment is 0.01 test XLM and has no real-world value. Keys and logs stay in `.env` and `.local/`, which are excluded from Git.

## How Lumaid differs

Existing tools such as Wasit, SELO and official end-to-end suites validate protocol conformance. Lumaid complements them: it injects a deterministic failure after settlement and before HTTP delivery, then compares the intended purchase, observed transfers and recovered response. Its verdict is economic and application-level, not a protocol-conformance verdict.

The comparison is explicit: the durable and naive cards are separate demonstration purchases. In the local naive fixture, a new payment authorization is deliberately created after the interruption; the two observed transfers are not evidence of a Stellar replay vulnerability.

### What we do not claim

- Lumaid is not a security audit.
- Lumaid is not a replacement for Wasit, SELO or official conformance suites.
- Lumaid does not guarantee exactly-once payments.
- Fault injection is explicit in our local fixture; we do not inject faults into third-party services.
- The two demo APIs are team-built examples; we do not claim an external customer pilot.

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

To verify the campaign hashes and read about the three documented scenarios, see [Public Testnet evidence](evidence/public/README.md). The 90-second demo video script is in [docs/demo-video-90s.md](docs/demo-video-90s.md).

## Documentation

- [Quick start from a clean directory](docs/QUICKSTART.md)
- [Quick start review notes](docs/QUICKSTART_REVIEW.md)
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
