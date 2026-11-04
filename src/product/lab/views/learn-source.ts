import { element, link } from '../../app/dom';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import { focusSource } from '../../experiments/transfer';

/** Render only after the workspace accepts its canonical experiment. */
export function createLearnSourceNotice(document: Document, experiment: ExperimentStateV1): HTMLElement | null {
  const source = focusSource(experiment);
  if (!source) return null;
  const notice = element(document, 'aside', 'learn-notice');
  notice.setAttribute('aria-label', '전용 실험의 출처 단원');
  notice.append(
    element(
      document,
      'p',
      '',
      `출처 단원 ${source.unitId} · 콘텐츠 버전 ${source.version}. 전용 실험의 초기조건·단위·실행 설정을 적용했습니다.`
    ),
    element(
      document,
      'p',
      '',
      '이곳에서 바꾼 조건은 실험실에 유지됩니다. 단원으로 돌아가면 보내기 전 전용 실험을 복원합니다.'
    ),
    link(document, '단원으로 돌아가기', source.href, 'ds-button ds-button--secondary')
  );
  return notice;
}
