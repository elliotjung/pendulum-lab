/** Extracts exact already-executed attachment bytes. It creates no report or source attestation. */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { evidenceHash, evidencePath, type EvidenceDigest, type ParityExecutionCapture } from './parity-capture';
import { decodeEmbeddedAttachment, parseRunnerReport, runnerCaseKey, type RunnerCase } from './parity-runner-report';

export function extractEmbeddedArtifact(
  root: string,
  reference: EvidenceDigest,
  identity: Pick<RunnerCase, 'file' | 'title' | 'project'>,
  attachmentName: string,
  outputPath: string
): EvidenceDigest {
  if (!/^(?:tmp\/|documents\/redesign\/parity\/evidence\/exports\/)/.test(outputPath))
    throw new Error('Extracted artifacts require a fresh generated evidence/exports or tmp path.');
  const target = evidencePath(root, outputPath);
  if (existsSync(target)) throw new Error('Refusing to overwrite an existing retained artifact.');
  const captureBytes = readFileSync(evidencePath(root, reference.path));
  if (evidenceHash(captureBytes) !== reference.sha256) throw new Error('Capture SHA-256 changed before extraction.');
  const capture = JSON.parse(captureBytes.toString('utf8')) as ParityExecutionCapture;
  if (
    capture.schema !== 'pendulum-parity-execution/v1' ||
    !['vitest', 'playwright'].includes(capture.kind) ||
    capture.valid !== true ||
    capture.exitCode !== 0 ||
    !Array.isArray(capture.errors) ||
    capture.errors.length ||
    !capture.report
  )
    throw new Error('A successful actual test capture is required for attachment extraction.');
  const reportPath = evidencePath(root, capture.report.path);
  if (statSync(reportPath).size > 512 * 1024 * 1024)
    throw new Error('Runner report exceeds the extraction resource bound.');
  const reportBytes = readFileSync(reportPath);
  if (evidenceHash(reportBytes) !== capture.report.sha256)
    throw new Error('Runner report SHA-256 changed before extraction.');
  const raw = JSON.parse(reportBytes.toString('utf8')) as unknown;
  const parsed = parseRunnerReport(root, capture.kind as 'vitest' | 'playwright', raw);
  if (parsed.errors.length) throw new Error(parsed.errors.join('\n'));
  const selectedCases = parsed.cases.filter((test) => runnerCaseKey(test) === runnerCaseKey(identity));
  const selected = selectedCases.length === 1 ? selectedCases[0] : undefined;
  const matches = selected?.attachments.filter((item) => item.name === attachmentName);
  if (!selected || selected.status !== 'passed' || matches?.length !== 1 || !matches[0]?.embeddedSha256)
    throw new Error('Exact passed case has no unique named embedded attachment.');
  const digest = matches[0]!;
  const pending: unknown[] = [raw];
  let bytes: Buffer | undefined;
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object') continue;
    const item = value as Record<string, unknown>;
    if (item.name === attachmentName && typeof item.body === 'string') {
      const decoded = decodeEmbeddedAttachment(item.body);
      if (decoded.length === digest.embeddedBytes && evidenceHash(decoded) === digest.embeddedSha256) {
        bytes = decoded;
        break;
      }
    }
    for (const child of Object.values(item)) if (child && typeof child === 'object') pending.push(child);
  }
  if (!bytes) throw new Error('Pinned embedded executed bytes could not be decoded from the unchanged report.');
  mkdirSync(path.dirname(target), { recursive: true });
  evidencePath(root, outputPath); // Recheck the newly created ancestor before write.
  writeFileSync(target, bytes, { flag: 'wx' });
  return { path: outputPath, sha256: evidenceHash(bytes) };
}
