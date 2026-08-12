// rss.js — RSS/Atom parsing + sanitisation. Pure string/regex parsing, zero AI,
// following the same battle-tested pattern as Adjung-Core/core/sources/RssDirectEngine.js
// (kept as a separate implementation since Adjung Quick is its own project/repo).

function stripCdata(str) {
  return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1');
}

function sanitizeHtmlText(raw) {
  if (!raw) return '';
  let text = stripCdata(raw);
  text = text.replace(/<[^>]+>/g, ' ');
  text = text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    // Numeric entities (decimal &#8216; and hex &#x2019;) — WordPress/RSS feeds
    // use these heavily for curly quotes/dashes; without this they leak into
    // titles as literal "&#8216;" text instead of '.
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

function sanitizeUrlText(raw) {
  if (!raw) return '';
  return stripCdata(raw).trim();
}

// Normalize a URL for exact-match dedup: strip tracking params, trailing slash, protocol.
export function normalizeUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl);
    const dropParams = [...u.searchParams.keys()].filter(k => /^utm_|^fbclid$|^gclid$|^ref$/i.test(k));
    dropParams.forEach(k => u.searchParams.delete(k));
    let normalized = `${u.hostname}${u.pathname}`.replace(/\/$/, '');
    return normalized.toLowerCase();
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

export function parseRssXml(xmlString, source) {
  if (!xmlString || typeof xmlString !== 'string') return [];

  const items = [];
  const itemMatches = xmlString.match(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi) || [];

  for (const block of itemMatches) {
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = sanitizeHtmlText(titleMatch ? titleMatch[1] : '');

    const descMatch = block.match(/<(?:description|summary|content)[^>]*>([\s\S]*?)<\/(?:description|summary|content)>/i);
    const description = sanitizeHtmlText(descMatch ? descMatch[1] : '');

    let link = '';
    const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    if (linkMatch && linkMatch[1].trim()) {
      link = sanitizeUrlText(linkMatch[1]);
    } else {
      const atomLinkMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (atomLinkMatch) link = atomLinkMatch[1].trim();
    }

    const guidMatch = block.match(/<(?:guid|id)[^>]*>([\s\S]*?)<\/(?:guid|id)>/i);
    const rssGuid = sanitizeUrlText(guidMatch ? guidMatch[1] : link) || link;

    const dateMatch = block.match(/<(?:pubDate|published|updated)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated)>/i);
    const parsedDate = dateMatch ? new Date(sanitizeHtmlText(dateMatch[1])) : new Date();
    const publishedAt = isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();

    const catMatches = block.match(/<category[^>]*>([\s\S]*?)<\/category>/gi) || [];
    const categories = catMatches
      .map(c => sanitizeHtmlText(c.replace(/<category[^>]*>([\s\S]*?)<\/category>/i, '$1')))
      .filter(Boolean);

    if (title && (link || description)) {
      items.push({
        sourceId: source.id,
        sourceName: source.name,
        language: source.language,
        trustScore: source.trustScore,
        rssGuid,
        title,
        description,
        link,
        normalizedUrl: normalizeUrl(link),
        publishedAt,
        categories,
        // topic is intentionally left null here — assigned later by the
        // rule-based classifier, not by this parser.
        topic: null,
      });
    }
  }

  return items;
}

export async function fetchFeed(source) {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'AdjungQuickLab/0.1 (+editorial-ranking-laboratory)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return { source, ok: false, error: `HTTP ${res.status}`, items: [] };
    }
    const xml = await res.text();
    const items = parseRssXml(xml, source);
    return { source, ok: true, items };
  } catch (err) {
    return { source, ok: false, error: err.message, items: [] };
  }
}
