---
schemaVersion: 1
name: Unfold
status: ratified-record
ratifiedBy: "Nick, 2026-09-28"
recordedFrom: "origin/main b2be53a42e50, 2026-09-23. The source files are unchanged at f9d8549c8, 2026-09-28."
sources:
  "src/constants/colors.ts": "819f805114f8"
  "src/constants/fonts.ts": "80d63c40aee2"
  "src/constants/typography.ts": "91188f16545c"
  "src/constants/spacing.ts": "0694a77c1486"
  "src/constants/radius.ts": "dfdccd63790d"
  "src/constants/shadows.ts": "1f033ec2ba4b"
  "src/lib/store.ts": "0ff5165473dd"
  "tailwind.config.js": "4f435e17c88a"
  ".impeccable.md": "f3820e111040"
colors:
  dark:
    background: "#0A0A0A"
    backgroundElevated: "#141210"
    text: "#F5F0EB"
    accent: "#C8A55C"
    contrastText: "#0A0A0A"
  light:
    background: "#FAF7F2"
    backgroundElevated: "#FFFFFF"
    text: "#1C1710"
    accent: "#866B2F"
    contrastText: "#FAF7F2"
typography:
  display: "PP Editorial New Light"
  body: "Inter"
  sizes: [12, 14, 16, 18, 20, 24, 30, 36, 48, 60]
spacing:
  scale: [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 48, 64]
radii:
  scale: [0, 8, 10, 12, 14, 16, 20, 24, 999]
---

# Unfold Design Context

> This file records the tokens of `origin/main` as they are. It makes no design change.
> Nick ratified it as a record on 2026-09-28. The named source files remain authoritative.
> Each source value above is the Git blob ID of the file at the recorded commit.

## Overview

Unfold is a React Native app with Expo and NativeWind.
The design context file `.impeccable.md` gives the personality: warm, sacred, and personal.
The interface is a calm editorial devotional companion. It is not a dashboard.

The design principles of `.impeccable.md`:

1. Make Today a daily liturgy, not a dashboard.
2. Lead with scripture, series context, and one clear next action.
3. Use glow, particles, and motion only when they explain state.
4. Treat streaks as rhythm. Keep them secondary to the devotional content.
5. Make the Companion relational and pastoral.
6. Keep copy short, specific, and human.
7. Preserve the bottom navigation and the release-critical flows.

## Color

Source: `src/constants/colors.ts`. The file names itself the single source of truth for colors.

| Token | Dark | Light | Role in the source |
| --- | --- | --- | --- |
| `background` | `#0A0A0A` | `#FAF7F2` | Primary background |
| `backgroundPure` | `#000000` | `#FFFFFF` | Pure background |
| `backgroundElevated` | `#141210` | `#FFFFFF` | Elevated surface |
| `text` | `#F5F0EB` | `#1C1710` | Body copy. 17.49 to 1 dark, 16.66 to 1 light |
| `textMuted` | text at alpha 0.6 | text at alpha 0.68 | Readable meta at 12 to 15 px. 6.56 to 1 dark, 5.94 to 1 light |
| `textSubtle` | text at alpha 0.4 | text at alpha 0.55 | Icons and placeholders only. 3.46 to 1 dark, 3.88 to 1 light |
| `textHint` | text at alpha 0.25 | text at alpha 0.40 | Non-text chrome. 2.04 to 1 dark, 2.52 to 1 light |
| `inputBackground` | text at alpha 0.05 | text at alpha 0.06 | Input fill |
| `inputBackgroundFocused` | text at alpha 0.08 | text at alpha 0.09 | Input fill with focus |
| `buttonBackground` | text at alpha 0.08 | text at alpha 0.10 | Button fill |
| `buttonBackgroundPressed` | text at alpha 0.14 | text at alpha 0.14 | Button fill on press |
| `border` | text at alpha 0.08 | text at alpha 0.10 | Border |
| `borderFocused` | text at alpha 0.18 | text at alpha 0.18 | Border with focus |
| `borderStrong` | text at alpha 0.28 | text at alpha 0.25 | Strong border |
| `glassBackground` | text at alpha 0.12 | white at alpha 0.9 | Glass menu fill |
| `glassBorder` | text at alpha 0.18 | text at alpha 0.08 | Glass menu border |
| `accent` | `#C8A55C` | `#866B2F` | Warm gold, for minimal use. The light value has 4.73 to 1 on cream |
| `contrastText` | `#0A0A0A` | `#FAF7F2` | Ink on accent fills. 8.48 to 1 dark, 4.73 to 1 light |
| `success` | `rgba(74, 222, 128, 0.9)` | `rgba(34, 197, 94, 0.9)` | Status |
| `error` | `rgba(248, 113, 113, 0.9)` | `rgba(204, 25, 38, 0.9)` | Status. The light value has 4.70 to 1 on cream |

The source states each contrast ratio. This record did not measure them again.

### Accent themes

