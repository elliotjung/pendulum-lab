import { buildResearchPackage, importResearchPackage } from '../../provenance/package';
import { importLegacyResearchPackage } from '../../provenance/compatibility';
import { researchExportEntries, renderOfflineReviewer } from '../../provenance/render';
import { addResearchArtifact, captureResearchRun, verifyResearchBundle } from '../../provenance/project';
import { textToBytes } from '../../../research/zipBundle';
import { PROJECT_LIMITS } from '../../provenance/contracts';
import type { ProjectPackageEvent, ProjectPackageRequest } from './package-contracts';

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ProjectPackageRequest>) => void) | null;
  postMessage(event: ProjectPackageEvent, transfer?: Transferable[]): void;
};

scope.onmessage = (event) => {
  const request = event.data;
  const progress = (fraction: number, message: string) =>
    scope.postMessage({ type: 'progress', id: request.id, fraction, message });
  void (async () => {
    try {
      if (request.operation === 'import') {
        progress(0.1, 'ZIP 경로·manifest·체크섬·원본 artifact를 검사합니다.');
        let bundle;
        try {
          bundle = await importResearchPackage(request.bytes);
        } catch (cause) {
          try {
            bundle = await importLegacyResearchPackage(request.bytes);
          } catch {
            throw cause;
          }
        }
        progress(1, '패키지 검증을 마쳤습니다. 미리보기를 확인한 뒤 채택하세요.');
        scope.postMessage({ type: 'imported', id: request.id, bundle });
      } else if (request.operation === 'export') {
        progress(0.1, '원본 artifact와 그래프를 검증하고 보고서·그림을 만듭니다.');
        const extraEntries = researchExportEntries(request.bundle);
        progress(0.5, 'manifest와 파일별 SHA-256을 기록합니다.');
        const bytes = await buildResearchPackage(request.bundle, { extraEntries });
        progress(1, '재현 ZIP을 만들었습니다.');
        scope.postMessage({ type: 'exported', id: request.id, bytes }, [bytes.buffer as ArrayBuffer]);
      } else if (request.operation === 'reviewer') {
        progress(0.1, '원본과 계보를 검증하고 오프라인 reviewer를 만듭니다.');
        const bundle = await verifyResearchBundle(request.bundle);
        const bytes = textToBytes(renderOfflineReviewer(bundle));
        if (bytes.length > PROJECT_LIMITS.archiveBytes) throw new Error('오프라인 reviewer가 64 MiB 상한을 넘습니다.');
        progress(1, '오프라인 reviewer를 만들었습니다.');
        scope.postMessage({ type: 'reviewed', id: request.id, bytes }, [bytes.buffer as ArrayBuffer]);
      } else {
        progress(
          0.1,
          request.operation === 'capture'
            ? '클릭 시점 입력과 실제 기록 표본을 보존합니다.'
            : '원본 artifact의 native schema와 입력 계보를 검증합니다.'
        );
        const bundle =
          request.operation === 'capture'
            ? await captureResearchRun(request.bundle, request.options)
            : await addResearchArtifact(request.bundle, request.options);
        progress(1, '원본 bytes와 SHA-256을 보존했습니다.');
        scope.postMessage({ type: 'updated', id: request.id, bundle });
      }
    } catch (cause) {
      scope.postMessage({
        type: 'error',
        id: request.id,
        message: (cause instanceof Error ? cause.message : '패키지 처리에 실패했습니다.').slice(0, 1800)
      });
    }
  })();
};
