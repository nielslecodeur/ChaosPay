# ChaosPay: 90-second demo video

Record the dashboard and terminal locally, then add English captions matching the voice-over. Do not show `.env`, `.local/`, payment signatures, or private keys. Use the saved `csv/comparison` Testnet campaign in the dashboard if a fresh Testnet run would make the recording unreliable; label it as a recorded campaign, not a live run.

Before recording:

1. Start the dashboard with `npm run dev:dashboard` and open `http://127.0.0.1:3002`.
2. Select the saved Testnet comparison campaign and check that its reports and transaction links are visible.
3. Run `npm run verify:evidence`. Show the actual final summary. If the RPC is unavailable or reports `UNKNOWN`, do not replace it with a fabricated green result; retry later or show a clearly dated, previously verified run.
4. Close unrelated tabs and terminals; keep only the dashboard, one explorer transaction, and the verification terminal ready.

| Time | Shot | English voice-over / captions |
| --- | --- | --- |
| 0–8 s | Dashboard intro and one logical purchase | “A customer pays. The response disappears. Should the app charge again?” |
| 8–25 s | Open the saved `csv/comparison` campaign; show the naive card and its two transfer links | “In our local naive fixture, retrying creates a new payment authorization. Two transfers are observed for this logical purchase.” |
| 25–40 s | Expand technical evidence; open one Testnet explorer link; briefly show the interruption in the timeline | “The timeline shows the interruption. These are confirmed Testnet transfers—not a claim of a Stellar replay vulnerability.” |
| 40–60 s | Show the durable card and its one transfer; point out the recovered response | “The durable strategy recovers the existing purchase: one transfer, and the result is received.” |
| 60–80 s | Switch to terminal, run `npm run verify:evidence`, show its actual summary | “We independently re-check each transaction, ledger, asset, sender, recipient and amount against the Testnet RPC.” |
| 80–90 s | End card with the project name and comparison statement | “Wasit, SELO and official suites validate protocol conformance. ChaosPay complements them with deterministic failure injection and an economic, application-level verdict.” |

The naive and durable reports in the saved comparison are separate demonstration purchases. Keep that distinction visible or state it in the narration; do not imply the same transaction was replayed in both modes. For a live recording, re-run the verification close to publication and show the result honestly. Link this script and the repository's [public evidence guide](../evidence/public/README.md) in the video description.
