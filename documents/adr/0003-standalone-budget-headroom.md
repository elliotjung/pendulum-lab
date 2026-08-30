# ADR 0003: Standalone budget headroom exception and ratchet

- Status: Accepted
- Scope: the portable `file://` release artifact for the 10.36 release line
- Decision owner: repository maintainer
- Review trigger: any standalone raw/gzip budget increase or a move below the 85% target

## Context

The standalone build is intentionally a self-contained offline application. It
contains the application JavaScript and CSS in one HTML file and ships worker
fallback files beside it. At the audited baseline, raw and gzip use more than
85% of their ceilings. Raising the ceilings without attribution would hide
growth; removing advanced panels only from the offline build would make the
standalone and hosted products behave differently.

The preferred outcome remains raw and gzip usage at or below 85%. That outcome
is not claimed for the current release line.

## Decision

The current exception is bounded to these ceilings:

| Metric | Accepted ceiling |
| --- | ---: |
| Standalone HTML raw | 1,484,800 bytes |
| Standalone HTML gzip | 445,440 bytes |
| Standalone HTML Brotli | 368,640 bytes |

`scripts/bundle-budget.ts` must fail above those ceilings. When raw or gzip is
above 85%, it must also require this accepted ADR and a complete
`reports/standalone-byte-attribution.json` whose artifact hash and byte count
match the exact HTML being gated. The attribution report separates exact HTML
payload classes and provides a same-source modular-build role proxy so the next
optimization starts with measured contributors.

### 2026-08-28 gzip ratchet record

The prior gzip ceiling was 440,320 bytes (430 KiB). After implementing exact
scientific entry, the reference → perturbation → ensemble progression,
versioned experiment sharing, and bilingual question-first guidance, the
feature-complete candidate reached **1,487,066 raw bytes**, **446,894 gzip
bytes**, and **347,839 Brotli bytes**, above the accepted raw and gzip ceilings.
Shared exact-state reading, canonical-control deduplication, stronger Oxc
compression, and artifact-only removal of HTML whitespace and CSS fallbacks
made redundant by unconditional root tokens reduced the release artifact to
**1,470,285 raw bytes**, **444,657 gzip bytes**, and **346,700 Brotli bytes**.
It exceeds the prior gzip ceiling by 4,337 bytes.

Before this change, the portable build removed Vite's unused preload loader,
compacted the generated HTML shell without changing executable behavior,
removed redundant guaranteed-token fallbacks, removed an inactive diagnostic
surface, and condensed duplicated instructional copy. The remaining increase
is a measured user-visible capability cost, not unexamined build noise. The
gzip ceiling is therefore ratcheted by exactly 5 KiB to 445,440 bytes; raw and
Brotli ceilings are unchanged. The exact partition report is
`reports/standalone-byte-attribution.json` for the artifact gated by this
decision.

This does **not** approve the 85% headroom target: the artifact remains an
accepted exception, and the next optimization cycle must restore material
headroom rather than extend this ceiling again.

Any future proposal to increase a ceiling must update this ADR with:

1. before/after raw, gzip, and Brotli bytes;
2. the attribution report for both artifacts;
3. the user-visible capability responsible for the increase;
4. alternatives considered, including delayed initialization or smaller data
   serialization; and
5. a new absolute regression ceiling.

## Consequences

- A passing budget does not mean healthy headroom. Reports label this state
  `accepted-exception`, not `within-target`.
- The exception preserves feature parity for the offline artifact while making
  byte growth visible and bounded.
- The next optimization cycle should first reduce inlined JavaScript and
  duplicated explanatory/sample payloads identified by the attribution report.
