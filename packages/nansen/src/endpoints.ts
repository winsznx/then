import type { z } from 'zod'
import {
  AccountSchema,
  DexTradesSchema,
  FlowIntelligenceSchema,
  FlowsSchema,
  FlowSummarySchema,
  HistDexTradesSchema,
  HistTopHoldersSchema,
  HistWhoBoughtSoldSchema,
  LabelsSchema,
  OhlcvSchema,
  SearchGeneralSchema,
  SmHoldingsSchema,
  SmTokenBalancesSchema,
  TradePrepareSchema,
  TradeQuoteSchema,
  WhoBoughtSoldSchema,
} from './schemas'

/**
 * `asof`: point-in-time cohort or history surfaces. Switched off together by the ablation flag.
 * `live`: current-state surfaces, including current labels applied to past windows.
 * `meta`: account, search, prices, trading. Carry no Smart Money membership.
 */
export type Surface = 'asof' | 'live' | 'meta'

export interface EndpointSpec<S extends z.ZodType = z.ZodType> {
  id: string
  method: 'GET' | 'POST'
  path: string
  surface: Surface
  /** Documented credit cost per call. Receipts record the `X-Nansen-Credits-Used` header instead. */
  credits: number
  response: S
  /** Where the row array lives, for drift detection. */
  rows?: string
}

function endpoint<S extends z.ZodType>(spec: EndpointSpec<S>): EndpointSpec<S> {
  return spec
}

export const ENDPOINTS = {
  account: endpoint({
    id: 'account',
    method: 'GET',
    path: '/api/v1/account',
    surface: 'meta',
    credits: 0,
    response: AccountSchema,
  }),
  searchGeneral: endpoint({
    id: 'search.general',
    method: 'POST',
    path: '/api/v1/search/general',
    surface: 'meta',
    credits: 0,
    response: SearchGeneralSchema,
    rows: 'tokens',
  }),
  whoBoughtSold: endpoint({
    id: 'tgm.who_bought_sold',
    method: 'POST',
    path: '/api/v1/tgm/who-bought-sold',
    surface: 'live',
    credits: 1,
    response: WhoBoughtSoldSchema,
    rows: 'data',
  }),
  dexTrades: endpoint({
    id: 'tgm.dex_trades',
    method: 'POST',
    path: '/api/v1/tgm/dex-trades',
    surface: 'live',
    credits: 1,
    response: DexTradesSchema,
    rows: 'data',
  }),
  flows: endpoint({
    id: 'tgm.flows',
    method: 'POST',
    path: '/api/v1/tgm/flows',
    surface: 'live',
    credits: 1,
    response: FlowsSchema,
    rows: 'data',
  }),
  flowIntelligence: endpoint({
    id: 'tgm.flow_intelligence',
    method: 'POST',
    path: '/api/v1/tgm/flow-intelligence',
    surface: 'live',
    credits: 1,
    response: FlowIntelligenceSchema,
    rows: 'data',
  }),
  tokenOhlcv: endpoint({
    id: 'tgm.token_ohlcv',
    method: 'POST',
    path: '/api/v1/tgm/token-ohlcv',
    surface: 'meta',
    credits: 1,
    response: OhlcvSchema,
    rows: 'data',
  }),
  smHistoricalHoldings: endpoint({
    id: 'sm.historical_holdings',
    method: 'POST',
    path: '/api/v1/smart-money/historical-holdings',
    surface: 'asof',
    credits: 1,
    response: SmHoldingsSchema,
    rows: 'data',
  }),
  histWhoBoughtSold: endpoint({
    id: 'hist.who_bought_sold',
    method: 'POST',
    path: '/api/v1beta1/tgm/historical-who-bought-sold',
    surface: 'asof',
    credits: 5,
    response: HistWhoBoughtSoldSchema,
    rows: 'data',
  }),
  histDexTrades: endpoint({
    id: 'hist.dex_trades',
    method: 'POST',
    path: '/api/v1beta1/tgm/historical-dex-trades',
    surface: 'asof',
    credits: 5,
    response: HistDexTradesSchema,
    rows: 'data',
  }),
  histFlowSummary: endpoint({
    id: 'hist.flow_summary',
    method: 'POST',
    path: '/api/v1beta1/tgm/historical-token-flow-summary',
    surface: 'asof',
    credits: 5,
    response: FlowSummarySchema,
    rows: 'data',
  }),
  histTopHolders: endpoint({
    id: 'hist.top_holders',
    method: 'POST',
    path: '/api/v1beta1/tgm/historical-top-holders',
    surface: 'asof',
    credits: 25,
    response: HistTopHoldersSchema,
    rows: 'data',
  }),
  histSmTokenBalances: endpoint({
    id: 'hist.sm_token_balances',
    method: 'POST',
    path: '/api/v1beta1/smart-money/historical-token-balances',
    surface: 'asof',
    credits: 25,
    response: SmTokenBalancesSchema,
    rows: 'data',
  }),
  histTokenOhlcv: endpoint({
    id: 'hist.token_ohlcv',
    method: 'POST',
    path: '/api/v1beta1/tgm/historical-token-ohlcv',
    surface: 'asof',
    credits: 5,
    response: OhlcvSchema,
    rows: 'data',
  }),
  premiumLabels: endpoint({
    id: 'profiler.premium_labels',
    method: 'POST',
    path: '/api/v1/profiler/address/premium-labels',
    surface: 'live',
    credits: 500,
    response: LabelsSchema,
    rows: 'data',
  }),
  tradeQuote: endpoint({
    id: 'trade.quote',
    method: 'GET',
    path: '/api/v1/trade/quote',
    surface: 'meta',
    credits: 0,
    response: TradeQuoteSchema,
  }),
  tradePrepare: endpoint({
    id: 'trade.prepare',
    method: 'POST',
    path: '/api/v1/trade/prepare',
    surface: 'meta',
    credits: 0,
    response: TradePrepareSchema,
  }),
} as const