Source: `src/lib/store.ts`, the constant `ACCENT_THEMES`.

| Theme | Dark | Light |
| --- | --- | --- |
| Gold | `#C8A55C` | `#9A7B3C` |
| Ocean | `#5B9BD5` | `#3A6FA0` |
| Rose | `#D4828F` | `#A8596A` |
| Forest | `#6DAF7B` | `#4A8A5A` |
| Lavender | `#9B8EC4` | `#6A5C9E` |
| Ember | `#D4895C` | `#A86840` |
| Slate | `#7796C5` | `#395D93` |

## Typography

Sources: `src/constants/fonts.ts` and `src/constants/typography.ts`.

| Role | Family |
| --- | --- |
| Display and headings | PP Editorial New Light |
| Body and interface | Inter: regular, medium, semibold, bold |
| Reading | Source Serif, Garamond, Lora, Crimson, Merriweather, or Inter. The reader selects one |

The source gives two rules in its comments:

- The display italic uses the regular face. Nick prefers no serif italics.
- The interface uses upright text. Journal marks can use a true italic.

Sizes (`FontSize`): 12, 14, 16, 18, 20, 24, 30, 36, 48, 60.
Line heights (`LineHeight`): tight 1.2, normal 1.5, relaxed 1.7.

| Preset | Family | Size | Line height | Tracking |
| --- | --- | --- | --- | --- |
| `displayLg` | Display | 32 | 38 | -0.15 |
| `displayMd` | Display | 21 | 25 | none |
| `displaySm` | Display | 18 | 22 | none |
| `bodyLg` | Inter regular | 18 | 27 | none |
| `bodyMd` | Inter regular | 16 | 24 | none |
| `bodySm` | Inter regular | 14 | 21 | none |
| `bodyRelaxed` | Inter regular | 16 | 26 | 0 |
| `uiLg` | Inter semibold | 16 | 19 | none |
| `uiMd` | Inter medium | 14 | 17 | none |
| `uiSm` | Inter regular | 12 | 14 | none |
| `caption` | Inter regular | 11 | 17 | none |
| `sectionHeader` | Inter semibold | 20 | 24 | 0 |
| `cardMeta` | Inter regular | 12 | 18 | 0 |
| `onboardingHeadline` | Display | 28 | 37 | -0.15 |

The source gives three rules in its comments:

- `sectionHeader` uses sentence case. It replaces a label with a rule above a content group.
- `cardMeta` sits below the card title.
- `onboardingHeadline` is the one scale for each onboarding question.

## Spacing

Source: `src/constants/spacing.ts`. The base is 8, with half steps.

Scale: 0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 48, 64.

## Radius

Source: `src/constants/radius.ts`.

| Token | Value |
| --- | --- |
| `none` | 0 |
| `sm` | 8 |
| `chip` | 10 |
| `md` | 12 |
| `card` | 14 |
| `lg` | 16 |
| `xl` | 20 |
| `2xl` | 24 |
| `full` | 999 |

## Depth

Source: `src/constants/shadows.ts`. Each shadow is black with an x offset of 0.

| Tier | Offset y | Opacity | Radius | Android elevation |
| --- | --- | --- | --- | --- |
| `sm` | 2 | 0.06 | 10 | 2 |
| `md` | 2 | 0.08 | 10 | 3 |
| `lg` | 4 | 0.12 | 16 | 6 |
| `sheet` | -4 | 0.12 | 20 | 24 |

In the dark theme, a raised surface takes a border in place of a shadow.
The border is 1 px of warm white at alpha 0.09. The tiers `lg` and `sheet` use alpha 0.14.
The function `elevated` applies the correct treatment for the theme.
The source keeps accent glows separate from depth. It names the home hero and the paywall action as examples.

## Motion

The file `src/constants/animations.ts` exists. This record does not cover it.

## Differences between sources

This record states each difference. It does not resolve them.

| Subject | First source | Second source |
| --- | --- | --- |
| Light gold accent | `#866B2F` in `colors.ts` | `#9A7B3C` in `ACCENT_THEMES` |
| Color set | Warm cream text `#F5F0EB` in `colors.ts` | Pure white text `#FFFFFF` in the `unfold` colors of `tailwind.config.js` |
| Hint alpha, dark theme | 0.25 in `colors.ts` | 0.3 in `tailwind.config.js` |
| Font sizes | 12 to 60 in `FontSize` | 10 to 80 in `tailwind.config.js`, with different values at each step |
| Preset sizes | `FontSize` has no step at 11, 21, 28, or 32 | The presets `caption`, `displayMd`, `onboardingHeadline`, and `displayLg` use those sizes |

One search found 544 uses of the `FontSize` and `Typography` constants in `app` and `src`.
The same search found no `className` that uses a Tailwind size or an `unfold` color.
The search used one pattern, so it can miss a use.

## Not defined

- No warning color.
- No ordered shade ramp for a color. The text tiers are alpha steps of one base color.
- No token for a maximum width.
