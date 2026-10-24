---
name: FinTrack
description: Calm, precise investment workspaces with a stable indigo identity.
colors:
  primary: "oklch(68% .15 265)"
  on-primary: "oklch(15% .015 265)"
  background: "oklch(17% .012 255)"
  panel: "oklch(21% .014 255)"
  raised: "oklch(25% .016 255)"
  overlay: "oklch(28% .016 255)"
  ink: "oklch(95% .008 255)"
  secondary: "oklch(77% .016 255)"
  muted: "oklch(69% .018 255)"
  line: "oklch(35% .016 255)"
  gain: "oklch(80% .14 160)"
  loss: "oklch(79% .12 24)"
  warning: "oklch(82% .13 87)"
  info: "oklch(79% .1 250)"
  light-primary: "oklch(43% .15 265)"
  light-on-primary: "oklch(99% .005 255)"
  light-background: "oklch(96% .008 255)"
  light-panel: "oklch(99% .003 255)"
  light-raised: "oklch(93% .012 255)"
  light-overlay: "oklch(100% 0 0)"
  light-ink: "oklch(24% .023 255)"
  light-secondary: "oklch(40% .025 255)"
  light-muted: "oklch(47% .023 255)"
  light-line: "oklch(80% .016 255)"
  light-gain: "oklch(41% .10 160)"
  light-loss: "oklch(44% .15 24)"
  light-warning: "oklch(43% .09 75)"
  light-info: "oklch(43% .11 250)"
typography:
  display:
    fontFamily: "Anuphan, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Anuphan, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0em"
  title:
    fontFamily: "Anuphan, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Anuphan, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Anuphan, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.333333
rounded:
  control: ".625rem"
  panel: "1rem"
  menu: "12px"
  item: "8px"
spacing:
  space-1: ".25rem"
  space-2: ".5rem"
  space-3: ".75rem"
  space-4: "1rem"
  space-5: "1.5rem"
  space-6: "2rem"
  space-7: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
    padding: ".625rem 1rem"
    typography: "{typography.body}"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: ".625rem 1rem"
  button-icon:
    textColor: "{colors.secondary}"
    rounded: "{rounded.control}"
    width: "40px"
    height: "40px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
  nav-item:
    textColor: "{colors.primary}"
    rounded: "{rounded.menu}"
    padding: "12px 15px"
    height: "44px"
---

# Design System: FinTrack

## Overview

**Creative North Star: "Private-bank / modern-fintech"**

FinTrack uses the user's private-bank/modern-fintech direction: calm ink surfaces, precise financial typography and one indigo brand accent. A separately defined light palette uses pale mineral surfaces and dark ink. The FinTrack / Premium wordmark is part of the requested identity.

Panels are restrained and functional. Tonal layering separates information; stronger elevation identifies overlays. Route identity is a faint atmospheric cue, while the brand, focus and financial semantics remain stable.

**Key Characteristics:**

- One indigo brand accent in both themes.
- Anuphan for Thai and English, with tabular financial figures.
- Compact desktop navigation that expands over content.
- Subtle route continuity and reduced-motion alternatives.

Source-derived on 2026-10-25 from `src/styles/tokens.css`, `src/index.css`, the root/app layouts, Sidebar, TopBar, BottomNav, Modal, InterfaceProvider, InterfaceControls, Dashboard and Bucket. Current rendered verification is pending; these documents do not certify contrast, layout or interaction behavior. The before captures do not verify this implementation.

## Colors

### Primary

**Dashboard indigo** is the single brand accent. The frontmatter resolves the default and light-theme OKLCH values; runtime source is the single `--brand` token, aliased through `--ft-accent`, with `--ft-on-accent` for text on filled actions. Light-prefixed tokens describe the independent `html.light-mode` palette.

### Neutral

Ink, panel, raised and overlay tokens form the dark surface hierarchy. Secondary and muted text remain distinct from borders. In light mode, pale mineral surfaces replace the dark hierarchy with dark ink for content.

### Financial and data semantics

Gain, loss, warning and information tokens communicate meaning. User portfolio and bucket colors remain data identifiers; additional chart series can use information, violet and secondary tones. These are data encodings, not competing brand accents. Destructive or withdrawal semantics may use loss.

**The Stable Accent Rule.** Actions, active navigation text/icons, focus and primary charts use the brand accent across routes. Page tint is limited to the faint page background; selected indicators use the brand.

**The Financial Meaning Rule.** Gain and loss retain their semantic hue across routes; theme-specific lightness supports legibility. Show a sign, label or directional cue with the color.

Registered `--page-h`, `--page-c` and `--page-l` properties interpolate over 500ms. The shell blends page tint at 5% into a transparent background glow; the active navigation indicator uses the brand at 12% over the panel. Route hues are Dashboard 68, Portfolio 188, Ledger 280, Cash Flow 222, Terminal 307, Trade 115, Bucket 5, and History/Calendar/Settings 255. The brand hue stays 68.

## Typography

