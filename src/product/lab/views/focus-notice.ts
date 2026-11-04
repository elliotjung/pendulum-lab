import { element, link } from '../../app/dom';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import { focusSource } from '../../experiments/transfer';

/** The source parser validates course/unit IDs before a return link is shown. */
export function createFocusNotice(document: Document, experiment?: ExperimentStateV1) {
  const source = experiment ? focusSource(experiment) : null;
  if (!source) return null;
  const notice = element(document, 'aside', 'learn-notice');
  notice.append(
    element(
      document,
      'p',
      '',
      `출처 단원 ${source.unitId} · 콘텐츠 버전 ${source.version}. 현재 기준 run의 물성·구동·제어·초기조건·단위를 적용했습니다.`
    ),
    element(
      document,
      'p',
      '',
      '별도 sweep·비교 결과는 전용 실험 보고서에 보존됩니다. 단원으로 돌아가면 보내기 전 설정을 복원합니다.'
    ),
    link(document, '단원으로 돌아가기', source.href, 'ds-button ds-button--secondary')
  );
  return notice;
}
