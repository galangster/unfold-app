import { getDeviceTimezone } from './device-timezone';
import type { SyncPushChange } from './sync-types';

/**
 * Request body for `/api/sync/push`. Every caller sends the device timezone
 * with its changes: the server paces "one day per calendar day" on the
 * reader's calendar and creates their cron config from it.
 */

export type SyncPushBodyEnvelope = {
  prefix: string;
  suffix: string;
  emptyBytes: number;
};

export type EncodedSyncPushChange = {
  json: string;
  bytes: number;
};

export type EncodedSyncPushBatch = {
  batch: SyncPushChange[];
  next: number;
  body: string;
};

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x007f) {
      bytes += 1;
    } else if (code <= 0x07ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

export function createSyncPushBodyEnvelope(
  deviceTimezone: string | null = getDeviceTimezone(),
): SyncPushBodyEnvelope {
  const prefix = '{"changes":[';
  const suffix = deviceTimezone
    ? `],"deviceTimezone":${JSON.stringify(deviceTimezone)}}`
    : ']}';
  return {
    prefix,
    suffix,
    emptyBytes: utf8ByteLength(prefix) + utf8ByteLength(suffix),
  };
}

export function serializeSyncPushChange(change: SyncPushChange): EncodedSyncPushChange {
  const json = JSON.stringify(change);
  return { json, bytes: utf8ByteLength(json) };
}

export function assembleSyncPushBody(
  envelope: SyncPushBodyEnvelope,
  serializedChanges: readonly string[],
): string {
  return envelope.prefix + serializedChanges.join(',') + envelope.suffix;
}

export function encodedSyncPushBodyBytes(
  envelope: SyncPushBodyEnvelope,
  itemBytes: number,
  count: number,
): number {
  const commas = count > 1 ? count - 1 : 0;
  return envelope.emptyBytes + itemBytes + commas;
}

export function selectEncodedSyncPushBatch(
  initial: readonly SyncPushChange[],
  start: number,
  include: (change: SyncPushChange) => boolean,
  envelope: SyncPushBodyEnvelope,
  maxChanges: number,
  maxBytes: number,
): EncodedSyncPushBatch {
  const batch: SyncPushChange[] = [];
  const fragments: string[] = [];
  let itemBytes = 0;
  let index = start;

  while (index < initial.length && batch.length < maxChanges) {
    const candidate = initial[index];
    if (!include(candidate)) {
      index += 1;
      continue;
    }

    const encoded = serializeSyncPushChange(candidate);
    const nextCount = batch.length + 1;
    const nextBytes = encodedSyncPushBodyBytes(envelope, itemBytes + encoded.bytes, nextCount);
    if (nextBytes > maxBytes) {
      if (batch.length === 0) {
        index += 1;
        continue;
      }
      break;
    }

    batch.push(candidate);
    fragments.push(encoded.json);
    itemBytes += encoded.bytes;
    index += 1;
  }

  return {
    batch,
    next: index,
    body: assembleSyncPushBody(envelope, fragments),
  };
}

export function buildSyncPushBody(changes: SyncPushChange[]): string {
  const deviceTimezone = getDeviceTimezone();
  return JSON.stringify(deviceTimezone ? { changes, deviceTimezone } : { changes });
}