Anuphan is loaded for Latin and Thai through Next.js. The root body uses its generated font class; the utility sans stack also includes a BahtFallback glyph face and system fallbacks. Financial figures use tabular lining numerals.

The display role records the larger net-worth state; it steps from 36px to 48px at 640px. Dashboard page headings step from 24px to 30px. Dialog titles use 20px; section titles commonly use 16px. Body text is 14px and recurring labels are 12px. Weight ranges from regular to bold; the global black weight resolves to 700.

English body leading is 1.5. Thai body leading is 1.7 with .015em tracking, and Thai tracking utilities are normalized to .015em. Tight and tighter utility tracking resolve to zero; financial figures use their dedicated number treatment. Do not compress Thai marks to imitate English headings.

## Layout

The desktop shell starts at 1024px. A fixed rail reserves 72px, with 12px horizontal padding and fixed icon positions. It expands to 232px after 80ms hover intent, during focus-within, or when pinned. Pin state persists in local storage. Rail width and labels transition for 180ms; label staggering is capped at 48ms.

**The Constant Rail Rule.** Desktop content always reserves the collapsed rail width. Hover, keyboard focus and pin expansion overlay content without changing that margin.

The top bar has a 76px minimum height. Shared workspace padding is 28px 24px 80px. Main content and grid children use zero minimum widths to allow internal wrapping. Below desktop, a floating five-item bottom navigation respects the safe area; the shell reserves bottom space for it. Below 640px, common buttons and icon controls grow to 44px targets.

Bucket uses `repeat(auto-fit, minmax(min(100%, 280px), 1fr))`, 20px gaps and stretched cards. Long names and amounts use wrapping rather than ellipsis. Its route remains `/budget`; the workspace title is Bucket. Tables retain sticky headers and offer comfortable (14px block padding) and compact (8px) row density.

## Elevation & Depth

Tonal surfaces and one-pixel borders provide ordinary grouping. Shared panels are flat; menus use the overlay shadow, with distinct dark/light values recorded in the sidecar. The expanded rail casts a directional shadow over the content it covers. Dialogs and mobile navigation carry stronger elevation to identify their placement above the workspace.

Route entry uses a short fade and 10px upward settling motion (320ms). Shared navigation pills use a spring with stiffness 400 and damping 34. Theme switching supports a 600ms circular reveal from the toggle when the browser supports view transitions. Reduced motion removes rail and page-tint interpolation, disables chart drawing and uses a short route fade; MotionConfig follows the user's motion preference.

## Shapes

Controls have gently rounded corners, panels are softer, and navigation items use the menu radius. One-pixel strokes separate ordinary surfaces. Fully rounded range chips and compact currency selectors identify grouped choices. Use inline SVG icons; the visual vocabulary does not depend on emoji.

## Components

### Buttons

Primary controls use the brand fill and on-primary text, semibold 14px type, a 42px minimum height and the control radius. Hover increases brightness to 1.08. Secondary controls use panel fill with a line border and raised hover. Icon controls use a square target and raised hover. Focus-visible uses a 2px brand outline offset by 4px; button press moves down 1px.

### Cards / Containers

Shared panels use panel fill, a line border and panel radius. Content padding varies with density: recurring cards use 16px, 20px or 24px. Bucket data colors identify content; its action controls use the same brand as the rest of the app.

### Inputs / Fields

Fields use theme surfaces, line borders, readable foreground and brand-colored carets. Border emphasis accompanies focus, with the shared keyboard focus outline. Existing forms vary between 8px, 12px and 16px corners; there is no single centralized input component to imply otherwise. Coarse-pointer text fields use 16px text and at least 48px height.

### Navigation

The rail retains the FinTrack / Premium wordmark. Active text and icons use the brand accent over the faint page-tinted shared-layout pill. Links expose their current-page state and accessible names while labels are visually collapsed. Mobile navigation carries the same active treatment, 12px labels and safe-area spacing.

### Chips and grouped controls

Chart ranges use rounded choices, a brand-filled selected pill and muted inactive text. Density uses a compact bordered group with a raised selected state. Selected states are exposed with `aria-pressed`; labels remain text rather than color alone.

### Dialogs and interface controls

The shared Modal uses native `dialog.showModal()`, a labelled heading, Escape/backdrop dismissal and an initially focused close button. It is at most 36rem wide, inset 1rem from narrow screens and capped at 90dvh with a scrolling body. Privacy blurs marked amounts and charts; its state is session-persisted. Table density is persisted locally.

## Do's and Don'ts

### Do:

- **Do** use semantic theme tokens for surfaces, text, borders and interactive emphasis.
- **Do** keep currency context, readable Thai text and tabular financial figures.
- **Do** let Bucket names and amounts wrap; use the intrinsic card grid.
- **Do** preserve keyboard focus, native dialog behavior and reduced-motion alternatives.

### Don't:

- **Don't** recolor actions, active navigation text/icons, focus or primary charts by route.
- **Don't** replace the light palette with an inverted dark theme.
- **Don't** use neon glows, casino styling, emoji interface icons or decorative financial charts.
- **Don't** change calculations, routes, financial data or feature behavior as a visual-system update.

