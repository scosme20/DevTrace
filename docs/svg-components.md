# SVG component system

DevTrace indicators are drawn from small, reusable SVG components that live in `src/components/`.
They share one set of design tokens with the existing Startup and AI Engineering cards, so a new
indicator looks like the others in every theme and layout.

The components are an internal building block. They are not a public library API, and no indicator
uses them yet: the two existing indicators are unchanged. Nothing here adds a configuration option.

## Architecture

```text
data  ->  statistics  ->  presentation (components)  ->  SVG string  ->  file
```

- A component receives **finished numbers and labels**. It never counts, filters or ranks: that is
  the job of the statistics code, which already removes private entries before any number exists.
- A component returns a `Fragment`: SVG drawn from (0, 0) plus its width and height. Layout code
  places fragments, so a component never needs to know where on the card it will end up.
- Most components are _builders_: `(width) => Fragment`. A container gives each child the exact
  width of its cell, which makes sizes deterministic and prevents overflow.
- All colors, sizes and distances come from `DesignTokens` (`src/templates/design-tokens.ts`).
  Components accept a `Tone` (`primary`, `success`, `warning`, `error`, `muted`), never a raw color.

## Design tokens

`DesignTokens` was extended with `visual`, derived from the resolved palette, so it follows the theme,
`colors`, `dimensions` and `typography` settings of the card:

| Token                        | Meaning                                                 |
| ---------------------------- | ------------------------------------------------------- |
| `visual.tones`               | Colors for the five tones                               |
| `visual.series`              | Six categorical colors for chart series, in fixed order |
| `visual.heat`                | Five heatmap levels; index 0 is the empty cell          |
| `visual.surfaceSecondary`    | Second surface for nested elements (the theme's track)  |
| `visual.gap`, `panelPadding` | Spacing, derived from the `spacing` dimension           |
| `visual.strokeWidth`         | Stroke width of frames, axes and dividers               |

The existing palette already provides background, surface, border, primary, text, secondary text,
muted text, success, warning and error. No second theme system exists. Shadows and gradients are not
implemented: the five themes are flat, and filters add risk for no benefit.

## Components

Layout (`layout.ts`): `splitWidth`, `row`, `grid`, `stack`, `divider`, `panel`.

- `row` places items side by side with optional weights and vertical alignment. Panels in a row are
  stretched to the same height.
- `grid` places items in reading order in 1, 2, 3 or more columns. A short last line keeps the
  column width.
- `stack` puts items one above the other at full width.
- `panel` is a titled container. With `framed: false` it is a plain section container.
- `splitWidth` divides a width into integers that, with the gaps, add up exactly to the total.

Metrics (`metrics.ts`): `metricCard`, `compactMetric`, `progressBar`, `distributionBar`,
`rankingList`, `statusIndicator`, `badge`, `legend`.

- `progressBar` shows a percentage by default, which covers a percentage indicator.
- `rankingList` shows items in the order given: sort in the statistics code.

Charts (`charts.ts`): `horizontalBarChart`, `verticalBarChart`, `donutChart`, `activityHeatmap`,
`timeline`. `distributionBar` and `donutChart` are the distribution charts.

Behavior shared by every component:

- Empty data renders "No data" instead of an empty box or an error.
- Zero, negative and non-finite values are drawn as nothing, never as a sliver or `NaN`.
- Long text is shortened with an ellipsis to fit its space (the same estimate the cards use).
- Scales start at zero and are linear.

Not implemented: `ProjectList`, `SkillList`, `ToolList`, `ModelList` and `MilestoneCard`. The existing
cards already render these lists from the domain models, so adding component versions now would
duplicate working code.

## Composing a dashboard

`dashboardSection` turns a composed component into a card section, and `composeCard` supplies the
frame, header, footer, title and description:

```ts
import { displayFlags } from "../core/appearance.js";
import { composeCard } from "../templates/card.js";
import { requireDesignTokens } from "../templates/design-tokens.js";
import * as c from "../components/index.js";

const settings = { theme: "MIDNIGHT", layout: "EXPANDED", showSummary: false };
const t = requireDesignTokens(settings);

const content = c.stack({ gap: t.visual.gap }, [
  c.grid({ columns: 3, gap: t.visual.gap }, [
    c.metricCard(t, { label: "Tools", value: 12 }),
    c.metricCard(t, { label: "Models", value: 8, tone: "success" }),
    c.metricCard(t, { label: "Tokens", value: "1.2M", tone: "warning" }),
  ]),
  c.row({ gap: t.visual.gap, weights: [3, 2] }, [
    c.panel(t, { title: "Activity", content: c.activityHeatmap(t, weeks, { legend: true }) }),
    c.panel(t, { title: "Share", content: c.donutChart(t, [{ label: "Agents", value: 5 }]) }),
  ]),
]);

const svg = composeCard({
  title: "My dashboard",
  description: "What this image shows, for screen readers.",
  displayName: "Me",
  generatorVersion: "0.0.0",
  tokens: t,
  display: displayFlags(settings),
  summary: [],
  sections: [c.dashboardSection(content, t)],
});
```

## Safety

- Every text goes through `escapeXml`, so user content is data, never markup.
- Components accept tones and numbers, not colors, URLs or attributes from the user.
- Components emit no scripts, links, images, `foreignObject`, `url()` references or ids. Without
  ids, two cards embedded in one page cannot clash.
- A heatmap, donut or bar chart uses only `rect`, `circle`, `line` and `text`.

## Deterministic output

The same input and settings give the same SVG: there are no random ids, timestamps or iteration over
unordered data, and coordinates are rounded to two decimals. Item order is the order you pass.

## Tests

`tests/components.test.ts` checks, for each component: size, position, empty and zero values, text
that would overflow, escaping, and that nothing leaves its container (`tests/component-geometry.ts`
reads the SVG into absolute boxes). It also composes a dashboard from the Startup statistics in all
five themes and all three layouts.
