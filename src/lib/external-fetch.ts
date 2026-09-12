/**
 * The named transport for hosts that are not the Unfold backend (bible-api.com).
 *
 * Backend requests use `authenticatedFetch` in ./device-credential instead, so a
 * device-credential 401 heals. A global fetch() call anywhere else is a lint
 * error (eslint.config.js), which keeps every backend call on the healing path.
 */
export function externalFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init);
}
