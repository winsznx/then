# THEN

**Was this Smart Money then?**

Posts like "Smart Money bought $WIF on June 12" get checked against a dashboard today, and the dashboard applies the Smart Money labels wallets carry *today* to trades from *then*. A wallet that earned the label in August shows up as a Smart Money buyer in June. The claim looks confirmed by wallets nobody could have followed on the day.

THEN rebuilds the claim twice, once with today's labels and once with the cohort Nansen recognized as Smart Money on that date, and stamps it:

- **VALID**: the cohort of the day supports the claim.
- **CONTAMINATED**: only today's labels support it, and wallets labeled after the date account for the difference.
- **INSUFFICIENT**: the dated record cannot decide, so THEN does not guess.

Every stamp writes a signed receipt that anyone can check, in the browser or offline.

Try it at https://then.timjosh507.workers.dev: replay the stored receipts, verify them in the browser, and play the Challenge. New stamps there pause while the demo's Nansen credits are low.

![A THEN receipt: today's labels support the claim, the cohort of the day supports it, verdict VALID](docs/images/receipt.png)

THEN does not predict price. VALID means the dated Smart Money cohort supports the claim, not that the trade is good.

## Run it in ten minutes

You need Node 24, pnpm 11, and a [Nansen API key](https://docs.nansen.ai) for new stamps. Stored receipts, verification, and the Challenge work without a key.

```bash
git clone https://github.com/winsznx/then && cd then
cp .env.example .env            # put your key in NANSEN_API_KEY
pnpm install
pnpm test                       # engine, receipts, verifier, parser, store, MCP

# Stamp one claim (about 7 Nansen credits for a buy claim, 3 for a holdings claim)
pnpm then stamp --chain solana --token EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm \
  --date 2026-06-12 --claim SM_BOUGHT --symbol WIF

# Recompute that verdict from the stored Nansen responses, with no network
pnpm then verify receipts/<receipt id>

# The web app on http://localhost:3000
pnpm dev
```

No key yet? Verify a committed synthetic receipt:

```bash
pnpm then verify $(node -p "require('./fixtures/receipts/index.json')[0].receipt_id") --root fixtures/receipts
```

[SETUP.md](SETUP.md) covers every command, configuration value, and the hosted setup.

## What a stamp compares

| | Today's labels | As of the claim date |
|---|---|---|
| Who counts as Smart Money | wallets labeled Smart Money now | wallets Nansen recognized on that date |
| Activity read | the claim's window | the same window |
| Source | current-label endpoints | point-in-time trades and daily holdings snapshots |

A side supports the claim when its Smart Money net flow (for buy and sell claims) or holdings (for hold claims) clears the threshold in the claimed direction. The verdict rule, the threshold per method version, and the evidence THEN asks for before it says CONTAMINATED are in [METHOD.md](METHOD.md).

## Verify a receipt

Each receipt has two layers. The **public receipt** carries the claim, both support states, the verdict, the rule parameters, timestamps, and hashes. The **private bundle** holds every raw Nansen response and never leaves the machine or the server that stamped it.

- In the browser: **Verify integrity** on any receipt page re-runs every public check against the deployment's published keys.
- Offline, public receipt only: `pnpm then verify-public rcpt_x.public.json --keys https://<deployment>/.well-known/then-receipt-keys`
- Offline, with the private bundle: `pnpm then verify <receipt>` recomputes the verdict from the stored responses. `pnpm then ablation <receipt>` removes the point-in-time data and shows the verdict fall to INSUFFICIENT.

## What the corpus shows so far

Forty public Smart Money claims were chosen and frozen on 24 Sep 2026, before THEN produced any verdict ([selection rules](eval/corpus/SELECTION.md)). Measured so far:

- The first run (S0) stamped 13 of the 40 under the first method. Both reconstructions were complete on 13 of 13 and differed by 25% or more on 10 of 13, but they disagreed on support on 0 of 13: under that threshold (2% of the window's DEX volume) no buy claim could reach support on either side.
- The support rule for buy and sell claims was then revised (method 2026-09-24.2), and a test on the other 27 claims was pre-registered before any of them was stamped.
- That held-out run: 24 of 27 stamped (3 name a chain Nansen does not cover), both reconstructions complete on 20. The two sides disagreed on support on 8 of 20, and every one changed the verdict: 4 CONTAMINATED, 4 VALID where today's labels say no. Against the full held-out set that is 8 of 27, above the 20% target set before the run.
- These are 27 public claims chosen by fixed rules, not a sample of all Smart Money posts, so this is not a contamination rate in the wild.

Every row and receipt is on the [evidence page](https://then.timjosh507.workers.dev/corpus).

## Limits

THEN cannot tell you whether a trade is good, cannot stamp the current UTC day, depends on Nansen's point-in-time endpoints (in beta), and keeps what Nansen returned at stamp time even if Nansen later restates history. Public output never includes wallet addresses, wallet counts, or Smart Money dollar amounts. The full list is in [LIMITATIONS.md](LIMITATIONS.md).

## More

- [ARCHITECTURE.md](ARCHITECTURE.md): packages, the one path from claim to receipt, Nansen endpoints and costs.
- [SECURITY.md](SECURITY.md): what is protected, how, and which test proves it.
- MCP: `pnpm then mcp` serves the `verdict_smart_money_claim` tool to agents over stdio; hosted deployments serve it at `/api/mcp` (https://then.timjosh507.workers.dev/api/mcp).

Point-in-time market intelligence powered by the [Nansen API](https://docs.nansen.ai).

## License

[MIT](LICENSE)
