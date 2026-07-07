// Ticker adapter — builds the scrolling marquee feed from three configurable
// sources: (a) STM ServiceAlerts, (b) an inspirational-quotes list, and
// (c) breaking-news headlines from RSS feeds (Canada + Israel + world), with an
// optional NewsAPI.org key. Items are returned interleaved and cycled by the UI.

import { ticker as tickerConfig } from '../../config/dashboard.config.js';

// Tiny RSS/Atom title extractor (no XML dep). Grabs <title> from <item>/<entry>.
function extractHeadlines(xml, limit) {
  const out = [];
  const itemRe = /<(item|entry)\b[\s\S]*?<\/\1>/gi;
  let m;
  while ((m = itemRe.exec(xml)) && out.length < limit) {
    const block = m[0];
    const t = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(block);
    if (!t) continue;
    let title = t[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&#39;|&apos;/g, '’').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
      .trim();
    if (title) out.push(title);
  }
  return out;
}

async function fetchRssHeadlines() {
  const feeds = tickerConfig.rssFeeds || [];
  const perFeed = Math.max(1, Math.ceil((tickerConfig.maxHeadlines || 12) / Math.max(1, feeds.length)));
  const results = await Promise.allSettled(
    feeds.map(async (f) => {
      const res = await fetch(f.url, { headers: { 'User-Agent': 'STM-Dashboard/1.0' } });
      if (!res.ok) throw new Error(`RSS ${f.name}: HTTP ${res.status}`);
      const xml = await res.text();
      return extractHeadlines(xml, perFeed).map((text) => ({ source: f.name, text }));
    })
  );
  const headlines = [];
  for (const r of results) if (r.status === 'fulfilled') headlines.push(...r.value);
  return headlines.slice(0, tickerConfig.maxHeadlines || 12);
}

/**
 * @param {string[]} serviceAlerts  STM ServiceAlert strings (from stm adapter)
 * @returns {{source:string,text:string}[]} interleaved ticker items
 */
export async function getTicker(serviceAlerts = []) {
  const items = [];

  if (tickerConfig.includeServiceAlerts) {
    for (const a of serviceAlerts) items.push({ source: 'STM', text: a });
  }

  let news = [];
  try {
    news = await fetchRssHeadlines();
  } catch { /* news optional; degrade gracefully */ }

  const quotes = (tickerConfig.quotes || []).map((q) => ({ source: 'Quote', text: q }));

  // Interleave news and quotes so the marquee mixes headlines with quotes,
  // keeping alerts up front where they matter most.
  const mixed = [];
  const maxLen = Math.max(news.length, quotes.length);
  for (let i = 0; i < maxLen; i++) {
    if (news[i]) mixed.push(news[i]);
    if (quotes[i]) mixed.push(quotes[i]);
  }

  return [...items, ...mixed];
}

export default { getTicker };
