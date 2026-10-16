export function createFixedWindowLimiter({ limit, windowMs, now = () => Date.now() }) {
  const buckets = new Map();
  return {
    check(key) {
      const timestamp = now();
      const current = buckets.get(key);
      const active = current && timestamp < current.resetAt ? current : { count: 0, resetAt: timestamp + windowMs };
      active.count += 1;
      buckets.set(key, active);
      const allowed = active.count <= limit;
      return { allowed, retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((active.resetAt - timestamp) / 1000)) };
    },
  };
}

export function rateLimit(limiter, keyFromRequest = (req) => req.ip) {
  return (req, res, next) => {
    const result = limiter.check(keyFromRequest(req));
    if (result.allowed) return next();
    res.set('Retry-After', String(result.retryAfterSeconds));
    return res.status(429).json({ success: false, message: 'Terlalu banyak permintaan. Silakan coba kembali beberapa saat lagi.' });
  };
}
