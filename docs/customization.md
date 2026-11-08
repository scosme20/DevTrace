# Customization

Every DevTrace card can be restyled from its JSON file, without touching any code. The same
options work in `data/startup.json` and in `data/ai-engineering.json`, inside `settings`.

```json
{
  "settings": {
    "theme": "MIDNIGHT",
    "layout": "COMPACT",
    "colors": { "primary": "#ff79c6" },
    "typography": { "fontFamily": "MONOSPACE", "fontWeight": 500 },
    "dimensions": { "width": 520, "radius": 6 },
    "showDescriptions": true,
    "showFooter": false
  }
}
```

Nothing is required. Every option is optional, and a configuration that does not mention any of
them renders exactly as it did in version 0.4.0.

## Themes

`settings.theme` selects a predefined look. The default is `DARK`.

| Theme         | Character                                                                   | Corner radius |
| ------------- | --------------------------------------------------------------------------- | ------------- |
| `DARK`        | GitHub's dark look: near-black, blue accent. Unchanged since 0.2.0.         | 10            |
| `LIGHT`       | GitHub's light look: white, blue accent. Unchanged since 0.2.0.             | 10            |
| `MIDNIGHT`    | Deep navy with a periwinkle accent and softer corners.                      | 12            |
| `MINIMAL`     | Black on white, tiles outlined instead of filled, nearly square corners.    | 4             |
| `TRANSPARENT` | No background at all, so the card takes on the color of the page behind it. | 10            |
| `TERMINAL`    | Pure black, cyan titles, green bars and mono numbers. See below.            | 8             |

All colors below are the theme defaults.

| Token           | DARK      | LIGHT     | MIDNIGHT  | MINIMAL   | TRANSPARENT | TERMINAL  |
| --------------- | --------- | --------- | --------- | --------- | ----------- | --------- |
| `background`    | `#0d1117` | `#ffffff` | `#0b1020` | `#ffffff` | none        | `#000000` |
| `surface`       | `#161b22` | `#f6f8fa` | `#131a33` | none      | none        | `#050607` |
| `border`        | `#30363d` | `#d0d7de` | `#263057` | `#d4d4d4` | `#8a8a8a`   | `#33373d` |
| `text`          | `#f0f6fc` | `#1f2328` | `#eef1ff` | `#111111` | `#797979`   | `#ffffff` |
| `secondaryText` | `#c9d1d9` | `#3d444d` | `#c3caea` | `#404040` | `#797979`   | `#d3d7dc` |
| `mutedText`     | `#8b949e` | `#59636e` | `#8d97c4` | `#6b6b6b` | `#797979`   | `#9ba1a8` |
| `primary`       | `#58a6ff` | `#0969da` | `#8ea2ff` | `#111111` | `#3b82f6`   | `#1ed3f5` |
| `success`       | `#3fb950` | `#1a7f37` | `#5ee0a0` | `#2e7d32` | `#2ea043`   | `#19e56b` |
| `warning`       | `#d29922` | `#9a6700` | `#f2c35b` | `#8a6100` | `#bf8700`   | `#ffcc1a` |
| `error`         | `#f85149` | `#cf222e` | `#ff7a90` | `#b42318` | `#e5534b`   | `#ff5a52` |

`surface` is the fill of the summary tiles. `primary` is the accent: the logo mark, the bars and
the group headings. `success` and `warning` color the operational status (`ACTIVE`, `PAUSED`);
`INACTIVE` uses `mutedText`. `error` is part of the palette and can be customized, but no card
element uses it yet.

### The TERMINAL look

`TERMINAL` changes more than colors, and only in the dashboards. A panel title is drawn in the accent
color in title case, with the part after the dot of a title as a quiet line under it; the source of the
panel's data is a pill with a dot (`OBSERVED`, `DECLARED`); bars are green by default; and numbers use
a monospace face. The other themes keep their quiet look. Colors can still be overridden one by one,
so setting `colors.primary` changes the accent of the titles and the tiles.

### Contrast

`DARK`, `LIGHT`, `MIDNIGHT`, `MINIMAL` and `TERMINAL` reach at least 4.5:1 (WCAG AA) for all three text
colors on their background and surface, and at least 3:1 for the accents. A test enforces it.

