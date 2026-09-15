import React from "react";
import renderer, { act } from "react-test-renderer";
import { getSeriesCover } from "@/lib/series-cover";
import { SeriesBookCover } from "../SeriesBookCover";

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: "LinearGradient",
}));

jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: "Svg",
  Circle: "Circle",
  G: "G",
  Path: "Path",
  Rect: "Rect",
}));

interface Point {
  x: number;
  y: number;
}

interface ParsedSubpath {
  closed: boolean;
  points: Point[];
}

function idForVariant(variant: number) {
  for (let index = 0; index < 1_000; index += 1) {
    const id = `geometry-${index}`;
    if (getSeriesCover(id).variant === variant) return id;
  }
  throw new Error(`No fixture ID found for cover variant ${variant}`);
}

function renderedBorderPaths(variant: number) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SeriesBookCover
        devotional={{
          id: idForVariant(variant),
          title: "Ordinary Hours",
          createdAt: "2026-09-15T00:00:00.000Z",
          seriesStartDate: "2026-09-15T00:00:00.000Z",
        }}
        width={200}
        height={280}
        showTitle={false}
      />,
    );
  });

  const paths = tree.root
    .findAll((node) => typeof node.props.d === "string")
    .map((node) => node.props.d)
    .filter((path): path is string => typeof path === "string");

  act(() => tree.unmount());
  return paths;
}

function parseSubpaths(path: string): ParsedSubpath[] {
  return path
    .split(/(?=M)/)
    .filter(Boolean)
    .map((subpath) => {
      const points = Array.from(
        subpath.matchAll(
          /[ML](-?(?:\d+(?:\.\d+)?|\.\d+))\s+(-?(?:\d+(?:\.\d+)?|\.\d+))/g,
        ),
        (match) => ({ x: Number(match[1]), y: Number(match[2]) }),
      );
      const residue = subpath
        .replace(
          /[ML]-?(?:\d+(?:\.\d+)?|\.\d+)\s+-?(?:\d+(?:\.\d+)?|\.\d+)/g,
          "",
        )
        .replace(/[Z\s]/g, "");
      if (residue !== "" || points.length === 0) {
        throw new Error(`Malformed border path: ${subpath.slice(0, 80)}`);
      }
      return { closed: subpath.trimEnd().endsWith("Z"), points };
    });
}

function distance(first: Point, second: Point) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function allPoints(paths: string[]) {
  return paths.flatMap((path) =>
    parseSubpaths(path).flatMap((subpath) => subpath.points),
  );
}

describe.each([
  { variant: 10, layers: 1 },
  { variant: 12, layers: 2 },
  { variant: 15, layers: 3 },
])("book cover border variant $variant", ({ variant, layers }) => {
  it("stays continuous and keeps its intended layer count", () => {
    const paths = renderedBorderPaths(variant);
    expect(paths).toHaveLength(layers);

    for (const path of paths) {
      const subpaths = parseSubpaths(path);
      for (const subpath of subpaths) {
        expect(subpath.points.length).toBeGreaterThan(20);
        for (let index = 1; index < subpath.points.length; index += 1) {
          expect(
            distance(subpath.points[index - 1], subpath.points[index]),
          ).toBeLessThan(2.6);
        }
        if (subpath.closed) {
          expect(distance(subpath.points[0], subpath.points.at(-1)!)).toBeLessThan(
            0.002,
          );
        }
      }

      if (variant !== 10) {
        const breaks = subpaths.map((subpath, index) =>
          distance(
            subpath.points.at(-1)!,
            subpaths[(index + 1) % subpaths.length].points[0],
          ),
        );
        expect(breaks.filter((gap) => gap > 0.002)).toHaveLength(1);
        expect(Math.max(...breaks)).toBeGreaterThan(40);
      }
    }
  });

  it("is vertically symmetric and remains inside the cover", () => {
    const points = allPoints(renderedBorderPaths(variant));

    for (const point of points) {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(200);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(280);
    }

    const maximumMirrorError = Math.max(
      ...points.map((point) =>
        Math.min(
          ...points.map((candidate) =>
            distance({ x: 200 - point.x, y: point.y }, candidate),
          ),
        ),
      ),
    );
    expect(maximumMirrorError).toBeLessThan(0.05);
  });

  it("leaves a centered opening for the bottom imprint", () => {
    const bottomPoints = allPoints(renderedBorderPaths(variant)).filter(
      (point) => point.y >= 250,
    );
    const leftEdge = Math.max(
      ...bottomPoints.filter((point) => point.x < 100).map((point) => point.x),
    );
    const rightEdge = Math.min(
      ...bottomPoints.filter((point) => point.x > 100).map((point) => point.x),
    );

    expect(bottomPoints.length).toBeGreaterThan(0);
    expect(rightEdge - leftEdge).toBeGreaterThan(40);
    expect(rightEdge - leftEdge).toBeLessThan(100);
    expect((leftEdge + rightEdge) / 2).toBeCloseTo(100, 2);
    expect(bottomPoints.some((point) => Math.abs(point.x - 100) < 20)).toBe(
      false,
    );
  });
});
