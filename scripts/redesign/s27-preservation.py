"""Read-only S27 preservation audit; only the explicit output argument is written.

Run from the repository root after staging the final evidence:
    python scripts/redesign/s27-preservation.py documents/redesign/stage-runs/S27-preservation.json

This script does not execute tests, fetch, stage, commit, copy desktop documents,
or inspect/print file contents. Git blob equality is NOT raw CRLF byte equality.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone


BASELINE = "9cfd9842570cdd3137e3ea866a1266de2585b941"
PLAN_DOCUMENTS = (
    "AGENTS.md",
    "documents/redesign/README.md",
    "documents/redesign/master-roadmap-ko.md",
    "documents/redesign/execution-plan-ko.md",
    "documents/redesign/curriculum-map-ko.md",
    "documents/redesign/stage-run-protocol-ko.md",
)
OVERVIEW_PNG_ALLOWLIST = {
    f"e2e/redesign/learn.spec.ts-snapshots/s09-learn-courses-{theme}-{project}-win32.png"
    for theme in ("light", "dark")
    for project in ("chromium", "mobile-chrome")
}
DESKTOP_COPIES = (
    (
        "master-roadmap",
        "documents/redesign/master-roadmap-ko.md",
        "Pendulum_Lab_Complete_Redesign_Roadmap_KO.md",
    ),
    (
        "execution-plan",
        "documents/redesign/execution-plan-ko.md",
        "Pendulum_Lab_Codex_Execution_Steps_KO.md",
    ),
)


def git(root: Path, *args: str, input_bytes: bytes | None = None) -> bytes:
    env = dict(os.environ)
    env["GIT_OPTIONAL_LOCKS"] = "0"
    result = subprocess.run(
        ["git", "-c", "core.fsmonitor=false", *args],
        cwd=root,
        env=env,
        input=input_bytes,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode:
        # Do not surface arbitrary tool stderr, which can contain environment data.
        raise RuntimeError(f"Git {' '.join(args[:2])} failed (exit {result.returncode}).")
    return result.stdout


def decode(value: bytes) -> str:
    return value.decode("utf-8", "surrogateescape")


def nul_paths(raw: bytes) -> list[str]:
    return [decode(part) for part in raw.split(b"\0") if part]


def tree(root: Path) -> dict[str, dict[str, str]]:
    result = {}
    for entry in git(root, "ls-tree", "-r", "-z", BASELINE).split(b"\0"):
        if not entry:
            continue
        metadata, path_bytes = entry.split(b"\t", 1)
        mode, kind, object_id = decode(metadata).split(" ")
        if kind == "blob":
            result[decode(path_bytes)] = {"mode": mode, "blob": object_id}
    return result


def quote_git_path(path: str) -> bytes:
    # Git --stdin-paths accepts C-quoted byte paths. Avoid shell quoting entirely.
    chunks = []
    for value in path.encode("utf-8", "surrogateescape"):
        if 32 <= value < 127 and value not in (34, 92):
            chunks.append(chr(value))
        elif value == 34:
            chunks.append('\\"')
        elif value == 92:
            chunks.append("\\\\")
        else:
            chunks.append(f"\\{value:03o}")
    return ('"' + "".join(chunks) + '"\n').encode("ascii")


def current_blobs(root: Path, paths: list[str]) -> dict[str, str | None]:
    result: dict[str, str | None] = {path: None for path in paths}
    regular = []
    for path in paths:
        actual = root / path
        if actual.is_symlink():
            # A Git symlink blob contains its link text, not target file bytes.
            target = os.readlink(actual).encode("utf-8", "surrogateescape")
            result[path] = decode(git(root, "hash-object", "--stdin", input_bytes=target)).strip()
        elif actual.is_file():
            regular.append(path)
    if regular:
        # With file paths, hash-object applies the repository's clean/eol filters
        # by default. --no-filters and -w are deliberately absent.
        payload = b"".join(quote_git_path(path) for path in regular)
        values = decode(git(root, "hash-object", "--stdin-paths", input_bytes=payload)).splitlines()
        if len(values) != len(regular) or any(
            len(value) not in (40, 64) or any(c not in "0123456789abcdef" for c in value)
            for value in values
        ):
            raise RuntimeError("Git returned an unexpected hash-object result count or format.")
        result.update(zip(regular, values))
    return result


def changes(root: Path, *args: str) -> list[dict[str, str]]:
    parts = git(root, "diff", "--name-status", "-z", "--no-renames", *args, "--").split(b"\0")
    parts = [part for part in parts if part]
    if len(parts) % 2:
        raise RuntimeError("Unexpected Git diff name-status format.")
    return [
        {"status": decode(parts[i]), "path": decode(parts[i + 1])}
        for i in range(0, len(parts), 2)
    ]


def classify_protected(path: str) -> list[str]:
    categories = []
    if any(path.startswith(f"src/{name}/") for name in (
        "physics", "chaos", "research", "runtime", "workers", "validation"
    )):
        categories.append("preserved-native-engines")
    if path.startswith("src/product/adapters/physics/"):
        categories.append("preserved-product-physics-adapters")
    if path.startswith("src/product/adapters/analysis/"):
        categories.append("preserved-product-analysis-adapters")
    if (
        path.startswith("src/lib")
        or path.startswith("src/public/")
        or path.startswith("src/api/")
        or path == "src/index.ts"
        or path in ("tsconfig.lib.json", "vite.config.lib.ts", "LICENSE", "CITATION.cff")
    ):
        categories.append("public-package-api-and-build-boundary")
    if path in ("app.html", "package.json", "package-lock.json", "npm-shrinkwrap.json"):
        categories.append("legacy-entry-and-package-contract")
    if any(path.startswith(f"content/learn/course-{course}/") for course in range(1, 6)):
        categories.append("published-courses-one-through-five")
    if path.startswith("tests/characterization/numerical-golden"):
        categories.append("numerical-golden-test-and-fixtures")
    if path in PLAN_DOCUMENTS:
        categories.append("authoritative-instructions-and-plans")
    return categories


def digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def desktop_checks(root: Path) -> list[dict[str, object]]:
    rows = []
    for name, repository_path, desktop_name in DESKTOP_COPIES:
        desktop_path = Path.home() / "Desktop" / desktop_name
        row: dict[str, object] = {
            "name": name,
            "repositoryPath": repository_path,
            "desktopPath": f"<Desktop>/{desktop_name}",
            "method": "raw-file SHA256 (read-only, no copying)",
        }
        try:
            row["repositorySha256"] = digest(root / repository_path)
            row["desktopSha256"] = digest(desktop_path)
            row["matches"] = row["repositorySha256"] == row["desktopSha256"]
            row["status"] = "matched" if row["matches"] else "different"
        except OSError as error:
            row["matches"] = None
            row["status"] = "unreadable-or-missing"
            row["errorKind"] = type(error).__name__
            row["errorNumber"] = error.errno
        rows.append(row)
    return rows


def comparison(path: str, baseline: dict[str, dict[str, str]], hashes: dict[str, str | None]) -> dict[str, object]:
    before = baseline[path]["blob"]
    after = hashes[path]
    return {
        "path": path,
        "baselineGitBlob": before,
        "currentNormalizedGitBlob": after,
        "gitBlobEquivalent": before == after,
        "currentMissingOrNonfile": after is None,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", help="Explicit JSON output path inside this repository.")
    args = parser.parse_args()
    requested_cwd = Path.cwd().resolve()
    root = Path(decode(git(requested_cwd, "rev-parse", "--show-toplevel")).strip()).resolve()
    if requested_cwd != root:
        raise RuntimeError("Run this audit from the resolved repository root.")
    output = Path(args.output)
    if not output.is_absolute():
        output = root / output
    output = output.resolve()
    if not output.is_relative_to(root) or output.suffix.lower() != ".json":
        raise RuntimeError("The explicit output must be a .json file inside the repository.")
    baseline = tree(root)
    output_relative = output.relative_to(root).as_posix()
    if output_relative in baseline:
        raise RuntimeError("Refusing to overwrite a file present in the S26 baseline.")
    current_paths = set(nul_paths(git(root, "ls-files", "-z", "--cached")))
    untracked = nul_paths(git(root, "ls-files", "-z", "--others", "--exclude-standard"))
    hashes = current_blobs(root, sorted(baseline))
    all_comparisons = [comparison(path, baseline, hashes) for path in sorted(baseline)]
    protected = []
    categories: dict[str, dict[str, object]] = {}
    for entry in all_comparisons:
        names = classify_protected(str(entry["path"]))
        if not names:
            continue
        row = {**entry, "categories": names}
        protected.append(row)
        for name in names:
            group = categories.setdefault(name, {"total": 0, "equivalent": 0, "changedPaths": []})
            group["total"] += 1
            group["equivalent"] += int(bool(entry["gitBlobEquivalent"]))
            if not entry["gitBlobEquivalent"]:
                group["changedPaths"].append(entry["path"])
    original_tests = [
        entry for entry in all_comparisons
        if str(entry["path"]).startswith(("tests/", "e2e/"))
        and not str(entry["path"]).lower().endswith(".png")
    ]
    pngs = [entry for entry in all_comparisons if str(entry["path"]).lower().endswith(".png")]
    changed_pngs = [
        {**entry, "intentionalOverviewAllowlist": entry["path"] in OVERVIEW_PNG_ALLOWLIST}
        for entry in pngs if not entry["gitBlobEquivalent"]
    ]
    new_paths = sorted((current_paths | set(untracked)) - set(baseline))
    transport = desktop_checks(root)
    tracked_s27_evidence = sorted(
        path for path in current_paths | set(untracked)
        if path.startswith("documents/redesign/stage-runs/S27")
        and path != output_relative and (root / path).is_file()
    )
    # Hash evidence files without treating their contents as proof of test runs.
    evidence_files = [{"path": path, "rawSha256": digest(root / path)} for path in tracked_s27_evidence]
    violations = [entry["path"] for entry in protected if not entry["gitBlobEquivalent"]]
    png_violations = [entry["path"] for entry in changed_pngs if not entry["intentionalOverviewAllowlist"]]
    report = {
        "schema": "pendulum-s27-preservation/v1",
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "baselineCommit": BASELINE,
        "inspectedHead": decode(git(root, "rev-parse", "HEAD")).strip(),
        "branch": decode(git(root, "branch", "--show-current")).strip(),
        "repositoryRoot": ".",
        "scope": {
            "comparison": "Existing baseline file blobs vs current working files using Git hash-object --stdin-paths with repository clean/eol filters.",
            "claim": "Git blob equivalence only; no claim of raw CRLF byte identity for repository text files.",
            "symlinks": "Git blobs compare symlink link text, without hashing referenced target files.",
            "fileModes": "Content equivalence does not certify executable mode changes; Git name-status changes are reported separately.",
            "excludedControlFiles": ["documents/redesign/status.json", "documents/redesign/stage-runs/*"],
            "execution": "No tests, numerical calculations, fetch, staging, commits or desktop copying were performed by this helper.",
        },
        "categories": categories,
        "protected": {
            "total": len(protected),
            "equivalent": sum(bool(entry["gitBlobEquivalent"]) for entry in protected),
            "changedPaths": violations,
            "files": protected,
        },
        "originalTestsAndFixtures": {
            "total": len(original_tests),
            "equivalent": sum(bool(entry["gitBlobEquivalent"]) for entry in original_tests),
            "changed": [entry for entry in original_tests if not entry["gitBlobEquivalent"]],
            "intent": "Changes are enumerated for independent review, not automatically approved.",
        },
        "originalPngs": {
            "total": len(pngs),
            "equivalent": sum(bool(entry["gitBlobEquivalent"]) for entry in pngs),
            "intentionalOverviewAllowlist": sorted(OVERVIEW_PNG_ALLOWLIST),
            "changed": changed_pngs,
            "unexpectedChangedPaths": png_violations,
        },
        "newPathsSinceBaseline": new_paths,
        "newS27ContentAndFocusPaths": [path for path in new_paths if (
            any(path.startswith(f"content/learn/course-{course}/") for course in (6, 7, 8))
            or (path.startswith("src/product/experiments/") and any(
                token in path for token in ("stability-focus", "frontier-focus", "reproducibility-focus", "s27-")
            ))
        )],
        "currentDiffPathsAgainstBaseline": changes(root, BASELINE),
        "stagedChangesAgainstHead": changes(root, "--cached", "HEAD"),
        "unstagedChanges": changes(root),
        "untrackedNonignoredPaths": untracked,
        "desktopTransportCopies": transport,
        "evidenceFiles": evidence_files,
        "reviewAndModelLimits": {
            "modelSelectorObserved": False,
            "modelSelectorState": "unknown; not exposed or verified by this helper",
            "humanOrExpertReviewCertified": False,
            "humanReviewState": "unknown; Git/file hashes cannot establish an actual human review",
            "testExecutionCertified": False,
            "remotePushCertified": False,
        },
        "preservationChecksPass": not violations and not png_violations,
        "desktopRawHashesAllMatch": all(row.get("matches") is True for row in transport),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    return 0 if report["preservationChecksPass"] else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except OSError as error:
        print(f"S27 preservation audit failed: {type(error).__name__} errno={error.errno}", file=sys.stderr)
        raise SystemExit(1)
    except RuntimeError as error:
        print(f"S27 preservation audit failed: {error}", file=sys.stderr)
        raise SystemExit(1)
