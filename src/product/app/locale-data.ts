export type ProductLocale = 'ko' | 'en';
export const PRODUCT_LOCALE_STORAGE_KEY = 'pendulum-lab/product/locale/v1';

/** Reviewed structural labels. Unknown scientific explanations remain in their original language. */
export const PRODUCT_STRUCTURAL_TEXT: Readonly<Record<string, string>> = {
  '표시 언어': 'Language',
  '본문으로 건너뛰기': 'Skip to content',
  '새 공간 미리보기': 'New workspace preview',
  '주요 공간': 'Main spaces',
  배우기: 'Learn',
  실험실: 'Laboratory',
  '기존 앱 열기': 'Open existing app',
  '컴포넌트 갤러리': 'Component gallery',
  '시스템 라이브러리': 'System library',
  '화면 테마': 'Theme',
  밝게: 'Light',
  어둡게: 'Dark',
  '기기 설정': 'System preference',
  '실행 제어': 'Run controls',
  실행: 'Run',
  '실행 계속': 'Continue',
  일시정지: 'Pause',
  '한 단계': 'One step',
  처음으로: 'Reset',
  '실행 취소': 'Cancel run',
  '실행 준비 완료': 'Ready to run',
  '실행 중': 'Running',
  '실행 완료': 'Completed',
  '실행 취소됨': 'Cancelled',
  '실행 오류': 'Run error',
  '입력한 조건을 수정하세요.': 'Correct the input settings.',
  '현재 물리 시간': 'Current physical time',
  '실행 진행': 'Run progress',
  '재생 속도': 'Playback speed',
  '작업 공간': 'Workspace',
  조건: 'Parameters',
  분석: 'Analysis',
  보관함: 'Saved runs',
  내보내기: 'Export',
  '실험실 패널': 'Laboratory panels',
  '현재 자세와 수치 상태를 함께 확인하세요.': 'Inspect the current geometry and numerical state together.',
  '각속도 (rad/s)': 'Angular velocity (rad/s)',
  '운동 / 위치 / 총 에너지 (J)': 'Kinetic / potential / total energy (J)',
  '초기 총에너지 대비 변화 (J)': 'Change from initial total energy (J)',
  '현재 설정 저장': 'Save current settings',
  '현재 설정 보관': 'Keep current settings',
  '보관한 설정이 없습니다.': 'No saved settings yet.',
  '내보내기와 복원': 'Export and restore',
  '상태 JSON 다운로드': 'Download state JSON',
  '상태 JSON 가져오기': 'Import state JSON',
  '공유 링크 만들기': 'Create share link',
  '공유 설정 열기': 'Open shared settings',
  '상세 조건 펼치기': 'More parameters',
  '질량과 길이': 'Masses and lengths',
  초기조건: 'Initial conditions',
  '수치 적분': 'Numerical integration',
  '시스템 검색': 'Search systems',
  '모든 패밀리': 'All families',
  전체: 'All',
  즐겨찾기: 'Favorites',
  '최근 사용': 'Recent',
  '첫 번째 질량': 'First mass',
  '두 번째 질량': 'Second mass',
  '첫 번째 길이': 'First length',
  '두 번째 길이': 'Second length',
  '첫 번째 시작 각도': 'First initial angle',
  '두 번째 시작 각도': 'Second initial angle',
  '첫 번째 시작 각속도': 'First initial angular velocity',
  '두 번째 시작 각속도': 'Second initial angular velocity',
  '중력 가속도': 'Gravitational acceleration',
  '힌지 감쇠 계수': 'Hinge damping coefficient',
  '시간 간격': 'Time step',
  '관찰 시간': 'Observation duration',
  적분기: 'Integrator',
  '과정 목록': 'Courses',
  '학습 목표': 'Learning objectives',
  '선수 개념': 'Prerequisites',
  '연구 질문': 'Research question',
  '참고 문헌': 'References',
  '핵심 정리': 'Key ideas',
  '다음 탐구': 'Further exploration',
  '실험실에서 계속': 'Continue in laboratory',
  '단원으로 돌아가기': 'Back to unit',
  '이전 단원': 'Previous unit',
  '다음 단원': 'Next unit',
  '기존 데이터 가져오기': 'Import existing data',
  '가져오기 미리보기': 'Preview import',
  '미리보기 취소': 'Cancel preview',
  '원본 백업 다운로드': 'Download original backup',
  '확인하고 새 실험실에서 열기': 'Confirm and open in laboratory',
  '명령 검색 (Ctrl/⌘ K)': 'Search commands (Ctrl/⌘ K)',
  '소리화 · OGY 기준 제어': 'Sonification · OGY benchmark control',
  '진자 운동 소리화': 'Pendulum sonification',
  '소리 활성화': 'Enable sound',
  '소리 끄기': 'Disable sound',
  '소리로 표현할 관측량': 'Sonification observable',
  'OGY 제어·대조군 계산': 'Compute OGY control and reference',
  'OGY 계산 취소': 'Cancel OGY calculation',
  'OGY 설정·결과 JSON': 'OGY settings and results JSON',
  'OGY 비교 기록 CSV': 'OGY comparison CSV'
};

/** Only inert own data descriptors are read; an arbitrary getter is never evaluated. */
export function collectBilingualPairs(input: unknown): ReadonlyMap<string, string> {
  const pairs = new Map<string, string>();
  const ambiguous = new Set<string>();
  const visited = new WeakSet<object>();
  let budget = 100_000;
  function visit(value: unknown, depth: number): void {
    if (!value || typeof value !== 'object' || depth > 32 || budget-- <= 0 || visited.has(value)) return;
    visited.add(value);
    let descriptors: Record<string, PropertyDescriptor>;
    try {
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
      return;
    }
    const ko = descriptors.ko?.value,
      en = descriptors.en?.value;
    if (
      typeof ko === 'string' &&
      typeof en === 'string' &&
      ko.length <= 100_000 &&
      en.length <= 100_000 &&
      ko.trim() &&
      en.trim()
    ) {
      if (pairs.has(ko) && pairs.get(ko) !== en) {
        pairs.delete(ko);
        ambiguous.add(ko);
      } else if (!ambiguous.has(ko)) pairs.set(ko, en);
    }
    for (const descriptor of Object.values(descriptors)) if ('value' in descriptor) visit(descriptor.value, depth + 1);
  }
  visit(input, 0);
  return pairs;
}

export function resolveProductLocale(queryValue: unknown, storedValue: unknown): ProductLocale {
  return queryValue === 'en' || queryValue === 'ko' ? queryValue : storedValue === 'en' ? 'en' : 'ko';
}

export function translateProductString(
  original: string,
  locale: ProductLocale,
  pairs: ReadonlyMap<string, string>
): { text: string; language?: ProductLocale } {
  if (locale === 'ko') return { text: original, ...(/[가-힣]/.test(original) ? { language: 'ko' as const } : {}) };
  let translated = pairs.get(original) ?? PRODUCT_STRUCTURAL_TEXT[original];
  // A reviewed field label may be followed by its unchanged canonical symbol
  // and unit. Preserve that suffix exactly instead of translating units/values.
  if (translated === undefined) {
    const field = /^([가-힣 ]+) · ([A-Za-z][A-Za-z0-9_-]* \([^\r\n]{1,32}\))$/.exec(original);
    const prefix = field && PRODUCT_STRUCTURAL_TEXT[field[1]!];
    if (prefix) translated = `${prefix} · ${field![2]}`;
  }
  if (translated !== undefined) return { text: translated, language: 'en' };
  return { text: original, ...(/[가-힣]/.test(original) ? { language: 'ko' as const } : {}) };
}
