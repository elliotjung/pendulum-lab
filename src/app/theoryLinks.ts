import type { TrustSection } from './trustDrawer';

export interface TheoryLocalizedText {
  en: string;
  ko: string;
}

interface TheoryLinkBase {
  label: TheoryLocalizedText;
  description: TheoryLocalizedText;
}

export type TheoryLink =
  | (TheoryLinkBase & {
      kind: 'workspace';
      href: string;
      tab: 'lab' | 'validate';
    })
  | (TheoryLinkBase & {
      kind: 'trust';
      href: '#trustDrawer';
      section: TrustSection;
    })
  | (TheoryLinkBase & {
      kind: 'source' | 'document' | 'test';
      href: string;
      external: true;
    });

export const THEORY_LINK_IDS = [
  'lab-workspace',
  'validation-workspace',
  'trust-validation',
  'trust-provenance',
  'double-source',
  'canonical-source',
  'derivations-document',
  'invariant-tests',
  'reference-tests'
] as const;

export type TheoryLinkId = (typeof THEORY_LINK_IDS)[number];

const REPOSITORY_BLOB_ROOT = 'https://github.com/elliotjung/pendulum-lab/blob/master';

function repositoryHref(path: string): string {
  return `${REPOSITORY_BLOB_ROOT}/${path}`;
}

/**
 * Curated destinations used by Theory. No rendered URL comes from user input;
 * source links are pinned to the project's HTTPS GitHub origin and in-app
 * links are restricted to the existing Lab, Validation, and Trust surfaces.
 */
export const THEORY_LINKS: Readonly<Record<TheoryLinkId, TheoryLink>> = {
  'lab-workspace': {
    kind: 'workspace',
    tab: 'lab',
    href: '?tab=lab',
    label: { en: 'Open the live Lab', ko: '실시간 실험실 열기' },
    description: {
      en: 'Change the parameters and connect each symbol to the running motion.',
      ko: '매개변수를 바꾸며 각 기호를 실제 운동과 연결합니다.'
    }
  },
  'validation-workspace': {
    kind: 'workspace',
    tab: 'validate',
    href: '?tab=validate',
    label: { en: 'Run validation checks', ko: '검증 항목 실행하기' },
    description: {
      en: 'Inspect convergence, replay determinism, energy drift, and reference checks.',
      ko: '수렴성, 재생 결정성, 에너지 드리프트와 독립 기준 검사를 확인합니다.'
    }
  },
  'trust-validation': {
    kind: 'trust',
    section: 'validation',
    href: '#trustDrawer',
    label: { en: 'Review validation evidence', ko: '검증 근거 검토하기' },
    description: {
      en: 'Open the validation section of Trust & Diagnostics.',
      ko: '신뢰 및 진단 창의 검증 섹션을 엽니다.'
    }
  },
  'trust-provenance': {
    kind: 'trust',
    section: 'provenance',
    href: '#trustDrawer',
    label: { en: 'Inspect provenance', ko: '출처와 재현 정보 확인하기' },
    description: {
      en: 'Check the source, artifact, parameters, and reproducibility context.',
      ko: '소스, 산출물, 매개변수와 재현성 정보를 확인합니다.'
    }
  },
  'double-source': {
    kind: 'source',
    external: true,
    href: repositoryHref('src/physics/double.ts'),
    label: { en: 'Implemented in double.ts', ko: 'double.ts 구현 보기' },
    description: {
      en: 'Mass matrix, Euler-Lagrange right-hand side, analytic Jacobian, and energy.',
      ko: '질량행렬, 오일러-라그랑주 우변, 해석적 야코비안과 에너지 구현입니다.'
    }
  },
  'canonical-source': {
    kind: 'source',
    external: true,
    href: repositoryHref('src/physics/canonical.ts'),
    label: { en: 'Implemented in canonical.ts', ko: 'canonical.ts 구현 보기' },
    description: {
      en: 'Momentum conversion, Hamiltonian gradient, and implicit midpoint stepping.',
      ko: '운동량 변환, 해밀토니안 기울기와 암시적 중점 적분 구현입니다.'
    }
  },
  'derivations-document': {
    kind: 'document',
    external: true,
    href: repositoryHref('documents/derivations.md'),
    label: { en: 'Read the full derivation', ko: '전체 유도 과정 읽기' },
    description: {
      en: 'See the sign conventions, coupled equations, damping term, and validation notes.',
      ko: '부호 규약, 연립방정식, 감쇠항과 검증 메모를 확인합니다.'
    }
  },
  'invariant-tests': {
    kind: 'test',
    external: true,
    href: repositoryHref('tests/property-invariants.test.ts'),
    label: { en: 'Inspect invariant tests', ko: '불변량 테스트 보기' },
    description: {
      en: 'Review mass-matrix, canonical-transform, Hamiltonian-gradient, and energy properties.',
      ko: '질량행렬, 정준변환, 해밀토니안 기울기와 에너지 성질을 검토합니다.'
    }
  },
  'reference-tests': {
    kind: 'test',
    external: true,
    href: repositoryHref('tests/reference-validation.test.ts'),
    label: { en: 'Inspect reference validation', ko: '독립 기준 검증 보기' },
    description: {
      en: 'Review measured-order and independent reference comparisons.',
      ko: '측정 차수와 독립 기준 비교를 검토합니다.'
    }
  }
};

/** Runtime guard for the curated link registry and its contract tests. */
export function isSafeTheoryHref(link: TheoryLink): boolean {
  if (link.kind === 'workspace') return link.href === `?tab=${link.tab}`;
  if (link.kind === 'trust') return link.href === '#trustDrawer';
  try {
    const url = new URL(link.href);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      url.pathname.startsWith('/elliotjung/pendulum-lab/blob/master/')
    );
  } catch {
    return false;
  }
}
