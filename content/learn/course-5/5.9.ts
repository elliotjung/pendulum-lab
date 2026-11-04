import { authorChaosLesson } from '../../../src/product/learn/authoring-course-five';

export default authorChaosLesson({
  id: '5.9',
  title: ['shadowing과 수치 궤적의 신뢰 시간', 'Shadowing and the trust horizon of numerical trajectories'],
  question: [
    '계산한 궤적은 언제까지 믿을 수 있을까요? 같은 모델의 RK4 후보와 더 촘촘한 GBS 수치 참조를 비교하고 허용 거리 문턱을 바꿉니다.',
    'How long can a numerical trajectory be trusted? Compare an RK4 candidate with a finer GBS numerical reference for the same model and vary the allowed distance.'
  ],
  prerequisites: [
    '원래 초기조건에서 독립적으로 적분한 후보와 수치 참조를 사용합니다. 공용 함수의 이름 shadowing은 엄밀한 참궤적 존재 증명과 같지 않습니다. 좌표별 원래 단위의 최대 거리를 씁니다.',
    'Both candidate and numerical reference restart from the original state. The shared function named shadowing does not establish a rigorous true-orbit existence result. Distance is a maximum over original mixed-unit coordinates.'
  ],
  objectives: [
    [
      '같은 초기조건의 오차 성장과 엄밀한 shadowing의 차이를 설명합니다.',
      'Distinguish same-initial-state error growth from rigorous shadowing.'
    ],
    [
      '기간 내 미초과·참조 불확실성·거리 문턱을 올바르게 해석합니다.',
      'Interpret unexceeded thresholds, reference uncertainty and finite observation windows.'
    ]
  ],
  concepts: [
    {
      title: ['두 수치해의 거리', 'Distance between numerical solutions'],
      body: [
        '후보와 더 세분한 참조를 같은 관측 시각에서 비교합니다. 최대 좌표 차이가 문턱을 처음 넘는 시각을 기록합니다. 참조도 수치해이므로 이를 정확해와의 오차라고 표시하지 않습니다. 좌표 척도가 바뀌면 같은 숫자 문턱의 의미도 달라집니다.',
        'Compare candidate and refined reference at common observation times. Record the first maximum-coordinate distance exceeding a threshold. The reference is numerical, so this is not exact-solution error. Coordinate rescaling changes the meaning of the same numerical threshold.'
      ]
    },
    {
      title: ['엄밀한 shadowing의 질문', 'The rigorous shadowing question'],
      body: [
        '엄밀한 shadowing은 조금 다른 초기조건의 참궤적이 수치 pseudo-orbit 근처에 존재하는지 묻습니다. 같은 초기조건의 두 적분해가 갈라지는 것은 그 존재 문제를 해결하지 않습니다. 제품은 정리 증명 대신 수치적 신뢰 시간 비교를 제공합니다.',
        'Rigorous shadowing asks whether a true orbit, possibly with a nearby initial state, stays near a numerical pseudo-orbit. Separation of two same-initial-state integrations does not resolve that existence question. The product provides a numerical trust comparison rather than a theorem.'
      ]
    },
    {
      title: ['참조 불확실성 밴드', 'Reference uncertainty band'],
      body: [
        '공용 분석은 두 참조 분할의 차이로 밴드를 추정합니다. 이 밴드는 엄밀한 오차 상계가 아닙니다. 작은 후보 차이도 참조 불확실성과 함께 읽어야 하며 GBS나 작은 step이 항상 정확하다고 단정하지 않습니다.',
        'The shared analysis estimates a band from two reference refinements. It is not a rigorous error bound. Read small candidate differences alongside reference uncertainty; neither GBS nor a smaller step is automatically exact.'
      ]
    },
    {
      title: ['실패 예제와 다음 탐구', 'Failure example and next inquiry'],
      body: [
        '현재 기간에서 문턱을 넘지 않으면 horizon은 null이며 무한 신뢰 시간이 아닙니다. 여기서 threshold는 거리 허용치로 적응형 solver의 rtol/atol과 다릅니다. 5.10부터는 개별 궤적의 신뢰와 다른 질문인 재귀 기하 통계를 탐색합니다.',
        'An unexceeded threshold produces null horizon, not infinite trust. Threshold here is an allowed distance, distinct from adaptive-solver rtol/atol. From 5.10, study recurrence geometry, a different question from trusting one trajectory.'
      ]
    }
  ],
  equations: [
    {
      title: ['1. 수치 후보와 참조의 차이', '1. Candidate-reference difference'],
      expression: 'coordinateDifference = abs(candidate-reference)',
      explanation: [
        '같은 좌표·단위·시각에서 뺍니다. 전체 진단은 여러 원래 좌표의 최대 차를 사용하므로 서로 다른 단위를 합한 물리적 길이가 아닙니다.',
        'Subtract matching coordinates at matching times and units. The full diagnostic takes the maximum over original coordinates rather than a physical length formed from mixed units.'
      ],
      symbols: [
        ['coordinateDifference', 'rad', '한 각좌표의 차이', 'Difference in one angular coordinate'],
        ['candidate', 'rad', '후보 각도', 'Candidate angle'],
        ['reference', 'rad', '수치 참조 각도', 'Numerical reference angle']
      ]
    },
    {
      title: ['2. 참조 step 세분화', '2. Reference-step refinement'],
      expression: 'referenceStep = step/refinementRatio',
      explanation: [
        '후보 step을 무차원 분할비로 나누어 수치 참조의 간격을 정합니다. 작은 step은 비용을 늘리며 정확해 인증을 대신하지 않습니다.',
        'Divide the candidate step by a dimensionless refinement ratio to set the reference interval. Finer steps increase cost without certifying an exact solution.'
      ],
      symbols: [
        ['referenceStep', 's', '참조 시간 간격', 'Reference interval'],
        ['step', 's', '후보 시간 간격', 'Candidate interval'],
        ['refinementRatio', '1', '세분화 비율', 'Refinement ratio']
      ]
    }
  ],
  term: ['기간 내 미초과', 'Unexceeded within the window'],
  definition: [
    '지정한 관측 기간 안에서 문턱 초과가 발견되지 않았다는 검열된 결과입니다.',
    'A censored result stating only that no threshold crossing was observed within the specified duration.'
  ],
  checks: [
    {
      prompt: ['horizon=null은 무한히 정확하다는 뜻인가요?', 'Does null horizon mean infinite accuracy?'],
      correct: ['관측 기간 내 문턱 미초과입니다.', 'It means the threshold was not exceeded within the window.'],
      wrong: ['무한 기간의 정확성을 보증합니다.', 'It guarantees accuracy for infinite time.'],
      explanation: [
        '측정이 끝난 뒤의 거동은 관찰하지 않았습니다.',
        'Behavior beyond the observed interval was not measured.'
      ]
    },
    {
      prompt: [
        'GBS와 RK4의 일치가 참궤적 존재를 증명하나요?',
        'Does GBS–RK4 agreement prove that a nearby true orbit exists?'
      ],
      correct: ['수치 교차 검사이며 엄밀한 증명이 아닙니다.', 'It is a numerical cross-check, not a rigorous proof.'],
      wrong: ['Shadowing 정리가 자동으로 증명됩니다.', 'It automatically proves a shadowing theorem.'],
      explanation: [
        '참조도 수치해이고 엄밀한 존재 검증 절차를 실행하지 않습니다.',
        'The reference is numerical and the rigorous existence-validation procedure is not performed.'
      ]
    }
  ],
  task: {
    prediction: [
      '거리 문턱을 절반으로 줄이면 최초 초과 시각은 어떻게 될까요?',
      'How does halving the distance threshold affect the first crossing?'
    ],
    action: [
      '현재 문턱과 자동 절반 문턱의 거리 곡선을 비교하고 step만 줄여 반복합니다. 초과 없음과 불확실성 밴드를 함께 읽으세요.',
      'Compare current and half-threshold distance curves, then reduce only step. Inspect unexceeded results alongside reference uncertainty bands.'
    ],
    expected: [
      '같은 거리 기록에서 더 작은 문턱의 최초 초과가 더 늦어질 수는 없습니다. 초과 없음은 null로 보존하며 표시 지표는 0입니다.',
      'For the same distance record, a smaller threshold cannot first cross later. Unexceeded horizons remain null and the displayed crossing indicator is 0.'
    ],
    explanation: [
      '문턱 변경은 같은 오차 곡선에 적용하는 판정의 변경입니다.',
      'Changing the threshold changes a criterion applied to the same difference curve.'
    ]
  },
  source: {
    title: [
      'Numerical orbits of chaotic processes represent true orbits',
      'Numerical orbits of chaotic processes represent true orbits'
    ],
    authors: 'Stephen M. Hammel, James A. Yorke, Celso Grebogi',
    url: 'https://yorke.umd.edu/Yorke_papers_most_cited_and_post2000/1988_06_Hammel_Grebogi_BAMS_True_Orbits.pdf',
    locator: [
      '1절의 pseudo-orbit·shadowing 정의와 조금 다른 초기조건의 참궤적 존재를 대조했습니다. 제품은 그 엄밀한 증명 절차를 실행하지 않습니다.',
      'Checked section 1 definitions of pseudo-orbit and shadowing and existence of a true orbit with a nearby initial state. The product does not execute that rigorous proof procedure.'
    ]
  }
});
