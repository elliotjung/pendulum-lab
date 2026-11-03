import { PROJECT_LIMITS } from '../../provenance/contracts';
import { validateResearchFiles, validateResearchProject } from '../../provenance/validation';
import type { ProjectPackageEvent, ProjectPackageRequest } from './package-contracts';

export interface ProjectPackageWorker {
  onmessage: ((event: MessageEvent<ProjectPackageEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(value: ProjectPackageRequest): void;
  terminate(): void;
}
export const PROJECT_PACKAGE_TIMEOUT_MS = 30_000;
const defaultFactory = (): ProjectPackageWorker =>
  new Worker(new URL('./package.worker.ts', import.meta.url), { type: 'module' });

/** A package is processed by a dedicated worker. Cancellation terminates its parser and hash work. */
export function createProjectPackageJob(
  request: ProjectPackageRequest,
  onEvent: (event: ProjectPackageEvent) => void,
  factory: () => ProjectPackageWorker = defaultFactory
) {
  let worker: ProjectPackageWorker | undefined;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fraction = 0;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }
  };
  const fail = (message: string) => {
    if (stopped) return;
    stop();
    onEvent({ type: 'error', id: request.id, message });
  };
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => fail('패키지 worker가 30초 동안 응답하지 않았습니다. 파일 크기를 줄여 다시 시도하세요.'),
      PROJECT_PACKAGE_TIMEOUT_MS
    );
  };
  try {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(request.id)) throw new Error('패키지 작업 ID가 유효하지 않습니다.');
    if (request.operation === 'import') {
      if (
        !(request.bytes instanceof Uint8Array) ||
        !request.bytes.length ||
        request.bytes.length > PROJECT_LIMITS.archiveBytes
      )
        throw new Error('1 byte~64 MiB 범위의 재현 ZIP을 선택하세요.');
    } else {
      validateResearchProject(request.bundle.project);
      if (
        request.operation === 'attach' &&
        (!(request.options.data instanceof Uint8Array) ||
          !request.options.data.length ||
          request.options.data.length > PROJECT_LIMITS.fileBytes)
      )
        throw new Error('첨부할 원본 artifact는 1 byte~24 MiB 범위여야 합니다.');
    }
    worker = factory();
    worker.onmessage = (event) => {
      if (stopped || event.data?.id !== request.id) return;
      try {
        const data = event.data;
        if (data.type === 'progress') {
          if (
            !Number.isFinite(data.fraction) ||
            data.fraction < fraction ||
            data.fraction > 1 ||
            typeof data.message !== 'string' ||
            data.message.length > 2000
          )
            throw new Error('패키지 진행 정보가 유효하지 않습니다.');
          fraction = data.fraction;
          arm();
        } else if (
          (data.type === 'imported' && request.operation === 'import') ||
          (data.type === 'updated' && (request.operation === 'attach' || request.operation === 'capture'))
        ) {
          validateResearchProject(data.bundle.project);
          if (
            !Array.isArray(data.bundle.files) ||
            data.bundle.files.length > PROJECT_LIMITS.files ||
            data.bundle.files.some((file) => !(file.data instanceof Uint8Array))
          )
            throw new Error('검증된 패키지 파일 목록을 읽을 수 없습니다.');
          validateResearchFiles(data.bundle);
        } else if (
          (data.type === 'exported' && request.operation === 'export') ||
          (data.type === 'reviewed' && request.operation === 'reviewer')
        ) {
          if (
            !(data.bytes instanceof Uint8Array) ||
            !data.bytes.length ||
            data.bytes.length > PROJECT_LIMITS.archiveBytes
          )
            throw new Error('생성된 ZIP이 크기 상한을 넘습니다.');
        } else if (
          data.type !== 'error' ||
          typeof data.message !== 'string' ||
          !data.message ||
          data.message.length > 2000
        )
          throw new Error('패키지 worker 응답이 유효하지 않습니다.');
        if (data.type !== 'progress') stop();
        onEvent(data);
      } catch (cause) {
        fail(cause instanceof Error ? cause.message : '패키지 결과를 읽지 못했습니다.');
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail('패키지 worker 실행에 실패했습니다. 브라우저 worker 정책을 확인하세요.');
    };
    worker.onmessageerror = () => fail('패키지 worker 결과를 전달받지 못했습니다.');
    arm();
    worker.postMessage(request);
  } catch (cause) {
    queueMicrotask(() => fail(cause instanceof Error ? cause.message : '패키지 worker를 시작하지 못했습니다.'));
  }
  return {
    cancel() {
      if (stopped) return;
      stop();
      onEvent({ type: 'cancelled', id: request.id });
    },
    dispose: stop
  };
}
