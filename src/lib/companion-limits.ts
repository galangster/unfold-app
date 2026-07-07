/**
 * Companion message limits, kept dependency-free so UI components can import
 * them without pulling the streaming chat stack (expo/fetch) into their
 * module graph.
 *
 * Backend accepts 50k chars TOTAL across up to 20 messages; history is
 * client-clipped at 2000/message, so 4000 + 19x2000 = 42k stays safely under.
 */
export const COMPANION_MESSAGE_MAX_CHARS = 4000;
