// Resolve only deployment configuration, never an untrusted request Host header.
export function configureProduction(env) {
  if (env.NODE_ENV !== 'production') return undefined;
  function originOf(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Expected an HTTPS origin without a path, credentials, query or fragment');
    }
    return url.origin;
  }
  let origin;
  if (env.PUBLIC_ORIGIN?.trim()) {
    try { origin = originOf(env.PUBLIC_ORIGIN.trim()); }
    catch { throw new Error('Invalid PUBLIC_ORIGIN. Set it to this project HTTPS address, for example https://your-project.dockhosting.dev (no page path).'); }
  } else {
    for (const key of ['APP_URL', 'COOLIFY_FQDN', 'COOLIFY_URL']) {
      for (const value of (env[key] || '').split(',')) {
        try { origin = originOf(value.trim()); break; } catch { /* Try next configured URL. */ }
      }
      if (origin) break;
    }
  }
  // No hostname is known at build/startup on many container hosts.
  // In that case, individual state-changing requests are checked against their own
  // HTTPS Origin and Host, without trusting Host as a canonical public URL.
  if (!origin) console.log('PUBLIC_ORIGIN unset: using strict HTTPS Origin/Host comparison for browser writes.');
  env.DB_FILE ||= '/data/requests.sqlite';
  env.LOG_FILE ||= '/data/logs/events.jsonl';
  env.COOKIE_SECURE ??= '1';
  if (env.COOKIE_SECURE !== '1') throw new Error('Production requires COOKIE_SECURE=1. Set this runtime variable and redeploy.');
  if (origin) env.PUBLIC_ORIGIN = origin;
  return origin;
}

// For auto-assigned domains: require browser Origin to be HTTPS and precisely
// match the public Host. Do not trust forwarded-host or forward-proto headers.
// The custom action header additionally prevents simple cross-site form posts.
export function allowedWriteOrigin(origin, host, configuredOrigin) {
  if (typeof origin !== 'string' || !origin) return false;
  if (configuredOrigin) return origin === configuredOrigin;
  if (typeof host !== 'string' || !host || host.includes(',') || /[\s/\\@]/.test(host)) return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'https:' && parsed.origin === origin &&
      !parsed.username && !parsed.password && parsed.host.toLowerCase() === host.toLowerCase();
  } catch { return false; }
}
