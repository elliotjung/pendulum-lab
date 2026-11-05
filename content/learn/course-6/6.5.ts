import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '6.5',
  summary: [
    '매번 처음부터 추정하지 않고 한 주기해에서 이웃 해로 이동하면 무엇을 얻을까요? 실제 warm start와 branch 잔차를 읽습니다.',
    'What do we gain by moving from one periodic solution to its neighbor? Inspect actual warm starts and branch residuals.'
  ],
  objectives: [
    [
      '매개변수별 독립 실행과 해 branch continuation을 구별합니다.',
      'Distinguish independent parameter runs from solution-branch continuation.'
    ],
    [
      '수렴한 끝점만 다음 추정으로 사용하는 이유를 설명합니다.',
      'Explain why only converged endpoints become warm starts.'
    ]
  ],
  assumptions: [
    '단일 구동 진자의 sine 위상을 유지하며 forcingAmplitude를 추적합니다. 각 매개변수에서 같은 반환 조건과 native RK4 해상도를 사용합니다.',
    'Follow forcingAmplitude in a single driven pendulum while preserving the sine phase. Use identical return conditions and native RK4 resolution at each parameter.'
  ],
  concepts: [
    {
      id: 'warm-start',
      title: ['작은 이동과 재보정', 'Small steps and correction'],
      body: [
        '매개변수를 작게 바꾸면 정칙 branch의 해도 가깝게 변합니다. 이전 수렴해를 다음 Newton 추정으로 삼으면 같은 branch를 따라갈 수 있습니다. 독립 장시간 실행은 안정한 attractor로 갈 수 있어 불안정 branch의 continuation과 같은 그림을 보장하지 않습니다.',
        'On a regular solution branch, small parameter steps lead to nearby solutions. Reusing the last converged point as a Newton guess can track that branch. Independent long trajectories can select stable attractors and need not reproduce unstable continuation branches.'
      ]
    },
    {
      id: 'failure',
      title: ['fold와 멈춤의 해석', 'Folds and stopping'],
      body: [
        'branch가 선택 매개변수의 함수가 아니게 되는 fold에서는 자연 매개변수법의 선형계가 특이해질 수 있습니다. 점 수를 늘리는 것만으로 fold를 통과한다고 보장할 수 없습니다. 미수렴점의 잔차를 보존하고 자동으로 다음 seed에 쓰지 않는 이유입니다.',
        'At a fold, the branch ceases to be a single-valued function of the chosen parameter and the correction system can become singular. More points alone do not guarantee passage. Preserve failed residuals and avoid propagating a nonconverged seed.'
      ]
    }
  ],
  equations: [
    {
      id: 'grid',
      title: ['1. 매개변수 격자', '1. Parameter grid'],
      expression: 'amplitude = startAmplitude+fraction*(endAmplitude-startAmplitude)',
      explanation: [
        '무차원 fraction을0에서1까지 이동해 양 끝점을 포함하는 구동 진폭 격자를 만듭니다.',
        'Move a dimensionless fraction from zero to one to include both endpoints of the forcing-amplitude grid.'
      ],
      symbols: [
        ['amplitude', 'rad/s^2', '현재 구동 진폭', 'Current amplitude'],
        ['startAmplitude', 'rad/s^2', '시작 진폭', 'Start amplitude'],
        ['endAmplitude', 'rad/s^2', '끝 진폭', 'End amplitude'],
        ['fraction', '1', '격자 진행 비율', 'Grid fraction']
      ]
    },
    {
      id: 'residual',
      title: ['2. 각도 잔차 검증', '2. Angular residual check'],
      expression: 'angleResidual = abs(returnedTheta-theta)',
      explanation: [
        '각 매개변수의 보정 후 실제 반환 각도 차를 다시 계산합니다. 전체 혼합 norm은 별도 표에서 확인합니다.',
        'Recompute the actual angular return error after correction at each parameter; inspect the complete mixed norm separately.'
      ],
      symbols: [
        ['angleResidual', 'rad', '각도 성분 절댓값 잔차', 'Absolute angular residual'],
        ['returnedTheta', 'rad', '실제 반환 각도', 'Returned angle'],
        ['theta', 'rad', '후보 주기점', 'Candidate periodic angle']
      ]
    }
  ],
  checks: [
    {
      prompt: [
        '매개변수별 안정 attractor 스캔과 continuation은?',
        'Are stable-attractor scans and continuation equivalent?'
      ],
      correct: [
        '불안정 해와 branch 선택 때문에 다를 수 있습니다.',
        'They can differ through unstable solutions and branch selection.'
      ],
      incorrect: [
        '초기조건과 관계없이 항상 동일합니다.',
        'They are always identical regardless of initial conditions.'
      ],
      explanation: [
        'Newton은 불안정 해도 찾을 수 있지만 장기 궤적은 보통 그곳에 머물지 않습니다.',
        'Newton can locate an unstable solution that a long trajectory will not remain on.'
      ]
    },
    {
      prompt: ['한 지점이 미수렴이면 다음 seed는?', 'What happens after a nonconverged point?'],
      correct: ['검증되지 않은 끝점을 자동 사용하지 않습니다.', 'Do not automatically reuse the unverified endpoint.'],
      incorrect: ['숫자가 유한하기만 하면 자동 사용합니다.', 'Reuse any finite numbers automatically.'],
      explanation: [
        '유한값은 shooting 방정식을 만족한다는 뜻이 아닙니다.',
        'Finite values do not establish that the shooting equation is satisfied.'
      ]
    }
  ],
  prediction: [
    '같은 시작점에서 points를 늘리면 branch 모양과 각 점의 잔차는 어떻게 달라질까요?',
    'How will branch shape and point residuals change when increasing points from the same starting solution?'
  ],
  action: [
    '기본 구간0.2–0.6의5개 점을 실행한 뒤 points를7로 바꾸고 수렴 점 수·잔차·승수 변화를 비교합니다.',
    'Run five points over0.2–0.6, then use seven points and compare converged counts, residuals and multipliers.'
  ],
  expected: [
    '기본 약구동 branch는 연속적인 주기해를 제공합니다. 더 촘촘한 매개변수 격자는 더 많은 점을 주지만 각 점의 Newton 허용치를 자동으로 강화하지 않습니다.',
    'The default weak-forcing branch gives continuous periodic solutions. A finer parameter grid adds points without automatically tightening each Newton tolerance.'
  ],
  explanation: [
    '매개변수 해상도와 해의 잔차 정확도는 서로 다른 오차 축입니다. 두 설정을 따로 비교해야 합니다.',
    'Parameter resolution and root residual accuracy are different error axes and should be examined independently.'
  ],
  next: [
    '6.6에서 해와 매개변수를 함께 미지수로 두어 fold를 지나는 arclength 조건을 실험합니다.',
    'In6.6, treat solution and parameter as unknowns and add an arclength condition to pass a fold.'
  ],
  glossary: [
    ['Warm start', 'Warm start'],
    [
      '이전의 검증된 해를 다음 인접 문제의 초기 추정으로 사용하는 방법입니다.',
      'Using a previously verified solution as the initial guess for a neighboring problem.'
    ]
  ],
  sources: [
    {
      path: 'src/product/adapters/analysis/stability/native-current.ts',
      locator: [
        'continuation의 warm 상태·미수렴 종료·승수 표본 경로를 확인합니다.',
        'Inspect continuation warm states, nonconvergence termination and multiplier samples.'
      ]
    },
    {
      path: 'src/chaos/continuation.ts',
      locator: [
        '자연 매개변수 branch와 fold 한계의 공용 계약을 확인합니다.',
        'Check the shared natural-parameter branch contract and fold limitations.'
      ]
    }
  ],
  external: {
    title: 'AUTO-07p',
    authors: 'AUTO-07p contributors',
    url: 'https://github.com/auto-07p/auto-07p',
    locator: [
      '공식 continuation 도구의 해 branch와 bifurcation 추적 범위를 참고합니다.',
      'Consult the official continuation project for solution-branch and bifurcation tracking scope.'
    ]
  }
});
