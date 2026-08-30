# Quality Evidence Contracts

This page separates a local implementation or policy from the external run that
proves it was exercised. Adding a validator is not the same as obtaining fresh
browser, deployment, registry, hardware, or user-study evidence.

## Current policy at a glance

| Area | Enforced or recorded locally | Evidence still required |
| --- | --- | --- |
| Standalone bytes | Absolute raw/gzip/Brotli ceilings, exact HTML partition, functional modular proxy, accepted headroom ADR | A fresh production build report; reaching the 85% headroom target is not claimed |
| Publication status | Source snapshot/deployment probe distinction, commit/environment/TTL/expiry fields, fail-closed stale/unknown evaluator | Fresh network probes and any npm, GitHub Release, Pages, or Zenodo publication |
| Visual baselines | Native runner fingerprint, six-file completeness/hash binding, read-only manual-review artifact path, optional explicit PR path | Hosted Linux/Windows/macOS runs and human inspection of every changed image |
| Coverage risk | A traceable risk register for numerical and boundary failure modes | The configured coverage thresholds and named tests must pass on the measured run |
| Mutation | Both total and covered scores must reach 70% for the quality target; survivors and timeouts have separate triage | Latest aggregate is below target until a fresh report says otherwise |
| CSS reachability | Two independent Chromium launches over locale/mode/theme/viewport/media/state matrix; union-only candidates | Firefox/WebKit source review and three-platform visual gates before deletion |
| Cold/warm performance | Schema and validator keep one cold sample separate from at least three warm samples, attribute long tasks, and require a failing regression fixture | Measured Landing/hosted-browser artifacts; this Lab contract does not create them |
| Browser flakes | Thirty-day, 1% alert ledger; raw trace for each event; expiring upstream exceptions | CI history collection, particularly Firefox teardown behavior |
| Actions runtime | Node pin parity, full action SHA pins, weekly Dependabot, and mainline standalone/visual workflow references | Green hosted workflows and review of any upstream security warning |

## Standalone byte attribution and headroom

`npm run budget` measures the hosted and standalone artifacts. It now also writes
`reports/standalone-byte-attribution.json` and `.md`:

- every raw byte in `standalone/index.html` belongs to the HTML shell, inline
  JavaScript, inline CSS, or inline structured JSON;
- compressed sizes for each partition are isolated estimates because a
  whole-file compressor shares a dictionary;
- companion files are measured exactly;
- modular `dist/assets` files are grouped by functional role as a non-additive
  same-source proxy.

The target is at most 85% of each absolute standalone budget. The current
artifact is above that target, so [ADR 0003](adr/0003-standalone-budget-headroom.md)
records a bounded exception under the existing exact ceilings. The exception is
valid only while attribution covers the artifact and the ceilings still match
the ADR. It must not be paraphrased as “the headroom target passes.” A budget
increase requires a reviewed before/after attribution and an ADR change.

## Deployment and publication evidence

Publication status schema `pendulum-publication-status/v2` uses these top-level
freshness fields:

```json
{
  "schemaVersion": "pendulum-publication-status/v2",
  "reportKind": "source-snapshot",
  "generatedAt": "2026-08-26T00:00:00.000Z",
  "snapshotGeneratedAt": "2026-08-26T00:00:00.000Z",
  "checkedSourceCommit": "<40 lowercase hex characters or null>",
  "environment": {
    "execution": "local",
    "workflow": null,
    "runId": null
  },
  "freshnessTtl": "PT24H",
  "expiresAt": "2026-08-27T00:00:00.000Z"
}
```

`reportKind` is either `source-snapshot` or `deployment-probe`. The normal file
is `reports/publication-status.json`; deployment CI writes
`reports/deployment-publication-status.json` so a network observation is never
silently presented as source state. Missing v2 metadata, a malformed or future
timestamp, a TTL/expiry mismatch, or expiry makes the display status `unknown`.
Legacy v1 reports are readable historical data but fail closed as unknown until
regenerated.

The Pages workflow checks the exact deployed source commit and writes the
deployment probe only after the public manifest and evidence bind to that SHA.
The evidence dispatch polling log prints expected and observed source commits,
manifest/evidence SHA-256 values, ETags, last-modified headers, and observation
time on every attempt. See [cross-project release](cross-project-release.md) for
why an ordinary Landing push must not fail simply because Lab Pages serves an
older valid deployment; strict convergence begins with an explicit dispatched
coordinate.

