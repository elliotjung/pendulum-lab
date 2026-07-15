# Schema migration policy & archive compatibility matrix

Every JSON artifact this project writes carries a `schemaVersion` string of the
form `pendulum-<artifact>/v<N>`. This document is the policy for how those
versions evolve and the compatibility matrix for reading old archives.

## Policy

1. **Versioned at write time.** Writers always stamp the *current* schema
   version. Readers never infer a version from shape alone; an absent
   `schemaVersion` is treated as `legacy`.
2. **Read-compatible one major back.** Each reader accepts its current version
   and at least the immediately previous one. Older payloads pass through the
   same sanitizer pipeline as untrusted input (`normalizeResearchStorage`,
   `StateStore.validate`, `validateResearchDbArchive`) — fields that fail
   validation are dropped and counted, never silently coerced.
3. **Migrations are explicit and logged.** When a reader upgrades a payload it
   records the step in the payload's `migrations: string[]`
   (`"<from> -> <to>"`) and notes dropped entries in `droppedEntries`. UI
   surfaces show the count in the audit log.
4. **Additive changes don't bump the version.** New optional fields are
   allowed within a version. The version bumps when (a) a field changes
   meaning or type, (b) a required field is added, or (c) entries are
   re-keyed.
5. **Breaking changes ship a migrator.** A version bump must land in the same
   commit as the migration function and a round-trip test
   (`tests/json-import-validation.test.ts`, `tests/research-db.test.ts`).
6. **Export before upgrade.** The Research → Long-Term Storage panel's
   "Export DB Archive" is the supported escape hatch: archives are re-imported
   through the sanitizers, so a downgrade can always recover data (modulo
   fields the older build doesn't know).

## Current schema inventory

| Artifact | Current version | Writer | Reader/sanitizer |
|---|---|---|---|
| Research workbench (localStorage) | `pendulum-research-workbench/v4` | `storage-sync.persistResearchState` | `normalizeResearchStorage` |
| Workspace file | `pendulum-workspace/v1` | `exportWorkspaceJson` | `importWorkspaceJson` |
| Design study | `pendulum-design-study/v1` | `persistDesignStudy` | `loadDesignStudy` / workspace import |
| IndexedDB archive | `pendulum-research-db/v1` | `ResearchDb.exportArchive` | `validateResearchDbArchive` |
| ZIP bundle | `pendulum-research-bundle-zip/v1` | `buildResearchBundleZipEntries` | external (sha256sum) |
| Bundle checksums | `pendulum-bundle-checksums/v2` | same | external verification |
| Paper figures/pack | `pendulum-paper-figures/v2`, `pendulum-paper-pack/v2` | figure-export | consumers of the pack |
| Notebook | `pendulum-research-notebook/v2` | `buildNotebookV2` | `npm run notebook:validate` |
| Snapshot | `pendulum-snapshot/v2` | `currentSnapshot` export | `StateStore.validate` |
| Provenance | `pendulum-provenance/v1` | `ProvenanceBuilder` | viewers |
| 3D diagnostics | `pendulum-3d-diagnostics/v1` | lab3d snapshot exports | external |
| Batch checkpoint | `pendulum-batch-checkpoint/v1` | study batch runner | `sanitizeBatchCheckpoint` |
| Parameter study (+results) | `pendulum-parameter-study/v1`, `…-results/v1` | study exports | `sanitizeParameterStudyPlan` |
| CLI batch results | `pendulum-cli-batch-results/v1` | `npm run research` | downstream scripts |
| Submission manifest | `pendulum-submission/v10-ts` | `createSubmissionManifest` | reviewers |

## Archive compatibility matrix

Current-build note: the research workbench writer now emits
`pendulum-research-workbench/v4`. Version 4 adds project/session/artifact
manifest metadata on top of the v3 workspace-profile shape; older readers ignore
those additive fields, while the current sanitizer synthesizes them for older
payloads.

Rows: artifact version found in a file. Columns: app build reading it.

| Stored artifact | ≤ v10.28 build | v10.29–10.30 build | v10.31-10.34 build | current build |
|---|---|---|---|---|
| workbench `legacy` (no version) | ✅ native | ✅ sanitized + migrated → v2 | ✅ sanitized + migrated → v2 | ✅ sanitized + migrated → v3 |
| workbench `/v1` | ✅ native | ✅ migrated → v2 (logged) | ✅ migrated → v2 (logged) | ✅ migrated → v3 (logged) |
| workbench `/v2` | ❌ unknown fields dropped | ✅ native | ✅ native | ✅ migrated → v3; `workspaces[]` synthesized from active workspace |
| workbench `/v3` | ❌ unknown fields dropped | ⚠️ unknown `workspaces[]` ignored | ⚠️ unknown `workspaces[]` ignored | ✅ native |
| research-db `/v1` archive | — (store absent) | ✅ native | ✅ native | ✅ native |
| workspace `/v1` | — | ✅ native | ✅ native | ✅ native |
| design-study `/v1` | — | ✅ native | ✅ native | ✅ native |
| checksums `/v1` (crc32+fnv) | n/a (external) | ✅ verifiable | ✅ verifiable (legacy algorithm noted) | ✅ verifiable (legacy algorithm noted) |
| checksums `/v2` (sha256+crc32+fnv) | n/a | ⚠️ extra field ignored | ✅ native | ✅ native |
| snapshot `/v2` | ✅ | ✅ | ✅ | ✅ |
| 3d-diagnostics `/v1` | — | ✅ | ✅ | ✅ |

Legend: ✅ reads cleanly · ⚠️ reads, ignores unknown fields · ❌ not supported
(export an archive from the old build and re-import instead).

## Adding a new schema (checklist)

1. Pick the id: `pendulum-<artifact>/v1`.
2. Write the sanitizer next to the reader; route *every* input through it
   (storage, workspace import, DB hydrate, file import).
3. Add a round-trip + hostile-input test.
4. Add the artifact to the inventory table above and, when it replaces an
   older version, a row to the compatibility matrix.