`TRANSPARENT` cannot know what is behind it, and no single color can be read at 4.5:1 on both a
white page and a dark one. Its text is the mid gray with the best worst case: about 4.35:1 on white
and on GitHub's dark background, and the accents and status colors reach at least 3:1 on both. It
is readable everywhere but not AA-strong everywhere. If contrast matters more than adapting to the
page, use `DARK` or `LIGHT` and pick the right one with a `<picture>` element in your README.

## Precedence

From the lowest priority to the highest:

1. **The theme** sets every color and the corner radius.
2. **The layout** sets the width, padding, spacing, type sizes and the geometry of the card.
3. **Explicit `colors`, `typography` and `dimensions`** replace the matching values, one at a
   time.
4. **A command line option** (`--theme`, `--layout`) replaces the setting of the same name in the
   file.

Example: with `"theme": "MINIMAL", "layout": "COMPACT", "dimensions": { "width": 700 }`, the card
is 700 px wide (`dimensions`), padded 20 px (the `COMPACT` layout) and has a 4 px corner radius
(the `MINIMAL` theme).

## Custom colors

`settings.colors` replaces individual colors of the theme. Colors you do not mention keep the
theme's value.

| Key             | Used for                                            | Accepts                          |
| --------------- | --------------------------------------------------- | -------------------------------- |
| `background`    | The card                                            | `#RGB`, `#RRGGBB`, `transparent` |
| `surface`       | The summary tiles                                   | `#RGB`, `#RRGGBB`, `transparent` |
| `border`        | Card, tile and divider outlines                     | `#RGB`, `#RRGGBB`                |
| `text`          | Titles, names and numbers                           | `#RGB`, `#RRGGBB`                |
| `secondaryText` | Body text: stages, categories, lifecycle labels     | `#RGB`, `#RRGGBB`                |
| `mutedText`     | Headings, details, the footer and the profile label | `#RGB`, `#RRGGBB`                |
| `primary`       | Logo mark, bars and group headings                  | `#RGB`, `#RRGGBB`                |
| `success`       | Active status                                       | `#RGB`, `#RRGGBB`                |
| `warning`       | Paused status                                       | `#RGB`, `#RRGGBB`                |
| `error`         | Reserved                                            | `#RGB`, `#RRGGBB`                |

Only hexadecimal colors are accepted (and `transparent` for `background` and `surface`). Names
such as `red`, functions such as `rgb()` and `url()`, and anything else are rejected with an
error that names the field, so a color can never put markup or a reference in the SVG. Colors are
written lowercase as `#rrggbb`.

- The empty part of a bar is not configurable. It keeps the theme's value, and is derived (halfway
  between the surface and the border) as soon as you change `background`, `surface` or `border`.
- `"background": "transparent"` turns any theme transparent. Together with a light `text` color
  it suits a dark README, and the reverse for a light one.
- DevTrace does not reject low-contrast combinations, because they are your choice, but it prints
  a warning, for example
  `Low contrast: text #10161d on background #0d1117 is 1.1:1 (4.5:1 is recommended).` It asks for
  4.5:1 from the three text colors and 3:1 from `primary`, `success`, `warning` and `error`, on the
  background and on the surface. A transparent background is not checked.

## Typography

`settings.typography`:

| Key          | Values                                       | Meaning                                       |
| ------------ | -------------------------------------------- | --------------------------------------------- |
| `fontFamily` | `SYSTEM`, `SANS_SERIF`, `SERIF`, `MONOSPACE` | The font stack of the whole card              |
| `titleSize`  | 14 to 32                                     | The card title. The summary numbers follow it |
| `bodySize`   | 10 to 18                                     | Names, lifecycle labels and counts            |
| `labelSize`  | 9 to 16                                      | Secondary columns, tile labels, group names   |
| `fontWeight` | 400, 500, 600, 700                           | Weight of names and headings                  |

`fontFamily` selects a named stack of fonts that exist on virtually every system. Arbitrary font
names are not accepted, and neither are remote fonts: an image embedded in a README cannot load
them, and a missing font would change the layout.

