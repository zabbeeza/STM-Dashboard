// Crypto adapter — BTC/USD spot + a short recent-history series for the
// sparkline. Default provider is the public CoinGecko API (no key). Swap this
// module to change providers; the interface is getCrypto().

const SPOT_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';
const HISTORY_URL = 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1&interval=hourly';

export async function getCrypto() {
  const headers = process.env.CRYPTO_API_KEY
    ? { 'x-cg-demo-api-key': process.env.CRYPTO_API_KEY }
    : {};

  const [spotRes, histRes] = await Promise.all([
    fetch(SPOT_URL, { headers }),
    fetch(HISTORY_URL, { headers }),
  ]);
  if (!spotRes.ok) throw new Error(`Crypto spot fetch failed: HTTP ${spotRes.status}`);

  const spot = await spotRes.json();
  const price = spot?.bitcoin?.usd ?? null;

  let series = [];
  if (histRes.ok) {
    const hist = await histRes.json();
    // market_chart.prices = [[ts, price], ...] — keep just the prices, thinned.
    const prices = (hist.prices || []).map((p) => p[1]);
    const step = Math.max(1, Math.floor(prices.length / 32));
    series = prices.filter((_, i) => i % step === 0);
  }

  return {
    pair: 'BTC / USD',
    price,
    series: series.length ? series : (price ? [price] : []),
  };
}

export default { getCrypto };
