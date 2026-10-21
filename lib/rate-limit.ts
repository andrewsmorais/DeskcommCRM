interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimiter = new Map<string, RateLimitEntry>();

// Limpeza a cada 5 minutos para evitar memory leak
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimiter.entries()) {
      if (now >= entry.resetAt) {
        rateLimiter.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

export function checkRateLimit(key: string, maxRequests: number, windowMs: number) {
  const now = Date.now();
  let entry = rateLimiter.get(key);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    rateLimiter.set(key, entry);
  }

  entry.count++;

  const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);

  if (entry.count > maxRequests) {
    return { ok: false, retryAfterSeconds };
  }

  return { ok: true, retryAfterSeconds };
}