| Value        | Stack                                                             |
| ------------ | ----------------------------------------------------------------- |
| `SYSTEM`     | `-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif`         |
| `SANS_SERIF` | `Helvetica, Arial, sans-serif`                                    |
| `SERIF`      | `Georgia, 'Times New Roman', serif`                               |
| `MONOSPACE`  | `'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace` |

The default sizes depend on the layout: 20 / 13 / 12 for `DEFAULT`, 16 / 12 / 11 for `COMPACT`
and 24 / 14 / 13 for `EXPANDED` (title / body / label). Other sizes are derived: section headings,
detail lines and the footer are one point smaller than `labelSize`, and the summary numbers are
1.4 times `titleSize`. The title and the numbers are one weight step bolder than `fontWeight`
(600 gives 700, 700 gives 800). The default weight is 600.

## Layouts

`settings.layout` is `COMPACT`, `DEFAULT` (the default) or `EXPANDED`. A layout changes how the
information is organized and how dense it is, not only its size.

| Aspect          | `COMPACT`                            | `DEFAULT`                      | `EXPANDED`   |
| --------------- | ------------------------------------ | ------------------------------ | ------------ |
| Header          | One line: logo, title, profile label | Brand line, then a large title | Same, larger |
| Summary         | Number and label side by side        | Number above its label         | Same, taller |
| Width / padding | 480 / 20                             | 560 / 28                       | 640 / 32     |
| Section spacing | 16                                   | 24                             | 32           |
| Rows            | Tight                                | Standard                       | Airy         |
| Bars            | Thin                                 | Standard                       | Thick        |

The information is the same in every layout. `DEFAULT` is the look of every earlier version.

## Dimensions

`settings.dimensions`:

| Key       | Range     | Meaning                                                     |
| --------- | --------- | ----------------------------------------------------------- |
| `width`   | 360 – 960 | Width of the card in pixels. Default from the layout        |
| `padding` | 12 – 48   | Space between the edge and the content. Default from layout |
| `spacing` | 8 – 48    | Vertical space between sections. Default from the layout    |
| `radius`  | 0 – 24    | Corner radius of the card. Default from the theme           |

There is no `height`: it is always computed from the content, so a card is never cut off or
padded with empty space. `width`, `height` and `viewBox` are always consistent.

Width and padding together must leave at least 280 px for the content. A combination that does not,
such as a width of 360 with a padding of 48, fails with
`Dimensions leave only 264px of content (width 360 minus padding 48 on each side). At least 280px is
needed: increase the width or reduce the padding.` and no file is written.

### Text always fits

SVG cannot measure text, so DevTrace estimates the width of every piece of text for the configured
font and shortens it with `…` when it would not fit the space between its neighbors. Long names
never run into the next column or past the edge of the card, at any width, padding, font or size.
The summary tiles wrap into a grid (two rows of two, or a single column) when they would get too
narrow. The estimate leans wide, so text is shortened a little early rather than late.

## Display options

The options that already existed keep their meaning (see the README):

- Startup: `showProjectList`, `showLifecycleDistribution`, `showLinks`, and the dashboard options
  (see [Startup & SaaS Dashboard](startup-dashboard.md)).
- AI engineering: `showTools`, `showModels`, `showSkills`, `showProjects`, `showActivity`,
  `showTokenUsage`, `showCost`, `showLinks`, and `dashboard` (see
  [AI Engineering Dashboard](ai-engineering-dashboard.md)).

Four options are shared by every card. They are optional and have no stored default:

| Option             | Default | Effect when changed                                                         |
| ------------------ | ------- | --------------------------------------------------------------------------- |
| `showTitle`        | `true`  | `false` hides the header: logo, title and profile label                     |
| `showSummary`      | `true`  | `false` hides the row of summary tiles                                      |
| `showDescriptions` | `false` | `true` shows the description of each public project (and AI skill) under it |
| `showFooter`       | `true`  | `false` hides the "Generated by DevTrace" line                              |

The image keeps its accessible `<title>` and `<desc>` even when the visible header is hidden. If
everything is hidden, the card says `Nothing to display.`

`showDescriptions` is off by default because descriptions can be long and are not needed to read the
card. Only descriptions of **public** entities can ever appear, as for everything else.

## Command line

`pnpm generate:startup` and `pnpm generate:ai` accept options that replace the file's setting for
that run (they do not change the file):

