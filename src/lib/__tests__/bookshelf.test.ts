import {
  firstReadingLabel,
  filterShelf,
  resolveShelfSelection,
  seriesReadingProgress,
} from "../bookshelf";
import {
  countReadDays,
  isSeriesComplete,
  listDaysInOrder,
  listSeriesActs,
} from "../book-of-seasons";
import { getSeriesCover } from "../series-cover";
import type { Devotional, DevotionalDay, SeriesArc } from "../store";

function day(
  dayNumber: number,
  overrides: Partial<DevotionalDay> = {},
): DevotionalDay {
  return {
    dayNumber,
    title: `Day ${dayNumber}`,
    scriptureReference: "John 1:1",
    scriptureText: "Scripture text",
    bodyText: "Devotional body",
    quotableLine: "Carry this with you",
    isRead: false,
    ...overrides,
  };
}

function book(overrides: Partial<Devotional> = {}): Devotional {
  return {
    id: "series-alpha",
    title: "Ordinary Hours",
    totalDays: 3,
    currentDay: 1,
    days: [day(1), day(2), day(3)],
    createdAt: "2026-09-12T12:00:00.000Z",
    generationMode: "batch",
    userContext: {
      name: "Reader",
      aboutMe: "",
      currentSituation: "",
      emotionalState: "",
    },
    ...overrides,
  };
}

function arc(overrides: Partial<SeriesArc> = {}): SeriesArc {
  return {
    totalDaysPlanned: 3,
    overarchingTheme: "Attention",
    narrativeShape: "A quiet beginning",
    dayHints: [],
    isOpenEnded: false,
    createdAt: "2026-09-12T12:00:00.000Z",
    ...overrides,
  };
}

describe("bookshelf reading progress", () => {
  it("uses the canonical planned total instead of a stale local total", () => {
    const series = book({
      totalDays: 7,
      seriesArc: arc(),
      days: [1, 2, 3, 4, 7].map((number) => day(number, { isRead: true })),
    });
    expect(seriesReadingProgress(series)).toEqual({
      total: 3,
      read: 3,
      complete: true,
    });
    expect(isSeriesComplete(series)).toBe(true);
  });

  it("uses valid canonical day hints when the planned total is missing", () => {
    const series = book({
      totalDays: 7,
      seriesArc: arc({
        totalDaysPlanned: 0,
        dayHints: [2, 3].map((dayNumber) => ({
          dayNumber,
          themeHint: "Attention",
          scriptureRegion: "John",
          narrativeRole: "foundation",
        })),
      }),
      days: [
        day(1, { isRead: true }),
        day(3, { isRead: true }),
        day(7, { isRead: true }),
      ],
    });
    expect(seriesReadingProgress(series)).toEqual({
      total: 3,
      read: 2,
      complete: false,
    });
  });

  it("counts each valid read day once and excludes invalid or out-of-range numbers", () => {
    const days = [0, -1, 1, 1, 1.5, 2, 3, 4, NaN, Infinity].map((number) =>
      day(number, { isRead: true }),
    );
    days.push(day(2, { isRead: false }));
    expect(countReadDays(days, 1, 3)).toBe(3);
    expect(countReadDays(days, 2, 3)).toBe(2);
    expect(seriesReadingProgress(book({ days }))).toEqual({
      total: 3,
      read: 3,
      complete: true,
    });
  });

  it("does not let duplicate or invalid records fill a missing canonical day", () => {
    const days = [0, 1, 1, 2, 4].map((number) => day(number, { isRead: true }));
    expect(seriesReadingProgress(book({ days }))).toEqual({
      total: 3,
      read: 2,
      complete: false,
    });
    expect(isSeriesComplete(book({ days }))).toBe(false);
  });

  it.each([0, -1, 1.5, NaN])(
    "does not complete an invalid total of %s",
    (totalDays) => {
      expect(
        seriesReadingProgress(
          book({ totalDays, days: [day(1, { isRead: true })] }),
        ),
      ).toEqual({ total: 0, read: 0, complete: false });
    },
  );

  it("handles absent days and devotionals", () => {
    expect(countReadDays(undefined)).toBe(0);
    expect(countReadDays(null)).toBe(0);
    expect(isSeriesComplete(null)).toBe(false);
    expect(isSeriesComplete(undefined)).toBe(false);
  });

  it("orders day records without changing the source array", () => {
    const days = [day(3), day(1), day(2)];
    expect(listDaysInOrder(days).map((item) => item.dayNumber)).toEqual([
      1, 2, 3,
    ]);
    expect(days.map((item) => item.dayNumber)).toEqual([3, 1, 2]);
  });

  it("requires chapter ranges to cover the canonical boundary without gaps or overlap", () => {
    const first = {
      name: "Begin",
      fromDay: 1,
      toDay: 1,
      function: "Foundation",
    };
    const second = {
      name: "Notice",
      fromDay: 2,
      toDay: 3,
      function: "Deepening",
    };
    expect(listSeriesActs(arc({ acts: [second, first] }), 3)).toEqual([
      first,
      second,
    ]);
    expect(
      listSeriesActs(arc({ acts: [first, { ...second, fromDay: 3 }] }), 3),
    ).toEqual([]);
    expect(
      listSeriesActs(arc({ acts: [first, { ...second, fromDay: 1 }] }), 3),
    ).toEqual([]);
    expect(
      listSeriesActs(arc({ acts: [first, { ...second, toDay: 4 }] }), 3),
    ).toEqual([]);
    expect(
      listSeriesActs(arc({ acts: [{ ...first, fromDay: 0 }, second] }), 3),
    ).toEqual([]);
  });
});

