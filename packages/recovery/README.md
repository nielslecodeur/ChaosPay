# @chaospay/recovery

Experimental local Stellar Testnet kit, Node 24+. Distributed as a local tarball for integration tests; not published to npm. Project license remains undecided (UNLICENSED/private).

Exports:
- @chaospay/recovery: RecoveryKit, Store and errors.
- @chaospay/recovery/stellar-http: createPaidRouter and createPaidService.
- @chaospay/recovery/evidence: digest and evidence types.

createPaidRouter mounts payment routes inside an existing Express API without replacing its routes. Set basePath to its actual mount path. Keep its SQLite journal across restarts, validate input before payment, and provide a deterministic JSON-serializable producer. A crash can cause the producer to run again before the result is saved; external side effects require their own idempotency.

The adapter requires a local ChaosPay facilitator with its durable receipt endpoint. It supports native XLM on Stellar Testnet only. A missing receipt or transaction observation is not proof of nonpayment. Unknown submissions are not automatically resubmitted.

Environment: MERCHANT_ADDRESS (public), optional TOKEN_CONTRACT and PAYMENT_AMOUNT_ATOMIC, FACILITATOR_URL. The merchant does not need buyer or facilitator secret keys. Configure the separate facilitator and test client using the repository setup guide.

Fault hooks are disabled unless enableFaults is explicitly true. Demo wrappers enable them to run the laboratory. Do not deploy these hooks or demo services publicly.

The package includes compiled recovery, evidence and observer modules so consumers need no relative imports into the repository. Full integration instructions: docs/INTEGRATION_A.md in the source repository.
