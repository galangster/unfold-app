/**
 * Seeded, repeat-free selection from a copy pool.
 *
 * The problem this replaces: notification copy used to be picked with
 * `pool[dayOfYear % pool.length]`. That is a fixed global calendar, not
 * variation. January 1st was always entry 0 — for every reader, every year.
 * Two readers on the same day saw the same sentence, the order repeated
 * identically each year, and a reader who only opened on Mondays saw a
 * strided seventh of the pool and nothing else.
 *
 * A shuffle bag fixes the ordering but normally needs persisted state (which
 * items are still in the bag). This module gets the same guarantees without
 * storing anything, by treating time as a series of EPOCHS of `pool.length`
 * days and deriving one permutation per epoch:
 *
 *   epoch = floor(dayIndex / n)        which lap through the pool we are on
 *   slot  = dayIndex - epoch * n       position within that lap
 *   order = shuffle(n, hash(seed, epoch))
 *   pick  = pool[order[slot]]
 *
 * Properties that buys us:
 *   - Every entry appears exactly once per n days. No early repeats.
 *   - A guaranteed minimum gap of n/4 days between two draws of the same
 *     entry, boundaries included — 11 days across 40 titles, 26 across 100
 *     bodies. `minimumGapFor` states it; `guardBand` enforces it. Adjacency
 *     alone is not the bar: a line seen three days ago still reads as a
 *     repeat.
 *   - Each lap is in a different order, so the sequence does not repeat
 *     annually the way the modulo did.
 *   - The seed carries the install id, so two readers are on different
 *     sequences on the same calendar day.
 *   - Pure and total: same inputs, same answer, no I/O, no stored bag.
 *
 * Salt the seed per field (`${seed}|midday-title` vs `${seed}|midday-body`)
 * so a title and a body drawn for the same day move independently. n titles
 * against m bodies then reads as n×m distinct notifications.
 */

/**
 * xmur3 — string to a well-mixed 32-bit seed. Cheap, and it avoids the
 * clustering a naive `charCodeAt` sum produces for seeds that share a long
 * prefix (every seed here is `<same install id>|<short salt>`).
 */
function seedFrom(text: string): number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 — small deterministic PRNG in [0, 1). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded Fisher-Yates permutation of [0, n). */
function permutation(n: number, seed: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  const random = prng(seed);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * How many entries at each end of a lap are held apart from each other.
 *
 * Laps are independently shuffled, so without this an entry could close one
 * lap and open the next — the same line two days running, which is the one
 * failure a bag exists to prevent. A quarter of the pool gives a real gap
 * (11 days across 40 titles, 26 across 100 bodies) while leaving the middle
 * half free to shuffle.
 */
function guardBand(n: number): number {
  return Math.max(1, Math.floor(n / 4));
}

/**
 * The permutation for one lap, adjusted so its opening entries are none of
 * the entries the previous lap closed on.
 *
 * Swap partners come only from the MIDDLE of the lap, never from its own
 * tail. That keeps every lap's tail equal to its raw permutation's tail,
 * which is what lets the next lap read the previous tail directly instead of
 * recursing back through every earlier adjustment.
 *
 * The adjustment applies to the whole permutation, not to one lookup, so
 * every slot in the lap reads the same order.
 */
function lapOrder(n: number, seed: string, epoch: number): number[] {
  const order = permutation(n, seedFrom(`${seed}#${epoch}`));
  if (n < 3 || epoch === 0) return order;

  const guard = guardBand(n);
  const closing = new Set(permutation(n, seedFrom(`${seed}#${epoch - 1}`)).slice(n - guard));

  let partner = n - guard - 1;
  for (let i = 0; i < guard; i += 1) {
    if (!closing.has(order[i])) continue;
    while (partner >= guard && closing.has(order[partner])) partner -= 1;
    if (partner < guard) break;
    [order[i], order[partner]] = [order[partner], order[i]];
    partner -= 1;
  }
  return order;
}

/**
 * The shortest gap this module guarantees between two draws of the same
 * entry: a full lap within an epoch, and the guard band across a boundary.
 */
export function minimumGapFor(poolLength: number): number {
  return poolLength < 3 ? 1 : guardBand(poolLength) + 1;
}

/**
 * Pick one entry for `dayIndex`. Deterministic in (pool.length, seed,
 * dayIndex) — callers that want two independent draws on one day must pass
 * different seeds, not different indices.
 *
 * Returns undefined only for an empty pool, so a caller can fall through to
 * whatever it considers a floor.
 */
export function pickFromBag<T>(pool: readonly T[], seed: string, dayIndex: number): T | undefined {
  const n = pool.length;
  if (n === 0) return undefined;
  // floor() rather than %, so a negative index (a date before 1970, only
  // reachable from a device clock set wrong) still lands inside the pool.
  const epoch = Math.floor(dayIndex / n);
  const slot = dayIndex - epoch * n;
  return pool[lapOrder(n, seed, epoch)[slot]];
}

/**
 * Days since the Unix epoch for the LOCAL calendar day of `date`.
 *
 * Built from the local Y/M/D rather than the timestamp so that "which day is
 * it" matches what the reader's phone shows. Using the raw timestamp would
 * roll the copy over at local midnight only for readers at UTC+0.
 */
export function dayIndexFor(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}
