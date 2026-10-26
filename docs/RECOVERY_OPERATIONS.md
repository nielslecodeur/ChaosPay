# Recovery and reconciliation operations

## What the journal guarantees

The merchant persists a purchase intent and atomically claims `PREPARED` as
`SUBMITTING` before it calls the facilitator. SQLite serializes that claim
across connections. This prevents two merchant instances sharing the same
database from both starting settlement for the same durable purchase.

It does **not** make SQLite and Stellar one atomic transaction. A process can
stop after the claim but before the facilitator receives the request, while the
request is in flight, or after settlement before its transaction hash is saved.
On restart the journal may therefore show `SUBMITTING`, `UNKNOWN`, or an empty
hash even though the network outcome is not yet known. The kit deliberately
does not resubmit an already-claimed intent.

## Handling `UNKNOWN`

1. Keep the original purchase ID and exact payment authorization. Do not create
   a replacement authorization to make an uncertain attempt appear successful.
2. Check the facilitator receipt for the authorization digest and, if a hash is
   available, query the configured Stellar RPC for the transaction and its
   contract events.
3. Treat RPC `NOT_FOUND`, an empty receipt, a timeout, and an RPC error as
   inconclusive. They are not proof that settlement did not happen.
4. If evidence is still unavailable, keep the result `UNKNOWN` and escalate to
   an operator for reconciliation. Do not manually retry settlement merely
   because the merchant has no saved hash.
5. Only mark a payment as confirmed when the transaction's supported transfer
   event matches the expected token, payer, recipient, and amount. A reported
   success response by itself is not payment evidence.

This demo uses Stellar Testnet and one configured RPC. RPC history and
availability are not an unlimited archival guarantee; a production operator
would need a separately designed retention and reconciliation procedure.

## Business result generation

`produce(input, context)` is called after payment evidence is confirmed and
before the generated result is persisted. If an external side effect succeeds
but the process stops before the result is saved, recovery may call `produce`
again. SQLite cannot make an external email, shipment, or database write
atomic with the payment journal.

Keep `produce` pure and deterministic (as in the CSV and receipt examples), or
make every external effect idempotent using a stable key such as
`purchaseId` plus the effect type. Integrations with non-idempotent external
effects need an outbox or an equivalent durable coordination design; they must
not rely on this journal alone for exactly-once behavior.
