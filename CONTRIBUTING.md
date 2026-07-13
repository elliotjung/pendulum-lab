# Contributing to Pendulum Lab

Thank you for improving the simulator, research library, or documentation.
Before starting a large feature, open an issue so its numerical contract,
public API stability, and evidence requirements can be agreed first.

## Local gate

Use Node.js 22, 24, or 26 and install with `npm ci`. Every change must pass the
same ordered gate used by CI:

```text
npm run lint
npm run typecheck
npm run audit:modules
npm run test:json
npm run test:check
npm run docs:sync
```

`npm run verify` runs that sequence. Changes to the browser app should also run
`npm run build`, `npm run build:standalone`, `npm run check:standalone-sync`,
and the narrowest relevant Playwright spec. Numerical changes must add a unit
or property test and identify an analytic, independent, or literature oracle.

## Evidence and reports

Bug reports should include the exact reproduction command and attach the
machine-readable report JSON when one is produced. Do not hand-edit generated
evidence. See [the artifact policy](docs/artifact-policy.md),
[testing strategy](docs/testing-strategy.md), and
[API stability policy](docs/api-overview.md).

Contributions are accepted under the repository's [MIT License](LICENSE) and
must follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities
privately as described in [SECURITY.md](SECURITY.md).
