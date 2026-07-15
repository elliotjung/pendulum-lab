# Mini-paper: Melnikov threshold vs period-doubling gap map

`index.html` and `paper.pdf` are **generated** — every number is injected from
`reports/paper-study.json` by `scripts/build-paper.ts`. Do not edit them by
hand; regenerate instead:

```bash
npm run paper:study        # ~10 min: main grid + frequency scan + Duffing map
npm run flagship:certify   # certification rows, figure hash, crossing interval
npm run flagship:external  # independent Python (NumPy/SciPy) A_PD reproduction
npm run paper:build        # render index.html + paper.pdf
```

## Contents (as of 2026-07-10)

- Main result: A_PD/A_c(γ) for the damped driven pendulum at ω = 2/3 over
  γ ∈ [0.1, 0.8], Floquet-refined (ρ = −1), with the ordering reversal
  localized at γ* ≈ 0.693.
- §5 extensions: a frequency scan (ω = 0.5, 0.85 — the crossing moves with ω;
  non-PD losses reported as unclassified) and a Duffing double-well companion
  gap map (closed-form Γ_c derived and quadrature-verified in
  `src/chaos/melnikov.ts`; onsets as bisection brackets).
- Appendices: certified onset localization, independent Python reproduction,
  artifact/caveat ledger.

## Preprint path (decision recorded 2026-07-10)

The roadmap question "does the mini-paper become a formal preprint?" is
resolved: **yes — arXiv preprint, after one more polish pass.** Rationale: the
result is now multi-frequency and multi-system, externally reproduced, and
artifact-complete, which clears the bar for a methods/results preprint; a
notebook-only artifact would under-serve the certification chain that already
exists.

Remaining steps (external accounts; cannot be automated from this repo):

1. Zenodo DOI first (see `documents/RELEASING.md` / `npm run zenodo:draft`) so the
   preprint can cite the archived software version.
2. Convert to arXiv-accepted source. arXiv does not ingest HTML: either
   (a) submit `paper.pdf` alone (allowed for nlin), or (b) port the generated
   HTML to LaTeX (one-time template; figures are already deterministic SVG —
   export via `svg → pdf` per figure).
3. Category: `nlin.CD` (Chaotic Dynamics), cross-list `physics.comp-ph`.
   First-time submitters may need endorsement for nlin.CD.
4. Add the arXiv ID to `CITATION.cff` (`preferred-citation`) and to the
   landing page's ScholarlyArticle JSON-LD once live.

The bibliography, figure hashes, and reproduce commands in the paper are
already arXiv-ready; no claims depend on unpublished internal artifacts.
