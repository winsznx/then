/**
 * Response schemas for the Nansen endpoints THEN reads, taken from the published OpenAPI
 * (fetched 2026-09-24). Pure: no network. The projection parser and the offline verifier import
 * this module, never the HTTP client.
 *
 * Objects are loose so unexpected fields survive parsing and can be reported as schema drift.
 * Fields the OpenAPI marks optional or nullable accept null.
 */
import { z } from 'zod'

const num = z.number().nullable().optional()
const int = z.number().int().nullable().optional()
const str = z.string().nullable().optional()

export const PaginationSchema = z.looseObject({
  page: z.number().int(),
  per_page: z.number().int(),
  is_last_page: z.boolean(),
})

export const AccountSchema = z.looseObject({
  user_id: z.string(),
  plan: z.string(),
  credits_remaining: z.number(),
})
export type Account = z.infer<typeof AccountSchema>

export const SearchTokenSchema = z.looseObject({
  name: z.string(),
  symbol: z.string(),
  chain: z.string(),
  address: z.string(),
  price: num,
  volume_24h: num,
  market_cap: num,
  rank: int,
})
export const SearchGeneralSchema = z.looseObject({
  tokens: z.array(SearchTokenSchema).nullable().optional(),
  entities: z
    .array(z.looseObject({ name: z.string() }))
    .nullable()
    .optional(),
  total_results: z.number(),
})
export type SearchToken = z.infer<typeof SearchTokenSchema>
export type SearchGeneral = z.infer<typeof SearchGeneralSchema>

/** Live TGM who-bought-sold: labels are today's labels. */
export const WhoBoughtSoldRowSchema = z.looseObject({
  address: z.string(),
  address_label: str,
  bought_token_volume: num,
  sold_token_volume: num,
  token_trade_volume: num,
  bought_volume_usd: num,
  sold_volume_usd: num,
  trade_volume_usd: num,
})
export const WhoBoughtSoldSchema = z.looseObject({
  data: z.array(WhoBoughtSoldRowSchema),
  pagination: PaginationSchema,
})
export type WhoBoughtSoldRow = z.infer<typeof WhoBoughtSoldRowSchema>
export type WhoBoughtSold = z.infer<typeof WhoBoughtSoldSchema>

/** Historical who-bought-sold: labels resolved at `date_to`. */
export const HistWhoBoughtSoldRowSchema = z.looseObject({
  address: z.string(),
  address_label: str,
  is_smart_money: z.boolean(),
  bought_token_volume: num,
  sold_token_volume: num,
  gross_token_volume: num,
  bought_volume_usd: num,
  sold_volume_usd: num,
  gross_volume_usd: num,
})
export const HistWhoBoughtSoldSchema = z.looseObject({
  data: z.array(HistWhoBoughtSoldRowSchema),
  pagination: PaginationSchema,
})
export type HistWhoBoughtSoldRow = z.infer<typeof HistWhoBoughtSoldRowSchema>
export type HistWhoBoughtSold = z.infer<typeof HistWhoBoughtSoldSchema>

/** Live TGM flows: holdings of a holder category, with today's category membership. */
export const FlowsRowSchema = z.looseObject({
  date: z.string(),
  bucket_end: str,
  is_complete: z.boolean().nullable().optional(),
  price_usd: num,
  token_amount: num,
  value_usd: num,
  holders_count: int,
  total_inflows_count: num,
  total_outflows_count: num,
  /** Populated only for label=exchange; null otherwise. */
  total_inflows_dex: num,
  total_outflows_dex: num,
  total_inflows_cex: num,
  total_outflows_cex: num,
})
export const FlowsSchema = z.looseObject({
  data: z.array(FlowsRowSchema),
  pagination: PaginationSchema,
  warnings: z.array(z.string()).nullable().optional(),
})
export type FlowsRow = z.infer<typeof FlowsRowSchema>
export type Flows = z.infer<typeof FlowsSchema>

/** Smart Money historical holdings: frozen daily snapshots of the cohort of each day. */
export const SmHoldingRowSchema = z.looseObject({
  date: z.string(),
  chain: z.string(),
  token_address: z.string(),
  token_symbol: str,
  token_sectors: z.array(z.string()).nullable().optional(),
  smart_money_labels: z.array(z.string()).nullable().optional(),
  balance: num,
  value_usd: num,
  balance_24h_percent_change: num,
  holders_count: int,
  share_of_holdings_percent: num,
  token_age_days: num,
  market_cap_usd: num,
})
export const SmHoldingsSchema = z.looseObject({
  data: z.array(SmHoldingRowSchema),
  pagination: PaginationSchema,
})
export type SmHoldingRow = z.infer<typeof SmHoldingRowSchema>
export type SmHoldings = z.infer<typeof SmHoldingsSchema>

/** Historical flow summary: segment labels resolved at `date_to`. */
export const FlowSummaryRowSchema = z.looseObject({
  token_symbol: str,
  smart_trader_net_flow_usd: num,
  smart_trader_avg_flow_usd: num,
  smart_trader_wallet_count: int,
  whale_net_flow_usd: num,
  public_figure_net_flow_usd: num,
  top_pnl_net_flow_usd: num,
  exchange_net_flow_usd: num,
  fresh_wallets_net_flow_usd: num,
})
export const FlowSummarySchema = z.looseObject({
  data: z.array(FlowSummaryRowSchema),
  warnings: z.array(z.string()).nullable().optional(),
})
export type FlowSummaryRow = z.infer<typeof FlowSummaryRowSchema>
export type FlowSummary = z.infer<typeof FlowSummarySchema>