```bash
pnpm generate:startup --theme MIDNIGHT --layout COMPACT --output preview.svg
pnpm generate:ai --theme=LIGHT
```

| Option              | Meaning                                                                          |
| ------------------- | -------------------------------------------------------------------------------- |
| `--theme <THEME>`   | One of the five themes, in any letter case                                       |
| `--layout <LAYOUT>` | `COMPACT`, `DEFAULT` or `EXPANDED`, in any letter case                           |
| `--output <file>`   | A file name, or a path inside `public/indicators/`. Kebab-case, ending in `.svg` |

`--output` makes it easy to compare looks without overwriting the card you publish. It cannot
point outside `public/indicators/`. `--theme`, `--layout` and `--output` do not apply to
`pnpm sync:github`.

## Complete examples

### Startup & SaaS Statistics

```json
{
  "version": 1,
  "profile": { "displayName": "Jane's Products" },
  "settings": {
    "theme": "MIDNIGHT",
    "layout": "EXPANDED",
    "colors": {
      "primary": "#ff79c6",
      "success": "#50fa7b"
    },
    "typography": {
      "fontFamily": "SANS_SERIF",
      "titleSize": 26,
      "bodySize": 14,
      "labelSize": 13,
      "fontWeight": 600
    },
    "dimensions": {
      "width": 680,
      "padding": 36,
      "spacing": 28,
      "radius": 14
    },
    "showTitle": true,
    "showSummary": true,
    "showDescriptions": true,
    "showFooter": true,
    "showProjectList": true,
    "showLifecycleDistribution": true,
    "showLinks": true
  },
  "projects": [
    {
      "id": "my-app",
      "name": "My App",
      "description": "A tool that does one thing well.",
      "category": "SaaS",
      "lifecycleStage": "MVP",
      "status": "ACTIVE",
      "visibility": "PUBLIC",
      "dataSource": "DECLARED",
      "createdAt": "2026-01-01",
      "updatedAt": "2026-02-01"
    }
  ]
}
```

### AI Engineering Statistics

```json
{
  "version": 1,
  "profile": { "displayName": "Jane's AI Work" },
  "settings": {
    "theme": "TRANSPARENT",
    "layout": "COMPACT",
    "colors": { "primary": "#8957e5" },
    "typography": { "fontFamily": "SYSTEM", "fontWeight": 500 },
    "dimensions": { "width": 520, "radius": 8 },
    "showTitle": true,
    "showSummary": true,
    "showDescriptions": false,
    "showFooter": false,
    "showTools": true,
    "showModels": true,
    "showSkills": true,
    "showProjects": true,
    "showActivity": false,
    "showTokenUsage": false,
    "showCost": false,
    "showLinks": true
  },
  "tools": [],
  "models": [],
  "skills": [],
  "projects": []
}
```

### A dark page with a custom palette

```json
{
  "settings": {
    "theme": "DARK",
    "colors": {
      "background": "#1e1e2e",
      "surface": "#313244",
      "border": "#45475a",
      "text": "#cdd6f4",
      "secondaryText": "#bac2de",
      "mutedText": "#a6adc8",
      "primary": "#f5c2e7"
    }
  }
}
```

## Compatibility with earlier configurations

- Configurations written for 0.2.0 to 0.4.0 are valid as they are, and keep rendering the same
  SVG. A test compares the output with files produced by 0.4.0, byte for byte.
- Appearance options are never added to a configuration that does not use them, and an option you
  leave out is simply not set: the theme, the layout and the display options fall back to the
  defaults described above.
- The only options that existed before, `theme` (`DARK` or `LIGHT`) and the `show...` options,
  work as they always did. The theme list only grew.
- Invalid values are errors, never silently corrected: an unknown theme, a color such as `red`, a
  size out of range or an unknown field stops the generation, names the field and writes nothing.

## Limitations

- Fonts are limited to four system stacks. How a stack looks depends on the fonts installed on the
  reader's system, and the width of text is estimated, not measured.
- `TRANSPARENT` trades contrast for adapting to any page: see [Contrast](#contrast).
- Colors are solid hexadecimal values: no alpha channel, gradients or patterns.
- There is no per-section styling and no custom layout beyond the three provided.
- Cards have a computed height and are not paginated: a very long list makes a tall card.
