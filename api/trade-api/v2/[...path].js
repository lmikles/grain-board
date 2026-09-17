// Kalshi trade-api proxy, running as a Vercel Node.js serverless function.
//
// Exists because the previous Cloudflare Worker proxy for this board was
// getting a sustained HTTP 429 from Kalshi's own edge (CloudFront/WAF) --
// Kalshi blocks/throttles Cloudflare Workers' shared egress IP range
// regardless of this project's own request volume. Running the proxy on
// Vercel's Node.js (AWS Lambda) runtime instead uses a different egress
// path that isn't caught by that block.
//
// No caching or retry logic here on purpose: Kalshi already sends its own
// `Cache-Control: public, max-age=15` on successful GETs, and caching an
// error response here is exactly the failure mode this replaces.

const KALSHI_ORIGIN = 'https://api.elections.kalshi.com/trade-api/v2/';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: { code: 'method_not_allowed', message: 'method not allowed' } });
    return;
  }

  const { '...path': pathParam, ...rest } = req.query;
  const segments = Array.isArray(pathParam) ? pathParam : (pathParam ? [pathParam] : []);

  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(rest)) {
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else if (value !== undefined) qs.append(key, value);
  }
  const query = qs.toString();
  const upstreamUrl = KALSHI_ORIGIN + segments.join('/') + (query ? '?' + query : '');
  try {
    const upstream = await fetch(upstreamUrl, { headers: { Accept: 'application/json' } });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.send(body);
  } catch (err) {
    res.status(502).json({
      error: { code: 'proxy_error', message: err && err.message ? err.message : String(err) },
    });
  }
}