A local validator cannot publish npm, create a GitHub Release, deploy Pages, or
mint a Zenodo DOI. Those remain external facts and need account-backed evidence.

## Visual baseline promotion and runner identity

The native workflow runs on Ubuntu, Windows, and macOS. Each platform packages
its Chromium executable/revision, runner image, Node version, locale, viewport,
device scale/effective DPI, relevant native fonts, source commit, and exact PNG
hashes in `e2e/visual-baseline-metadata/<platform>.json`.

The default workflow has read-only repository permission and produces one
manual-review artifact containing the images, metadata, checksums, change stat,
and binary Git patch. A human may inspect it, apply the patch locally, rerun the
three metadata-bound checks, and commit. `promotion_mode: pull-request` is an
explicit optional path for repositories whose bot policy permits write access;
it is no longer the only successful path. Full instructions are in
[visual baseline promotion](visual-baseline-promotion.md).

Hosted native output is authoritative. Local regeneration is diagnostic unless
the local machine fingerprint intentionally matches the corresponding hosted
runner; files must never be copied or relabeled between platforms.

## Coverage and failure-injection risk register

`documents/testing-risk-register.json` maps priority numerical/boundary areas to
source modules, named tests, failure modes, and required title fragments. Its
validator prevents a target from existing only as prose. The policy targets are
65% line/statement coverage and 60% branch/function coverage for the designated
risk surface, alongside explicit non-finite, singular, rejection, cancellation,
or resource-exhaustion fixtures where applicable.

Those percentages describe the promotion contract, not a claim that the latest
run reached them. The machine coverage report and scope audit remain the source
of measured truth.

## Mutation quality and timeout triage

The mutation aggregator keeps the historical 60% regression floor but reports a
quality target only when **both** total and covered mutation scores reach 70%.
Release evidence applies the same two-score rule. Survivor reports retain source
line, mutator, coverage, and suggested test basis. Timeout mutants are written
to a separate report and require one of four reviewed classifications before a
timeout may be raised: expensive valid kill, infinite-loop kill, shard-isolation
defect, or test-harness defect.

The last recorded aggregate cited by the backlog was 65.32% total and 68.34%
covered. It therefore does not meet the 70/70 quality target. A changed policy or
new tests do not rewrite that measurement; only a fresh aggregate does.

## CSS deletion policy

The CSS audit covers English/Korean; Beginner/Student/Research; light/dark;
desktop, narrow mobile, and print; reduced motion; forced colors; focus/hover;
delayed mounts; and representative PWA/error overlays. It launches a fresh
Chromium process twice and unions all ranges. A selector is only a candidate if
it remains unused in the full union.

Candidates are not deletion instructions. Remove a small reviewed set, then run
native Linux/Windows/macOS visual gates. Chromium reachability cannot prove a
Firefox/WebKit-specific or vendor-prefixed selector is dead.

## Cold/warm performance and browser flakes

The schemas in `documents/schemas/frontend-performance.schema.json` and
`flake-ledger.schema.json` exist so the companion Landing and hosted-browser
jobs can emit comparable evidence:

- cold and warm samples remain separate; warm aggregation cannot hide cold-start
  loading, parsing, or initialization cost;
- long tasks retain lane and attribution;
- a deliberately regressed bundle must trip at least one threshold, proving the
  gate is live rather than decorative;
- every flake retains the original failure trace even when a retry passes;
- known-upstream exceptions expire, and more than 1% failures in a rolling
  30-day window raises the alert.

The schemas and pure validators are complete local contracts. Historical run
collection and a representative regressed hosted bundle are still external run
work, and must not be inferred from unit-test success.

## Actions supply-chain maintenance

The validator requires every third-party action to use a full commit SHA,
requires the composite Node default to equal `.node-version`, verifies weekly
Dependabot coverage for GitHub Actions, and checks that mainline references the
standalone and native visual gates. The policy is documented in
`.github/ACTIONS_POLICY.md`.

When GitHub reports an upstream Node-runtime deprecation or security warning,
the correct evidence is an upstream release/commit review plus a fresh hosted
run. A local full-SHA check cannot prove the upstream implementation has no
warning, so warnings remain open until the Actions UI is observed green.
