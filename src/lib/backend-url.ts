/**
 * The backend origin, on its own so that modules which must stay free of
 * native imports at module scope (the crash reporter) can read it.
 * `api-config.ts` re-exports it; every service file keeps importing from there.
 *
 * Routes through Cloudflare WAF → Railway. Never expose the raw Railway URL.
 */
export const PRIMARY_BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || 'https://api.unfoldapp.co';
