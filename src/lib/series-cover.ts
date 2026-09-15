/** Version 1 cover identity. Keep this salt and palette order stable. */
const COVER_IDENTITY_VERSION = "unfold-series-cover-v1:";

const CLOTH = [
  "#414832",
  "#B8AA8D",
  "#393934",
  "#88553E",
  "#293D49",
  "#573C43",
  "#465461",
  "#8A682D",
  "#3D4935",
  "#B1A58D",
  "#3F403A",
  "#86563E",
  "#2E4654",
  "#543A43",
  "#414B34",
  "#C0B194",
  "#384832",
  "#3A3935",
  "#896C36",
  "#485A68",
] as const;

export interface SeriesCover {
  /** Zero-based index into the twenty accepted ornament families. */
  variant: number;
  cloth: string;
  gold: string;
  paper: string;
}

/** FNV-1a over immutable identity. Titles, dates, and shelf order do not participate. */
export function getSeriesCover(id: string): SeriesCover {
  const identity = COVER_IDENTITY_VERSION + id;
  let hash = 0x811c9dc5;
  for (let index = 0; index < identity.length; index += 1) {
    hash = Math.imul(hash ^ identity.charCodeAt(index), 0x01000193) >>> 0;
  }
  const variant = hash % CLOTH.length;
  return {
    variant,
    cloth: CLOTH[variant],
    gold: [1, 9, 15].includes(variant) ? "#705A32" : "#CCAE72",
    paper: "#D3C4A6",
  };
}
