import type { Section } from "../templates/card.js";
import type { DesignTokens } from "../templates/design-tokens.js";
import { place, type Builder } from "./fragment.js";

export * from "./charts.js";
export * from "./fragment.js";
export * from "./layout.js";
export * from "./lists.js";
export * from "./metrics.js";

/**
 * Turns a composed component into a card section, so a dashboard is built with
 * `composeCard`: it supplies the header, the footer, the frame and the theme.
 * The content is built for `tokens.box.contentWidth`.
 */
export function dashboardSection(content: Builder, tokens: DesignTokens): Section {
  const fragment = content(tokens.box.contentWidth);
  return { body: place(fragment, tokens.box.padding, 0), height: fragment.height };
}
