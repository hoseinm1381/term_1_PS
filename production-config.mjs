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
  if (!origin) throw new Error('Missing HTTPS site address. In project Runtime Environment Variables set PUBLIC_ORIGIN=https://YOUR-PROJECT.dockhosting.dev, save and redeploy. APP_URL, COOLIFY_FQDN or COOLIFY_URL can also supply an HTTPS origin.');
  env.DB_FILE ||= '/data/requests.sqlite';
  env.LOG_FILE ||= '/data/logs/events.jsonl';
  env.COOKIE_SECURE ??= '1';
  if (env.COOKIE_SECURE !== '1') throw new Error('Production requires COOKIE_SECURE=1. Set this runtime variable and redeploy.');
  env.PUBLIC_ORIGIN = origin;
  return origin;
}
