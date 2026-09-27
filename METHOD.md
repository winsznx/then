# Method

Current method version: **2026-09-24.2**. Every receipt records the version it was stamped under and is always verified under that version.

## The question

A Smart Money claim names a token, a chain, a UTC day (or a window of up to seven days ending on it), and what Smart Money did: bought, sold, or held a material position. THEN asks whether the claim was true **on that date**, using the wallets Nansen recognized as Smart Money then, and compares that with the answer today's labels give.

## Two reconstructions

Both sides read the same window, the same Smart Money label set, and value amounts with the same reference price.

**Today's labels.** The dated activity read through the labels wallets carry now. For buy and sell claims: Nansen DEX trades in the window, filtered to wallets with a current Smart Money label. For holdings claims: Nansen's Smart Money holdings series for the token under current labels.

**As of the claim date.** For buy and sell claims: Nansen's historical DEX trades, which carry the label each wallet had when it traded. For holdings claims: Nansen's daily Smart Money holdings snapshots, each frozen at the end of its UTC day with that day's cohort.

Default label set: Smart Trader, 30D Smart Trader, 90D Smart Trader, 180D Smart Trader, Smart HL Perps Trader. Point-in-time requests also include the legacy names of those labels, so a renamed label cannot look like a new member. Fund wallets left the cohort on 9 Sep 2026; Fund is never sent to current-label endpoints and can be requested on the as-of side only for earlier dates.

## Support

A side's number:

- Buy and sell claims: Smart Money net token flow over the window (buys minus sells), valued at the window's volume-weighted average price.
- Holdings claims: Smart Money holdings of the token at the end of the claim date, valued at that day's close.

A side supports the claim when its number clears the threshold in the claimed direction (negative flow for sell claims). A side is UNKNOWN when its sources failed, were switched off, or hit the row cap. A partial source never decides.

| Method | Buy and sell claims | Holdings claims |
|---|---|---|
| 2026-09-24 | max(min_usd, 2% of window DEX volume) | max(min_usd, 2% of window DEX volume) |
| 2026-09-24.2 | min_usd | max(min_usd, 2% of window DEX volume) |

`min_usd` defaults to $1,000. If volume is unknown, the threshold falls back to `min_usd` and the receipt says so.

## The verdict rule

`decide` in `packages/core/src/decide.ts` is the only place a verdict is made. Checked in order; the first match decides.

| # | Condition | Verdict | Reason |
|---|---|---|---|
| 1 | Point-in-time data switched off | INSUFFICIENT | SPONSOR_HISTORICAL_DISABLED |
| 2 | Claim date not settled (the current UTC day) | INSUFFICIENT | DATE_NOT_SETTLED |
| 3 | No point-in-time surface for this chain and claim type | INSUFFICIENT | NO_ASOF_SURFACE |
| 4 | No usable point-in-time evidence | INSUFFICIENT | NO_HISTORICAL_SNAPSHOT |
| 5 | Point-in-time sources disagree in direction | INSUFFICIENT | ASOF_SOURCES_CONFLICT |
| 6 | As-of support is YES | **VALID** | ASOF_COHORT_SUPPORTS |
| 7 | As-of support is not NO | INSUFFICIENT | NO_HISTORICAL_SNAPSHOT |
| 8 | Today's-label side unavailable or UNKNOWN | INSUFFICIENT | LIVE_REPLAY_UNAVAILABLE |
| 9 | Today's labels support, difference attributed to label changes | **CONTAMINATED** | LABEL_DRIFT_ATTRIBUTED |
| 10 | Today's labels support, difference not attributed | INSUFFICIENT | DISAGREEMENT_NOT_LABEL_DRIVEN |
| 11 | Neither side supports | INSUFFICIENT | NEITHER_SUPPORTS |

VALID needs the cohort of the day; today's labels can never produce it. There is no fourth verdict.

## Attributing a difference to labels

CONTAMINATED is a comparison, so THEN asks for evidence that label changes caused it.

**Buy and sell claims.** The wallets counted only by today's labels must carry enough flow in the claimed direction to explain the gap to the threshold. Overlapping wallets are valued from the as-of data, so a difference between endpoints cannot pass as label drift. Then one historical lookup (5 credits) of the largest such wallet must show it traded inside the window under a label outside the Smart Money set. No lookup, no coverage, or a Smart Money label at trade time: INSUFFICIENT.

