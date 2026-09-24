# Corpus selection rules

Frozen 2026-09-24, before THEN produced a verdict for any claim in this corpus. The git history of this file and of `claims.jsonl` is the record: the claims were committed before the first corpus run.

The corpus exists to test one thing. When a public post says Nansen Smart Money bought, sold, or held a token on a date, does the answer change if you use the Smart Money cohort Nansen recognized on that date instead of today's labels? The claims are chosen without knowing the answer.

## What counts as a claim

A public statement by someone other than THEN's authors that wallets Nansen classifies as Smart Money bought, accumulated, sold, distributed, or held a specific token over a specific day or short window, attributed to Nansen by text, screenshot, or citation.

Sources can be posts on X (including Nansen's own accounts), newsletters, research write-ups, or news articles.

## Inclusion

1. The token resolves to one contract on one chain.
2. The activity date D can be fixed with the date rule below.
3. D falls between 2025-03-11 and 2026-09-21 inclusive. The lower bound is the start of Nansen's point-in-time coverage for every holder segment. The upper bound leaves a settled day before the freeze.
4. The claim maps to one type: `SM_BOUGHT` (bought, accumulated, loading, inflows), `SM_SOLD` (sold, dumped, distributed, outflows), or `SM_HOLDS` (holds, top holding, holding a large position). Perp-only claims are recorded as `SM_PERP`.
5. The source was publicly reachable when captured.

## Exclusion

- NFT claims.
- Wallet identity claims with no token and date ("this wallet is Smart Money").
- Anything written by THEN's authors.
- Windows longer than 7 days.
- Duplicates: the same token, D, and type. The earliest source is kept.

## Date rule

- If the text names a day, D is that day in UTC.
- "Today" means D is the UTC publish date.
- "Last 24 hours" or "past day": D is the UTC date of (publish time minus 12 hours), the calendar day that overlaps the window most. If only the publish date is known, D is the publish date minus one day.
- Multi-day windows ("this week", "past 3 days"): D is the last full UTC day covered (the publish date minus one day unless the text names the end), and the window length is recorded in `window_hours`.

## Composition

- At least 30 claims if public sources allow; otherwise every qualifying claim found, with the shortfall stated here.
- A mix of chains, dates, memecoins and large caps, and buy, sell, and hold claims.
- At least 3 `control` claims: large, liquid tokens where the Smart Money activity was widely reported. The role is assigned from public reporting before any THEN run and never changed.
- At least 3 `later_drawdown` claims: tokens that public reporting shows fell sharply or collapsed after D. Also assigned before any run.
- Everything else is `general`.

## Search procedure

The queries below are run in order. Results are reviewed in the order returned. Every candidate that passes the rules is accepted until 40 claims are collected or the queries are exhausted. Candidates that fail a rule are logged in `rejected.jsonl` with the rule they failed.

1. `"Nansen" "smart money" bought`
2. `"Nansen" "smart money" accumulating`
3. `"Nansen" "smart money" sold`
4. `"according to Nansen" "smart money"`
5. `"Nansen data" "smart money" token`
6. `"smart money" "Nansen" inflows memecoin`
7. `"smart money" "Nansen" holdings`
8. `site:nansen.ai smart money`

## Record format

One JSON object per line in `claims.jsonl`:

| Field | Meaning |
|---|---|
| `claim_id` | `pub_001`, `pub_002`, … in acceptance order |
| `source_url` | Where the claim was published |
| `source_kind` | `x`, `news`, `newsletter`, or `research` |
| `source_author` | Account or publication |
| `source_published_at` | ISO timestamp, or date if the time is not shown |
| `source_captured_at` | Date the source was read for this corpus |
| `quote` | The claim sentence, verbatim |
| `claim_type` | `SM_BOUGHT`, `SM_SOLD`, `SM_HOLDS`, or `SM_PERP` |
| `chain` | Chain named or implied by the source |
| `token_symbol` | As written in the source |
| `token_address` | Contract address, empty if not resolvable from public sources |
| `token_address_source` | Where the address came from |
| `as_of_date` | D, from the date rule |
| `window_hours` | 24 unless the claim covers several days |
| `date_rule` | Which date rule produced D |
| `selection_role` | `general`, `control`, or `later_drawdown` |
| `notes` | Anything a reviewer needs to check the record |

## Not decided here

Verdicts, support states, and forward returns come from THEN runs and the forward-outcome protocol. They never change this file or `claims.jsonl`. Claims that THEN cannot reconstruct stay in the corpus and are reported as coverage failures.
