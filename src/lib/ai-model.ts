/**
 * The Haiku model the app names in its AI requests. The server chooses the
 * model on every route the app calls (the endpoint pins and the Companion
 * resolver), so this is the name it sends and logs, not a switch.
 */
export const HAIKU_REQUEST_MODEL = 'claude-haiku-5-5';
