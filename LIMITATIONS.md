# Limitations

Policy version 2026-09-24. A verdict is only as good as the dated record behind it; where the record cannot decide, THEN answers INSUFFICIENT.

## No price prediction

VALID says the cohort Nansen recognized on the claim date supported the claim. It does not say the claim was a good trade, then or now. The corpus's seven-day forward return is an evaluation measure and never feeds a verdict.

## Point-in-time endpoints are in beta

The as-of side depends on Nansen's historical endpoints, most of which are beta. Every response is checked against a schema. An unrecognized shape is recorded as schema drift and treated as unavailable, so a changed endpoint produces INSUFFICIENT, never a guessed verdict.

## Restatements

Nansen recomputes historical results when asked and may restate them after late data, pricing fixes, or corrections to label history. A receipt keeps what was read when it was stamped. `then restamp` creates a new receipt beside the original with a drift report, which also says whether the method changed in between. The original never changes.

## Coverage

| Chain | Buy and sell claims | Holdings claims | Trade preparation |
|---|---|---|---|
| Ethereum | yes | yes | no |
| Base | yes | yes | yes |
| Solana | yes | yes | yes |
| BNB Chain | yes | yes | no |
| Monad | no | yes | no |
| Robinhood Chain | no | yes | no |
| Arbitrum | no | no | no |

Perp positioning claims have no dated surface and are always INSUFFICIENT. Point-in-time coverage for every holder segment starts on 11 Mar 2025; earlier dates can return no snapshot.

## Settlement

The current UTC day has no settled snapshot and cannot be stamped. The previous day can be stamped but is marked recent: Nansen may revise it for about two days after the close. THEN never substitutes a neighboring day.

## Row caps and time limits

Each source reads at most three pages of 1,000 rows, and a stamp stops after 45 seconds. A capped source is partial and counts as UNKNOWN; a source that did not answer counts as unavailable. Very active tokens can therefore return INSUFFICIENT.

## Credits

Stamping spends Nansen credits: 3 for a holdings claim and 7 for a buy or sell claim in the first corpus run, plus 5 for the historical lookup behind a possible CONTAMINATED verdict. The hosted app limits stamps per visitor per hour and pauses stamping when its credits run low; stored receipts, verification, and the Challenge keep working. The corpus's held-out run is waiting on credits.

## Redistribution

Nansen restricts republishing Smart Money data, including outputs that could rebuild its wallet classifications. Public receipts, pages, share cards, and MCP answers carry support states, rules, timestamps, and hashes only: no wallet addresses, no wallet counts, no Smart Money dollar amounts. That detail stays in private evidence bundles. Wallet-level views stay off unless Nansen approves them in writing (`THEN_PUBLIC_MEMBERSHIP_DETAIL`).

## Label sets

The default set is the Smart Trader family and Smart HL Perps Trader. Fund wallets left the cohort on 9 Sep 2026: THEN never sends Fund to current-label endpoints and includes it on the as-of side only for earlier dates, recording that it did.

## The corpus is small

Forty claims were frozen; thirteen have been stamped, all under the first method. Nothing on the evidence page is a rate of contamination in the wild, and none is claimed until the held-out run is measured.

## Trading

Only a verified VALID receipt can prepare a buy, on Solana or Base, for 5 to 1,000 USDC. Paper mode is the default. In live mode Nansen returns an unsigned transaction for your own wallet; THEN never holds a key, signs, or broadcasts, and never calls Nansen's execute endpoint.