**Holdings claims.** On recent settled days the as-of cohort and today's cohort are nearly the same, so the two holdings series should agree. THEN requires them to agree within 2% on at least one recent settled day before it reads a difference on the claim date as label drift. If they never agree, the difference could come from how the two endpoints measure, and the stamp is INSUFFICIENT.

## Dates and look-ahead

- All dates are UTC days. A window ends on the claim date.
- The current day cannot be stamped. The previous day can, and is marked recent because Nansen may revise it for about two days.
- THEN never moves a claim to another day and never substitutes a neighboring snapshot.
- Point-in-time trade and flow requests end at the claim date. The verdict reads prices only inside the window.
- The price request also covers the seven days after the claim date. That part is used only for the corpus's forward return, which never feeds a verdict.
- Holdings snapshots after the date are read only for the calibration check above.

## Reasons

| Code | Meaning |
|---|---|
| ASOF_COHORT_SUPPORTS | The cohort Nansen recognized as Smart Money on the claim date supports the claim. |
| ASOF_COHORT_DOES_NOT_SUPPORT | The cohort recognized on the claim date does not support the claim. |
| LIVE_LABEL_SUPPORT | Applying today's Smart Money labels to the dated activity supports the claim. |
| LIVE_LABELS_DO_NOT_SUPPORT | Today's labels applied to the dated activity do not support the claim. |
| LABEL_DRIFT_ATTRIBUTED | The difference comes from wallets that carry the Smart Money label today but did not on the claim date. |
| NEITHER_SUPPORTS | Neither the cohort on the claim date nor today's labels support the claim at the threshold. |
| DISAGREEMENT_NOT_LABEL_DRIVEN | The two reconstructions differ, but not because of label changes. |
| ASOF_SOURCES_CONFLICT | Point-in-time sources disagree in direction above the threshold. |
| NO_ASOF_SURFACE | No point-in-time Smart Money surface covers this claim. |
| NO_HISTORICAL_SNAPSHOT | Nansen returned no settled historical snapshot for this date. |
| LIVE_REPLAY_UNAVAILABLE | Today's-label replay could not be built, so contamination cannot be tested. |
| DATE_NOT_SETTLED | The claim date has not settled. |
| SPONSOR_HISTORICAL_DISABLED | Point-in-time Nansen data is switched off, so THEN cannot stamp VALID or CONTAMINATED. |
| UNSUPPORTED_CHAIN, UNSUPPORTED_CLAIM_TYPE | No dated Nansen surface for this chain or claim type. |
| UPSTREAM_TIMEOUT, UPSTREAM_RATE_LIMIT, UPSTREAM_ERROR | Nansen did not answer, rate-limited, or failed for a required source. |
| SCHEMA_DRIFT | A beta endpoint returned a shape THEN does not recognize; that source was not used. |
| ASOF_WALLET_MEMBERSHIP_UNAVAILABLE | Wallet-level point-in-time membership was unavailable; the comparison is aggregate. |
| THRESHOLD_VOLUME_UNKNOWN | Volume was unavailable, so the minimum threshold was used. |
| RECENT_WINDOW | The claim date is recent; Nansen may still revise it. |
| FUND_INCLUDED | Fund wallets were included on the as-of side for a date before they left the cohort. |

Three codes stay in the private bundle only: ROW_CAP, PRICE_FALLBACK_ENDPOINT_USD, METHOD_UNCALIBRATED.

## Why method 2026-09-24.2

The first corpus run (13 claims, method 2026-09-24) found the two reconstructions recoverable on every claim and 25% or more apart on 10 of 13, yet no support disagreement: every buy claim sat below the threshold on both sides. The threshold compared one cohort's net flow with the token's gross DEX volume. Net Smart Money flow is usually a small fraction of a percent of volume, and public claims cite flows of exactly that size, so the rule could not confirm a true buy claim on any liquid token. It tested whether Smart Money was a large share of the market, which no claim asserts.

The revision judges buy and sell claims against the claim's own minimum and keeps the volume rule for holdings. It was made on that argument, not on re-scored results. The pre-registered held-out run then stamped 24 of the remaining 27 claims under method 2026-09-24.2: both reconstructions were complete on 20, and support disagreed on 8 of those 20. The other three claims name an unsupported chain. Receipts from the first run keep method 2026-09-24 and still verify under it. See the [published evidence](https://then.timjosh507.workers.dev/corpus) and [selection rules](eval/corpus/SELECTION.md).

## Reproducing a verdict

```bash
pnpm then verify <receipt>          # recompute from stored responses, no network
pnpm then ablation <receipt>        # same, with point-in-time data removed
pnpm then verify-public <file>      # public receipt only
```