/** Live TGM DEX trades: `trader_address_label` and the Smart Money filter use today's labels. */
export const DexTradeRowSchema = z.looseObject({
  block_timestamp: z.string(),
  transaction_hash: z.string(),
  trader_address: z.string(),
  trader_address_label: str,
  action: z.enum(['BUY', 'SELL']),
  token_address: str,
  token_name: str,
  token_amount: num,
  traded_token_address: str,
  traded_token_name: str,
  traded_token_amount: num,
  estimated_swap_price_usd: num,
  estimated_value_usd: num,
})
export const DexTradesSchema = z.looseObject({
  data: z.array(DexTradeRowSchema),
  pagination: PaginationSchema,
})
export type DexTrade = z.infer<typeof DexTradeRowSchema>

/** Historical DEX trades: `trader_address_label` is resolved at each trade's date. */
export const HistDexTradeRowSchema = z.looseObject({
  block_timestamp: z.string(),
  transaction_hash: z.string(),
  trader_address: z.string(),
  trader_address_label: str,
  action: z.enum(['BUY', 'SELL']),
  token_name: str,
  token_amount: num,
  traded_token_name: str,
  traded_token_amount: num,
  estimated_swap_price_usd: num,
  estimated_value_usd: num,
})
export const HistDexTradesSchema = z.looseObject({
  data: z.array(HistDexTradeRowSchema),
  pagination: PaginationSchema,
})
export type HistDexTrade = z.infer<typeof HistDexTradeRowSchema>

export const HistTopHolderRowSchema = z.looseObject({
  token_symbol: str,
  address: str,
  address_label: str,
  token_amount: num,
  total_outflow: num,
  total_inflow: num,
  balance_change_24h: num,
  balance_change_7d: num,
  balance_change_30d: num,
  ownership_percentage: num,
  value_usd: num,
})
export const HistTopHoldersSchema = z.looseObject({
  data: z.array(HistTopHolderRowSchema),
  pagination: PaginationSchema,
})
export type HistTopHolder = z.infer<typeof HistTopHolderRowSchema>

export const SmTokenBalanceRowSchema = z.looseObject({
  chain: z.string(),
  token_address: z.string(),
  token_symbol: z.string(),
  token_sectors: z.array(z.string()).nullable().optional(),
  value_usd: num,
  balance_24h_percent_change: num,
  holders_count: int,
  share_of_holdings_percent: num,
  token_age_days: num,
  market_cap_usd: num,
})
export const SmTokenBalancesSchema = z.looseObject({
  data: z.array(SmTokenBalanceRowSchema),
  pagination: PaginationSchema,
})
export type SmTokenBalanceRow = z.infer<typeof SmTokenBalanceRowSchema>

export const OhlcvCandleSchema = z.looseObject({
  interval_start: z.string(),
  open: num,
  high: num,
  low: num,
  close: num,
  volume: num,
  volume_usd: num,
  market_cap: z.looseObject({ open: num, high: num, low: num, close: num }).nullable().optional(),
})
export const OhlcvSchema = z.looseObject({
  chain: z.string(),
  token_address: z.string(),
  timeframe: z.string(),
  data: z.array(OhlcvCandleSchema),
  truncated: z.boolean().nullable().optional(),
  truncation_note: str,
})
export type OhlcvCandle = z.infer<typeof OhlcvCandleSchema>
export type Ohlcv = z.infer<typeof OhlcvSchema>

export const FlowIntelligenceSchema = z.looseObject({
  data: z.array(
    z.looseObject({
      smart_trader_net_flow_usd: num,
      smart_trader_wallet_count: int,
      whale_net_flow_usd: num,
      exchange_net_flow_usd: num,
    }),
  ),
  warnings: z.array(z.string()).nullable().optional(),
})
export type FlowIntelligence = z.infer<typeof FlowIntelligenceSchema>

export const LabelsSchema = z.looseObject({
  data: z.array(
    z.looseObject({
      label: z.string(),
      category: str,
      kind: z.array(z.string()).nullable().optional(),
    }),
  ),
  pagination: PaginationSchema,
})

/** Trading quotes are passed back to prepare verbatim, so their inner shape stays opaque. */
export const TradeQuoteSchema = z.looseObject({
  quotes: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
})
export type TradeQuote = z.infer<typeof TradeQuoteSchema>

export const TradePrepareSchema = z.looseObject({
  transaction: str,
  swapTxData: z.record(z.string(), z.unknown()).nullable().optional(),
  needsApproval: z.boolean().nullable().optional(),
  approvalTxData: z.record(z.string(), z.unknown()).nullable().optional(),
  simulationPassed: z.boolean().nullable().optional(),
})
export type TradePrepare = z.infer<typeof TradePrepareSchema>

/** Error envelope. The gateway sometimes returns only `{message}` (e.g. 401), so every field is optional. */
export const ErrorBodySchema = z.looseObject({
  error: str,
  message: str,
  code: str,
  status: int,
  request_id: str,
  param: str,
  retry_after: num,
  detail: z.unknown().optional(),
})
export type ErrorBody = z.infer<typeof ErrorBodySchema>
