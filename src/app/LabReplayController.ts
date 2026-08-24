import { pageDom as dom } from './DomBinder';
import { LabRecording, type LabRecordedFrame } from './LabRecording';
import type { TrajectoryRetentionMetadata, TrajectorySample } from './labExport';

export interface ReplayTransition {
  frame: LabRecordedFrame | null;
  running: boolean;
}

/** Owns the bounded replay cursor, retention provenance, and its compact DOM. */
export class LabReplayController {
  private readonly recording: LabRecording;
  private index = -1;
  private selectedFrame: LabRecordedFrame | null = null;
  private resumeAfterReplay = false;

  constructor(capacity: number) {
    this.recording = new LabRecording(capacity);
  }

  get active(): boolean {
    return this.index >= 0;
  }

  get frame(): LabRecordedFrame | null {
    return this.selectedFrame;
  }

  get length(): number {
    return this.recording.length;
  }

  clear(): void {
    this.recording.clear();
    this.index = -1;
    this.selectedFrame = null;
    this.resumeAfterReplay = false;
    this.syncPresentation();
  }

  record(time: number, state: ArrayLike<number>): void {
    this.recording.push(time, state);
    this.syncPresentation();
  }

  samples(): TrajectorySample[] {
    return this.recording.samples();
  }

  retentionMetadata(): TrajectoryRetentionMetadata {
    return this.recording.retentionMetadata();
  }

  forceResumeOnExit(): void {
    this.resumeAfterReplay = true;
  }

  transition(index: number, running: boolean): ReplayTransition | null {
    if (index < 0) {
      const resume = this.active ? this.resumeAfterReplay : running;
      this.index = -1;
      this.selectedFrame = null;
      this.resumeAfterReplay = false;
      this.syncPresentation();
      return { frame: null, running: resume };
    }

    const frame = this.recording.at(index);
    if (!frame) return null;
    if (!this.active) this.resumeAfterReplay = running;
    this.index = index;
    this.selectedFrame = frame;
    this.syncPresentation();
    return { frame, running: false };
  }

  label(index: number): string {
    if (index < 0) return 'live';
    return `${(this.recording.timeAt(index) ?? 0).toFixed(2)}s`;
  }

  syncPresentation(): void {
    const scrubber = dom.el<HTMLInputElement>('scrubber');
    const liveSentinel = this.recording.length;
    if (scrubber) {
      scrubber.max = String(liveSentinel);
      scrubber.value = String(this.index < 0 ? liveSentinel : Math.min(this.index, Math.max(0, liveSentinel - 1)));
    }
    dom.setText('scrubVal', this.label(this.index));
    this.presentRetention();
  }

  private presentRetention(): void {
    const host = dom.el('recordingRetentionNotice');
    if (!host) return;
    const metadata = this.recording.retentionMetadata();
    const korean = document.documentElement.lang === 'ko';
    if (metadata.totalSamples === 0) {
      host.textContent = korean
        ? `재생과 궤적 내보내기는 최근 ${metadata.capacity.toLocaleString('ko-KR')}개 표본 프레임을 보관합니다. CSV와 실행 JSON에 보존 범위가 기록됩니다.`
        : `Replay and trajectory export retain the most recent ${metadata.capacity.toLocaleString('en-US')} sampled frames. CSV and run JSON report the retention window.`;
      return;
    }
    host.textContent = korean
      ? `재생/CSV: 전체 ${metadata.totalSamples.toLocaleString('ko-KR')}개 중 최근 ${metadata.retainedSamples.toLocaleString('ko-KR')}개 보관 · 이전 표본 ${metadata.droppedSamples.toLocaleString('ko-KR')}개 제외. 실행 JSON에도 이 범위가 기록됩니다.`
      : `Replay/CSV: newest ${metadata.retainedSamples.toLocaleString('en-US')} of ${metadata.totalSamples.toLocaleString('en-US')} sampled frames retained · ${metadata.droppedSamples.toLocaleString('en-US')} earlier dropped. Run JSON reports the same window.`;
  }
}