describe("bookshelf first-reading label", () => {
  it("names only an origin-marked book Your first devotional", () => {
    const first = book({
      title: "The Name That Found You",
      totalDays: 1,
      seriesArc: arc({ totalDaysPlanned: 1, origin: "onboarding_first" }),
    });
    const ordinary = book({ id: "ordinary", title: "A Quiet Hour", totalDays: 1 });
    expect(firstReadingLabel(first)).toBe("Your first devotional");
    expect(firstReadingLabel(ordinary)).toBeUndefined();
    expect(filterShelf([first], "all", "name that found")[0]?.title).toBe("The Name That Found You");
    expect(filterShelf([first, ordinary], "all", "first devotional").map((item) => item.id)).toEqual([first.id]);
    expect(filterShelf([first, ordinary], "all", "quiet hour").map((item) => item.id)).toEqual([ordinary.id]);
  });
});

describe("bookshelf filters and search", () => {
  const unread = book({ id: "unread", title: "A Quiet Beginning" });
  const progress = book({
    id: "progress",
    title: "Ordinary Hours",
    days: [day(1, { isRead: true }), day(2), day(3)],
  });
  const completed = book({
    id: "completed",
    title: "Attention",
    days: [1, 2, 3].map((number) => day(number, { isRead: true })),
  });
  const shelf = [unread, progress, completed];

  it("includes every book in all and partitions completion from progress", () => {
    expect(filterShelf(shelf, "all", "").map((item) => item.id)).toEqual([
      "completed",
      "progress",
      "unread",
    ]);
    expect(filterShelf(shelf, "progress", "").map((item) => item.id)).toEqual([
      "progress",
      "unread",
    ]);
    expect(filterShelf(shelf, "completed", "").map((item) => item.id)).toEqual([
      "completed",
    ]);
  });

  it.each([
    ["  ORDINARY  ", "Ordinary Hours"],
    ["hidden invitation", "A different title"],
    ["psalm 23:4", "A different title"],
  ])(
    "matches the query %s across series, day, and scripture titles",
    (query, title) => {
      const series = book({
        title,
        days: [
          day(1, {
            title: "The Hidden Invitation",
            scriptureReference: "Psalm 23:4",
          }),
        ],
      });
      expect(filterShelf([series], "all", query)).toEqual([series]);
    },
  );

  it("combines search with the chosen completion filter", () => {
    expect(filterShelf(shelf, "completed", "ordinary")).toEqual([]);
    expect(filterShelf(shelf, "progress", "ordinary")).toEqual([progress]);
    expect(filterShelf(shelf, "all", "no match")).toEqual([]);
    expect(filterShelf([], "all", "")).toEqual([]);
  });

  it("sorts newest first, breaks date ties by ID, and puts invalid dates last", () => {
    const old = book({ id: "old", createdAt: "2026-09-01T12:00:00.000Z" });
    const newestB = book({ id: "b", createdAt: "2026-09-14T12:00:00.000Z" });
    const newestA = book({ id: "a", createdAt: newestB.createdAt });
    const invalid = book({ id: "invalid", createdAt: "invalid" });
    const source = [invalid, newestB, old, newestA];
    expect(filterShelf(source, "all", "").map((item) => item.id)).toEqual([
      "a",
      "b",
      "old",
      "invalid",
    ]);
    expect(source.map((item) => item.id)).toEqual(["invalid", "b", "old", "a"]);
  });
});

