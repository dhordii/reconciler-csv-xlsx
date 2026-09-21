# Reconciler UI maintenance guide

Reconciler uses a calm, precise enterprise workflow: upload two sources, select data, match fields, configure rules, review, and inspect results. Preserve the balanced source cards, visible step progression, and clear primary action. Runtime styles in `src/styles.css` are authoritative for implementation values; this guide records the durable design intent.

## Visual foundations

- Use the existing semantic CSS variables. Light mode pairs canvas `#f7f8fb`, white surfaces, ink `#0b1023`, muted text `#616a7b`, borders `#d7dde7`, and accent `#0a4bea`. Dark mode uses canvas `#10141d`, surfaces `#171c27`, ink `#f5f7fb`, muted text `#aeb8c8`, borders `#30394a`, and accent `#7da2ff`. Dark primary buttons retain white text on `#315ecb`.
- Preserve light, dark, and system theme choices. Update semantic tokens consistently in the system-dark and explicit-dark rules; check every state in both palettes.
- Keep Oxygen locally supplied for the wordmark, with `'Segoe UI', sans-serif` fallbacks. The root UI font is `'Segoe UI', Arial, sans-serif`; do not silently replace it with Oxygen throughout the application. The desktop wordmark is 37px/700 with line-height 1 and letter-spacing -0.035em.
- Retain restrained rounding: cards use `--radius-card: 10px`; controls commonly use 8–10px, larger panels 12–14px, and badges or circular indicators use their existing pill/circle shapes.
- Spacing is component-specific, not a single enforced scale. Existing header controls use 10px and 14px gaps; skip-link padding is 10px 14px; profile-select left padding is 16px. Extend nearby patterns instead of introducing another spacing system.

## Layout and components

The wide layout shares a centered header/workflow container capped at 1528px with 144px total horizontal inset. The header is 88px high. Preserve the CSS adaptations at 1101–1671px, 1100px, 780px, and 480px; the supported minimum viewport is 360px. Check narrow layouts at breakpoint boundaries as well as at the minimum width.

Keep upload cards and their validation messages associated with the correct source. Loading, error, warning, disabled, review, and success treatments must represent actual data or workflow state. Use blue for action and selection, and semantic success/warning/danger tokens with readable explanatory text. Reserve room for hints and changing labels so that neighboring controls do not jump. Keep wide data tables scrollable inside their own region rather than widening the page.

Preserve the 44px square icon-button geometry and existing larger form controls. Labels must describe the action; icon-only controls need accessible names. Do not turn necessary controls into decorative indicators or add inactive actions.

## Accessibility and motion

Preserve the skip link and visible keyboard focus: the global focus ring is 3px with a 3px offset and derives from `--focus`. Keep logical keyboard order, native control semantics, associated labels, and understandable validation. State must remain understandable without color alone. Check WCAG contrast and focus visibility in both themes; this guide is a preservation requirement, not an accessibility certification.

Workflow entry uses a restrained 240ms vertical reveal from 10px with `cubic-bezier(0.22, 1, 0.36, 1)`. Honor the existing `prefers-reduced-motion: reduce` override. Do not animate dimensions or move neighboring controls when conditional content appears.

## Verification when changing the UI

Inspect upload, loaded, processing, error/recovery, mapping/rules, review, and results states. Verify keyboard focus, reduced motion, light/dark/system themes, long filenames and labels, and 360px/mobile/tablet/desktop widths. Confirm that previews, counters, and exports match actual data. Build-state review records provide historical visual evidence; rerun relevant checks after changes rather than treating the recorded ship disposition as a current test result.
