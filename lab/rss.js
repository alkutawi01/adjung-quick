// rss.js — RSS/Atom parsing + sanitisation. Pure string/regex parsing, zero AI,
// following the same battle-tested pattern as Adjung-Core/core/sources/RssDirectEngine.js
// (kept as a separate implementation since Adjung Quick is its own project/repo).

// Global Phase 4D (2026-08-22), Izzat's direct instruction: the honest
// 'AdjungQuickLab/0.1' identifier got Al Arabiya's RSS endpoints outright
// 403-blocked — confirmed at the network level (fetchFeed() itself, not
// just an ad-hoc curl/WebFetch check), while the SAME feed URL loaded fine
// in an ordinary browser. This is fetching a public RSS feed, the same
// thing any RSS reader (Feedly, NetNewsWire, etc.) does — most of those
// already send a browser-realistic UA for exactly this reason, not just
// this project. Long-term risk if left as-is: as more publishers harden
// bot detection the way Al Arabiya has, Quick's own feed access degrades
// over time regardless of feed quality. One shared constant, used by
// BOTH fetch paths below (fetch() and the extra-CA https.get() path) —
// changing it changes every source's request identity at once, which is
// exactly why this needed his sign-off before shipping, not just mine.
const FEED_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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

    // Source Content Profile (per ChatGPT, 2026-08-12): some feeds mix real
    // news with non-news administrative output — KPM's RSS carries genuine
    // education news alongside government tender/procurement notices
    // ("Keputusan Tender Perkhidmatan Kawalan Keselamatan..."). Found via
    // the Real Classification Snapshot sanity sample: 116/309 items
    // classified Pendidikan were tender notices, not news. This is
    // deliberately a per-SOURCE filter (source.excludePatterns), not a
    // classifier rule — same lesson as the mahkamah/menteri false-positive
    // case: a title keyword that's structurally reliable for one source
    // ("tender" always means procurement noise from a ministry feed) is not
    // a safe general rule (a real newsroom might legitimately cover a
    // tender scandal as news). Filtering here, before the item ever
    // becomes a cluster, keeps the exclusion scoped to where it's actually
    // known to be correct.
    if (source.excludePatterns?.some(pattern => pattern.test(title))) continue;

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
        // Sesi 3A Tier 1 evidence: set only when this feed IS a publisher-
        // declared category feed (e.g. Harian Metro's bisnes.xml), per
        // docs/source-registry-v2-audit.md. undefined for ordinary mixed
        // feeds — never guessed here, only carried through from source config.
        sourceKnownCategory: source.knownCategory,
      });
    }
  }

  return items;
}

// Some publishers serve an incomplete TLS chain — their server omits the
// intermediate certificate linking its own cert to a trusted root.
// Browsers usually hide this (they cache intermediates seen elsewhere);
// Node fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE. Supplying the missing
// intermediate restores a COMPLETE verification chain — this is not
// `rejectUnauthorized: false`, which would accept any certificate at all
// including a man-in-the-middle. Verification still fully applies.
//
// Only sources that explicitly declare `extraCa` in lab/sources.js take
// this path; every other source uses fetch() and Node's default trust
// store, unchanged. See lab/certs/README.md.
async function fetchWithExtraCa(source) {
  const [https, tls, fs, path, url] = await Promise.all([
    import('node:https'), import('node:tls'), import('node:fs'),
    import('node:path'), import('node:url'),
  ]);
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const caPem = fs.readFileSync(path.join(here, 'certs', source.extraCa), 'utf-8');
  const agent = new https.Agent({ ca: [caPem, ...tls.rootCertificates] });

  return new Promise((resolve, reject) => {
    const req = https.get(
      source.url,
      { agent, headers: { 'User-Agent': FEED_USER_AGENT }, timeout: 15000 },
      res => {
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', chunk => { body += chunk; });
        // Same shape as a fetch() Response for the fields fetchFeed uses
        // (status / ok / text()), so nothing downstream needs to know
        // which path produced it.
        res.on('end', () => resolve({
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          text: async () => body,
        }));
      }
    );
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
  });
}

// Transient network failures deserve a retry; permanent ones don't.
// Bernama is the real case (verified 2026-08-13): the same two feeds
// timed out on one run and answered instantly on the next, seconds
// apart. Without a retry, ingestion silently misses that publisher's
// stories on the unlucky runs — and the resulting gap looks like "no
// news from Bernama today" rather than "the fetch flaked", which would
// quietly corrupt the Fasa 1 evidence baseline.
//
// Deliberately narrow: only connection-level failures retry. An HTTP
// error, an empty feed, or a TLS trust failure are all real answers
// about the source, and retrying them just wastes time.
const RETRYABLE_FETCH_ERRORS = /timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed/i;

export async function fetchFeed(source, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  // Source Health (per ChatGPT, 2026-08-12): a source marked with a known,
  // diagnosed failure status (e.g. 'failed_tls' — JAKIM's missing
  // intermediate certificate) short-circuits here instead of re-attempting
  // a fetch every ingestion run. This is NOT the same as silently dropping
  // the source — it stays in the registry, the reason is preserved in the
  // result, and removing `status` from sources.js re-enables fetching with
  // no code change here.
  if (source.status && source.status !== 'active') {
    return { source, ok: false, error: `source status: ${source.status}`, items: [], skipped: true };
  }
  try {
    const res = source.extraCa
      ? await fetchWithExtraCa(source)
      : await fetch(source.url, {
          headers: { 'User-Agent': FEED_USER_AGENT },
          signal: AbortSignal.timeout(15000),
        });
    // Trust the PAYLOAD, not the status code. Bernama's Malay feed returns
    // HTTP 500 while serving perfectly valid RSS (verified 2026-08-12: 10
    // real items, "Dunia : Transit Melalui Selat Hormuz..."). Rejecting on
    // status alone silently discarded a working publisher feed. So: if the
    // body parses into items, use them and record the anomaly; only give up
    // when a bad status ALSO yields nothing parseable.
    const xml = await res.text();
    const items = parseRssXml(xml, source);

    if (!res.ok) {
      if (items.length === 0) {
        return { source, ok: false, error: `HTTP ${res.status}`, items: [] };
      }
      return {
        source, ok: true, items,
        // Surfaced rather than swallowed — a feed serving good data behind a
        // 500 is worth knowing about, since it may break differently later.
        anomaly: `HTTP ${res.status} but ${items.length} items parsed`,
      };
    }

    // 200 with an empty body is its own failure mode, distinct from a
    // network error — several ministry feeds (KPM, UKM) answer 200 with zero
    // items, which is a dead feed, not a healthy one.
    if (items.length === 0) {
      return { source, ok: false, error: 'HTTP 200 but no items parsed', items: [] };
    }
    return { source, ok: true, items };
  } catch (err) {
    if (attempt < MAX_ATTEMPTS && RETRYABLE_FETCH_ERRORS.test(err.message)) {
      await new Promise(r => setTimeout(r, 1000 * attempt));
      return fetchFeed(source, attempt + 1);
    }
    return {
      source, ok: false, items: [],
      error: attempt > 1 ? `${err.message} (after ${attempt} attempts)` : err.message,
    };
  }
}
