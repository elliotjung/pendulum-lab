# Pendulum Lab design system

The simulator and landing page share one visual language: a restrained scientific workstation with dense, legible controls and a small set of semantic signals. The simulator implementation lives in `css/00-base.css` (tokens and structural defaults) and `css/03-instrument-workbench.css` (components). `css/10-porcelain-daylight.css` remaps the same tokens for the optional system-light scheme.

## Shared palette

| Role | Simulator token | Landing-page counterpart | Dark value |
| --- | --- | --- | --- |
| Application background | `--workbench-bg` / `--bg` | `--color-bg` | `#070910` |
| Raised chrome | `--workbench-raised` / `--raised` | `--color-raised` | `#0b0e17` |
| Panel | `--workbench-panel` / `--panel` | `--color-panel` | `#10141f` |
| Elevated panel | `--workbench-elevated` / `--panel-elevated` | `--color-elevated` | `#151a28` |
| Control | `--workbench-control` / `--control` | `--color-control` | `#181d2b` |
| Hover | `--workbench-hover` / `--control-hover` | `--color-hover` | `#1d2332` |
| Selected | `--workbench-selected` / `--selected` | `--color-selected` | `#242a3d` |
| Primary text | `--workbench-text` / `--fg-bright` | `--color-text` | `#f1f3f8` |
| Secondary text | `--workbench-text-secondary` / `--text` | `--color-text-secondary` | `#a8b0c2` |
| Muted text | `--workbench-text-muted` / `--muted` | `--color-text-muted` | `#7f899e` |
| Primary action | `--workbench-primary` / `--primary` | `--color-primary` | `#8b7cf6` |
| Live signal | `--workbench-live` / `--live` | `--color-live` | `#72d6e5` |
| Success | `--workbench-green` / `--green` | `--color-success` | `#58c99b` |
| Caution | `--workbench-amber` / `--orange` | `--color-warning` | `#e0ae68` |
| Fault | `--workbench-red` / `--red` | `--color-danger` | `#ef6f7d` |
| Information | `--workbench-info` / `--info` | `--color-info` | `#7ca8f6` |

Default borders are `rgba(205, 214, 245, 0.08)`, strong dividers are `rgba(205, 214, 245, 0.14)`, and selected controls use `rgba(139, 124, 246, 0.55)`. The landing page may expose different custom-property names, but it should preserve these roles and values so entering the simulator feels continuous.

## Shape, type, and motion

- Use 5 px for controls and compact badges, 8 px for ordinary panels, and 12 px for large drawers or modal surfaces.
- Use the operating system sans-serif stack for interface copy. Reserve the mono stack for measurements, parameter values, identifiers, keyboard hints, and reproducibility metadata.
- Use 120 ms for direct control feedback, 180 ms for ordinary state changes, and 260 ms for large surface transitions, all with `cubic-bezier(.2,.8,.2,1)`.
- Do not use glow, gradient borders, ambient particles, cursor-following light, heavy blur, or looping decoration. Color communicates state rather than spectacle.
- Avoid all-caps and wide letter spacing except where scientific notation or an external standard requires the original casing.

## Component correspondence

The landing page's navigation, proof cards, CTA controls, and simulator preview should map to the same component DNA as the simulator's rail, result cards, primary buttons, and canvas bezel:

| Landing surface | Simulator surface | Shared behavior |
| --- | --- | --- |
| Navigation/header | Rail and app header | Raised background, hairline separation, quiet selected state |
| Primary CTA | `button.primary` | Indigo fill, high-contrast label, no glow |
| Evidence/proof card | Result and validation cards | Panel background, status color only on the decisive datum |
| Product preview | `.main-wrap` canvas bezel | 12 px outer radius, 8 px inner frame, neutral border |
| Feature controls | Preset and accordion controls | Compact density, 5 px radius, clear hover/selected states |

## Accessibility and performance contracts

`css/09-accessibility-themes.css` owns print behavior and `css/11-ui-hardening.css` remains last in the cascade for zoom, touch, reduced-motion, reduced-transparency, high-contrast, and forced-color environments. Every state must remain identifiable without relying on animation or hue alone. Visual code must not add a perpetual `requestAnimationFrame`, polling interval, or decorative canvas; the simulation and scientific plots own the runtime render budget.
