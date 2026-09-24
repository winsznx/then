# Search log

Queries run to build `claims.jsonl`, in order, with the number of results reviewed and claims accepted. Q1–Q8 are the frozen queries from `SELECTION.md`; V-queries are the variants described in its deviation log. No Nansen API or dashboard was used during collection.

| Query | Reviewed | Accepted |
|---|---:|---:|
| Q1 `"Nansen" "smart money" bought` | 9 | 0 |
| Q2 `"Nansen" "smart money" accumulating` | 9 | 0 |
| Q3 `"Nansen" "smart money" sold` | 9 | 0 |
| Q4 `"according to Nansen" "smart money"` | 9 | 0 |
| Q5 `"Nansen data" "smart money" token` | 9 | 0 |
| Q6 `"smart money" "Nansen" inflows memecoin` | 9 | 3 |
| Q7 `"smart money" "Nansen" holdings` | 10 | 0 |
| Q8 `site:nansen.ai smart money` | 9 | 0 |
| V1 `"according to Nansen" "smart money" bought past 24 hours` | 9 | 1 |
| V2 `"Nansen" "smart money" bought solana token 2025` | 9 | 0 |
| V3 `"Nansen" "smart money" bought September 2025` | 9 | 3 |
| V4–V7 `"Nansen" "smart money" bought` + March / April / May / June 2025 | 36 | 0 |
| V8 `"according to Nansen" "smart money" traders 2025` | 9 | 0 |
| V9a, V9, V10 `"according to Nansen" "smart money"` + Solana / Ethereum / Base | 27 | 0 |
| V11 `"Nansen data" "smart money" 2025 token inflows` | 9 | 0 |
| V12 `"Nansen data" "smart money" 2026` | 9 | 0 |
| V13 `"Nansen data" "smart money" Solana memecoin` | 9 | 4 |
| V14 `"Nansen data" "smart money" BNB Chain` | 10 | 0 |
| V15 `"according to Nansen" "smart money" ETH accumulated 2025` | 9 | 0 |
| V16 `"Nansen" "smart money" sold ETH 2025` | 9 | 0 |
| V17 `"according to Nansen" "smart money" PEPE` | 10 | 0 |
| V18 `"according to Nansen" "smart money" Chainlink LINK` | 9 | 2 |
| V19 `"Nansen" "smart money" bought PENGU` | 10 | 0 |
| V20 `"Nansen" "smart money" bought WLFI` | 9 | 0 |
| V21 `"Nansen" "smart money" bought HYPE Hyperliquid token` | 10 | 0 |
| V22 `"Nansen" "smart money" sold ENA Ethena` | 9 | 2 |
| V23 `"according to Nansen" "smart money" sold` | 9 | 0 |
| V24 `"Nansen" "smart money" sold past 24 hours 2025` | 9 | 0 |
| V25 `"Nansen" "smart money" sold memecoin solana` | 9 | 0 |
| V26 `"Nansen" "smart money" sold 2026` | 9 | 0 |
| V27 `"Nansen" "smart money traders" bought` | 9 | 0 |
| V28 `"Nansen" "smart money traders" sold` | 10 | 0 |
| V29 `"according to Nansen" "smart money traders"` | 9 | 0 |
| V30 `"Nansen" "smart money wallets" accumulating` | 9 | 0 |
| V31 Q1 restricted to cointelegraph, theblock, coindesk, decrypt, beincrypto, u.today, coinpedia, ambcrypto, crypto.news, coingape | 10 | 0 |
| V32 Q1 restricted to fxstreet, benzinga, bitcoinist, newsbtc, cryptoslate, thestreet, cryptobriefing, dailyhodl, coinmarketcap, coinlive.me | 10 | 0 |
| V33 `"according to Nansen" "smart money" 2025`, domains of V31 | 10 | 0 |
| V34 `"Nansen" "smart money" accumulating 2025`, domains of V31 | 10 | 0 |
| V35 Q1 on cointelegraph.com | 10 | 0 |
| V36 Q3 on cointelegraph.com | 10 | 0 |
| V37 `"smart money" "Nansen" inflows memecoin 2025`, domains of V31 | 10 | 1 |
| V38 `"Nansen data" "smart money" token past 24 hours`, domains of V31 | 10 | 0 |
| V39 Q1 on ambcrypto.com | 10 | 6 |
| V40 Q3 on ambcrypto.com | 10 | 1 |
| V41 Q2 on ambcrypto.com | 10 | 5 |
| V42 Q7 on ambcrypto.com | 10 | 0 |
| V43 `"smart money" "Nansen" rotating altcoins LINK ENA LDO` | 9 | 1 |
| V44 `"Nansen" "smart money" bought ETH past 24 hours`, news domains | 10 | 1 |
| V45 lookup of the Cointelegraph original of an unreachable copy | 1 | 0 |
| V46 Q1 on the-edge.xyz | 10 | 6 |
| V47 Q1 on crypto.news | 10 | 1 |
| V48 Q1 on coingape, u.today, coinpedia, cryptobriefing, kucoin, bitget | 10 | 1 |
| V49 Q3 on the same domains (stopped at the 40-claim cap) | 10 | 2 |

Rejections by rule (`rejected.jsonl`): date out of range 22, source unreachable 16, date not fixable 9, window longer than 7 days 7, not a Smart Money segment 6, no specific claim 5, NFT claim 4, no specific token 1, not attributed to Nansen 1.

Before freezing, three claims were checked against their live sources by a second reader (pub_001, pub_028, pub_031): quotes and publish times matched.
