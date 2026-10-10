const WINDOW_MS = 60_000;
const CLIENT_LIMIT = 30;
const GLOBAL_LIMIT = 300;
const buckets = new Map();

function getClientIp(req) {
  const realIp = req.headers["x-real-ip"];
  const forwarded = req.headers["x-forwarded-for"];
  const candidate =
    typeof realIp === "string" && realIp.trim()
      ? realIp.trim()
      : typeof forwarded === "string"
        ? forwarded.split(",")[0].trim()
        : "unknown";
  return /^[a-zA-Z0-9.:%_-]{1,64}$/.test(candidate) ? candidate : "unknown";
}

function consume(key, limit, now) {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = [];
    buckets.set(key, bucket);
  }
  while (bucket.length && now - bucket[0] >= WINDOW_MS) bucket.shift();
  if (bucket.length >= limit) {
    return Math.max(1, Math.ceil((WINDOW_MS - (now - bucket[0])) / 1000));
  }
  bucket.push(now);
  return 0;
}

function rateLimit(ip) {
  const now = Date.now();
  const clientRetry = consume(`client:${ip}`, CLIENT_LIMIT, now);
  const globalRetry = clientRetry ? 0 : consume("global", GLOBAL_LIMIT, now);
  if (buckets.size > 5000) {
    for (const [key, bucket] of buckets) {
      while (bucket.length && now - bucket[0] >= WINDOW_MS) bucket.shift();
      if (!bucket.length) buckets.delete(key);
      if (buckets.size <= 4000) break;
    }
  }
  return clientRetry || globalRetry;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ detail: "Method not allowed" });
  }

  const retryAfter = rateLimit(getClientIp(req));
  if (retryAfter) {
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({ detail: "Rate limit exceeded. Please wait before retrying." });
  }

  const apiKey = process.env.TRIO_API_KEY;
  let upstreamBase = (process.env.TRIO_API_URL || "").trim().replace(/\/+$/, "");
  // Accept either the Railway service root or a value ending in /api/trio[/v1].
  // The proxy itself appends /api/trio/<route>, so avoid a duplicated API path.
  upstreamBase = upstreamBase.replace(/\/api\/trio(?:\/v1)?$/i, "");
  if (!apiKey || !upstreamBase) {
    return res.status(503).json({ detail: "Trio API proxy is not configured." });
  }

  // Vercel's root catch-all receives /api/trio/v1/... as
  // req.query.path = ["trio", "v1", ...]. Strip the public proxy prefix.
  const rawParts = req.query.path;
  const pathParts = Array.isArray(rawParts)
    ? rawParts
    : typeof rawParts === "string"
      ? [rawParts]
      : [];
  if (pathParts[0] === "trio") pathParts.shift();

  if (!pathParts.length || pathParts.some((part) => !/^[a-zA-Z0-9_-]+$/.test(part))) {
    return res.status(404).json({ detail: "Unknown Trio API endpoint." });
  }

  const route = pathParts.join("/");
  const allowed =
    route === "v1/health" ||
    route === "v1/assets" ||
    /^v1\/assets\/(GOLD|SILVER|CRUDE)\/trades$/.test(route);

  if (!allowed) {
    return res.status(404).json({ detail: "Unknown Trio API endpoint." });
  }

  const target = new URL(`${upstreamBase}/api/trio/${route}`);
  if (route.endsWith("/trades")) {
    const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    if (rawLimit !== undefined) {
      const limit = Number(rawLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 20000) {
        return res.status(400).json({ detail: "limit must be an integer from 1 to 20000." });
      }
      target.searchParams.set("limit", String(limit));
    }
  }

  try {
    const response = await fetch(target, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
        "X-Client-IP": getClientIp(req),
      },
      signal: AbortSignal.timeout(12_000),
    });
    const body = await response.text();
    res.status(response.status);
    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") || "application/json; charset=utf-8"
    );
    return res.send(body);
  } catch {
    return res.status(502).json({ detail: "Trio API is temporarily unavailable." });
  }
};
