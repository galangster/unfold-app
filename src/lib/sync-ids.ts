// src/lib/sync-ids.ts
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';

// Custom namespace UUID for Unfold (generated via uuidv5('unfold.app', DNS_NAMESPACE))
// This avoids collisions with other apps that use the raw DNS namespace.
const UNFOLD_NAMESPACE = 'a1b2c3d4-e5f6-5a7b-8c9d-0e1f2a3b4c5d';

/**
 * Generate a deterministic UUID from a composite key.
 * Used for records that lack an `id` field — produces the same UUID
 * for the same input every time, so IDs are stable across migrations.
 */
export function compositeId(...parts: (string | number)[]): string {
  return uuidv5(parts.join(':'), UNFOLD_NAMESPACE);
}

/** Generate a new random UUID for new records. */
export function newId(): string {
  return uuidv4();
}