export type EndpointKey = keyof typeof ENDPOINTS

export interface DateRange {
  from: string
  to: string
}

export interface PageRequest {
  page: number
  per_page: number
}

export interface WhoBoughtSoldRequest {
  chain: string
  token_address: string
  date: DateRange
  buy_or_sell: 'BUY' | 'SELL'
  filters?: { include_smart_money_labels?: string[] }
  pagination: PageRequest
  order_by?: { field: string; direction: 'ASC' | 'DESC' }[]
}

export interface HistWhoBoughtSoldRequest {
  chain: string
  token_address: string
  date_range: DateRange
  buy_or_sell: 'BUY' | 'SELL'
  filters?: { include_labels?: string[] }
  pagination: PageRequest
}

export interface FlowsRequest {
  chain: string
  token_address: string
  date: DateRange
  label: 'smart_money' | 'whale' | 'public_figure' | 'top_100_holders' | 'exchange'
  pagination: PageRequest
}

export interface SmHistoricalHoldingsRequest {
  date_range: DateRange
  chains: string[]
  filters: { token_address: string; include_smart_money_labels?: string[] }
  pagination: PageRequest
}

export interface FlowSummaryRequest {
  chain: string
  token_address: string
  date_range: DateRange
}

export interface TokenOhlcvRequest {
  chain: string
  token_address: string
  date: DateRange
  timeframe: '1d' | '1h' | '4h' | '1w'
}

export interface HistTokenOhlcvRequest {
  chain: string
  token_address: string
  date_from: string
  as_of_date: string
  timeframe: '1d' | '1w'
}

export interface SearchGeneralRequest {
  search_query: string
  result_type: 'token' | 'entity' | 'any'
  chain?: string
  limit?: number
}

export interface DexTradesRequest {
  chain: string
  token_address: string
  date: DateRange
  filters?: { include_smart_money_labels?: string[]; trader_address?: string }
  pagination: PageRequest
  order_by?: { field: string; direction: 'ASC' | 'DESC' }[]
}

export interface HistDexTradesRequest {
  chain: string
  token_address: string
  date_range: DateRange
  filters?: { include_labels?: string[]; trader_address?: string; action?: 'BUY' | 'SELL' }
  pagination: PageRequest
  order_by?: { field: string; direction: 'ASC' | 'DESC' }[]
}
