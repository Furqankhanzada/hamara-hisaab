const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

export type YahooQuote = { price: number; currency: string; asOf: string }

/**
 * Latest quote from Yahoo's chart API (unofficial endpoint — fail soft).
 * Covers stocks, ETFs and crypto alike (AAPL, VOO, BTC-USD); meta.currency is the quote currency.
 */
export async function fetchYahooQuote(symbol: string): Promise<YahooQuote | null> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
    { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) },
  )
  if (!res.ok) return null
  const body = (await res.json()) as {
    chart?: { result?: { meta?: { regularMarketPrice?: number; currency?: string; regularMarketTime?: number; exchangeTimezoneName?: string } }[] }
  }
  const meta = body.chart?.result?.[0]?.meta
  if (!meta || typeof meta.regularMarketPrice !== 'number' || !meta.currency) return null
  const asOf = meta.regularMarketTime
    ? new Date(meta.regularMarketTime * 1000).toLocaleDateString('en-CA', { timeZone: meta.exchangeTimezoneName ?? 'UTC' })
    : new Date().toLocaleDateString('en-CA', { timeZone: 'UTC' })
  return { price: meta.regularMarketPrice, currency: meta.currency, asOf }
}