describe("bookshelf selection after deletion or filtering", () => {
  const shelf = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("keeps the selected identity after reordering or an earlier deletion", () => {
    expect(resolveShelfSelection([shelf[2], shelf[0], shelf[1]], "b", 1)).toBe(
      2,
    );
    expect(resolveShelfSelection([shelf[1], shelf[2]], "b", 1)).toBe(0);
  });

  it("uses the previous position when the selected book disappears", () => {
    expect(resolveShelfSelection([shelf[0], shelf[2]], "b", 1)).toBe(1);
    expect(resolveShelfSelection([shelf[0], shelf[1]], "c", 2)).toBe(1);
  });

  it("clamps missing or empty selections to a valid presentation index", () => {
    expect(resolveShelfSelection(shelf, null, -1)).toBe(0);
    expect(resolveShelfSelection(shelf, "missing", 99)).toBe(2);
    expect(resolveShelfSelection([], "a", 2)).toBe(0);
  });
});

describe("stable series cover identity", () => {
  it("locks existing version-one ID mappings", () => {
    expect(getSeriesCover("series-alpha")).toEqual({
      variant: 19,
      cloth: "#485A68",
      gold: "#CCAE72",
      paper: "#D3C4A6",
    });
    expect(getSeriesCover("series-beta")).toEqual({
      variant: 15,
      cloth: "#C0B194",
      gold: "#705A32",
      paper: "#D3C4A6",
    });
  });

  it("preserves a cover after title, date, status, or shelf order changes", () => {
    const original = book();
    const revised = book({
      title: "A Changed Title",
      createdAt: "2026-09-14T12:00:00.000Z",
      days: [1, 2, 3].map((number) => day(number, { isRead: true })),
    });
    const before = getSeriesCover(original.id);
    expect(getSeriesCover(revised.id)).toEqual(before);
    expect(
      filterShelf([book({ id: "another" }), revised], "completed", "").map(
        (item) => getSeriesCover(item.id),
      ),
    ).toEqual([before]);
    expect(getSeriesCover("series-beta")).not.toEqual(before);
  });

  it("returns bounded variants and string colors across all twenty families", () => {
    const covers = Array.from({ length: 400 }, (_, index) =>
      getSeriesCover(`series-${index}`),
    );
    expect(new Set(covers.map((cover) => cover.variant)).size).toBe(20);
    for (const cover of covers) {
      expect(Number.isInteger(cover.variant)).toBe(true);
      expect(cover.variant).toBeGreaterThanOrEqual(0);
      expect(cover.variant).toBeLessThan(20);
      expect(cover.cloth).toMatch(/^#[0-9A-F]{6}$/);
      expect(cover.gold).toMatch(/^#[0-9A-F]{6}$/);
      expect(cover.paper).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
