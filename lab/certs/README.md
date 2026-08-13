# Supplementary CA certificates

Public intermediate CA certificates bundled here so specific sources can
be fetched with a **complete** trust chain.

## Why this exists

Some publishers misconfigure TLS: their server sends only its own
certificate and omits the intermediate that links it to a trusted root.
Browsers often paper over this (they cache intermediates from other
sites); Node does not, and fails with
`UNABLE_TO_VERIFY_LEAF_SIGNATURE`.

Supplying the missing intermediate is **not** weakening security.
Verification still runs in full — leaf → intermediate → trusted root.
The alternative that WOULD be dangerous is `rejectUnauthorized: false`,
which accepts any certificate including a man-in-the-middle one. That is
never used in this project.

## What's here

| File | Subject | Issued by | Expires | Used by |
|---|---|---|---|---|
| `globalsign-ecc-ov-ssl-ca-2018.pem` | GlobalSign ECC OV SSL CA 2018 | GlobalSign ECC Root CA - R5 (public root) | 2028-11-21 | `rss-jakim-berita`, `rss-jakim-kenyataan` |

Obtained from the URL the server's own certificate advertises in its
Authority Information Access extension
(`http://secure.globalsign.com/cacert/gseccovsslca2018.crt`), then
converted DER → PEM. Verified 2026-08-13: with it, `www.islam.gov.my`
connects with `authorized: true`.

## How a source opts in

In `lab/sources.js`, set `extraCa` to the filename:

```js
{ id: 'rss-jakim-berita', ..., extraCa: 'globalsign-ecc-ov-ssl-ca-2018.pem' }
```

Only sources that declare it are affected. Every other source keeps
Node's default trust store untouched.

## When one expires

The table above records expiry dates. When a certificate here expires,
the affected source starts failing again with the same TLS error —
`db/daily-observation.mjs` will surface it as an active source producing
zero items. Re-download from the same Authority Information Access URL.
