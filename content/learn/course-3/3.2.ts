import { courseThreeUnit } from '../../../src/product/learn/authoring-course-three';

export default courseThreeUnit({
  id: '3.2',
  summary: [
    'N을 두 배로 늘리면 계산도 두 배일까요? 자유도·행렬 저장량·선형계 풀이를 분리하고 실제 실행 비용을 측정합니다.',
    'Does doubling N merely double the work? Separate degrees of freedom, matrix storage and linear solves, then measure execution cost.'
  ],
  objectives: [
    [
      '상태 차원 2N과 밀집 행렬 N²의 차이를 설명합니다.',
      'Distinguish state dimension 2N from dense matrix size N squared.'
    ],
    [
      '같은 기간·간격에서 N별 비용과 보존 오차를 함께 비교합니다.',
      'Compare costs and conservation errors across N at matched duration and step.'
    ]
  ],
  prerequisites: [
    '양의 질점 질량과 고정 길이의 평면 사슬이며 감쇠는 0입니다. 모든 theta는 아래 수직 기준 절대각입니다. 동일한 링크를 추가하면 전체 길이·질량도 바뀌므로 물리적으로 같은 계를 더 정밀하게 푸는 실험이 아닙니다.',
    'Use a planar chain of positive point masses and fixed lengths with zero damping. All theta values are absolute from downward vertical. Adding identical links changes total mass and length; this is not refinement of the same physical system.'
  ],
  concepts: [
    {
      id: 'dimension',
      title: ['1. 자유도와 상태 차원', '1. Degrees of freedom and state dimension'],
      body: [
        '각 링크에는 각도 하나가 필요하므로 구성 자유도는 N입니다. 초기값 문제는 각속도까지 요구하여 상태 차원은 2N입니다. N개의 질량과 N개의 길이는 상태가 아니라 모형 매개변수입니다. 배열의 앞 N개는 각도, 뒤 N개는 각속도이므로 N을 바꿀 때 대응 관계도 함께 바꿉니다.',
        'Each link adds one angle, giving N configuration degrees of freedom. Initial-value evolution also needs N rates, so state dimension is 2N. Masses and lengths are parameters rather than state variables. Resizing N must preserve the correspondence between the first N angles and last N rates.'
      ]
    },
    {
      id: 'dense-solve',
      title: ['2. 밀집 구현의 비용', '2. Cost of the dense implementation'],
      body: [
        '엔진은 하류 질량합을 한 번 계산하고 N×N 관성행렬을 채웁니다. 행렬·분해 버퍼는 N²에 비례하고 Cholesky 분해의 큰 N 연산량은 N³에 비례합니다. 이 저장소의 밀집 구현에 대한 설명이며 모든 사슬 알고리즘의 하한은 아닙니다. 재귀 다물체 알고리즘은 구조를 더 활용할 수 있습니다.',
        'The engine computes suffix masses and fills an N by N inertia matrix. Matrix and factor buffers scale as N squared; large-N Cholesky arithmetic scales cubically. This describes the repository dense implementation, not a lower bound for every chain algorithm. Recursive multibody methods can exploit more structure.'
      ]
    },
    {
      id: 'measurement',
      title: ['3. 측정과 수치 정확도의 분리', '3. Separate timing from accuracy'],
      body: [
        '같은 적분기·기간·시간 간격을 유지한 채 N만 바꿉니다. 실측 시간에는 브라우저 준비, JIT, 복사, 표시 비용이 섞이므로 짧은 실험에서 정확한 세제곱 비율을 기대하지 않습니다. 표본 저장량은 상태 차원과 표본 수의 곱에도 비례합니다. 작은 간격으로 수렴을 확인하고, 큰 사슬의 느린 실행은 취소하세요.',
        'Hold integrator, duration and step fixed while changing N. Browser setup, JIT, copying and display overhead affect short timings, so do not demand an exact cubic ratio. Sample storage also grows with state dimension times sample count. Check convergence by reducing the step and cancel slow large-chain runs.'
      ]
    }
  ],
  equations: [
    {
      id: 'storage-count',
      title: ['상태와 행렬의 원소 수', 'State and matrix element counts'],
      expression: 'D=2*N; A=N*N; B=8*A',
      explanation: [
        '상태는 2N개 실수, 관성행렬 하나는 N제곱 개 float64 원소입니다. B는 한 행렬의 바이트 수이며 전체 메모리 사용량은 아닙니다.',
        'State has 2N real entries. One inertia matrix has N squared float64 elements. B counts bytes for one matrix, not total application memory.'
      ],
      symbols: [
        ['D', '1', '상태 실수 원소 수', 'Number of real state entries'],
        ['N', '1', '링크 수인 양의 정수', 'Positive integer link count'],
        ['A', '1', '행렬 원소 수', 'Matrix element count'],
        ['B', '1', '관성행렬 하나의 바이트 수', 'Byte count of one inertia matrix']
      ]
    },
    {
      id: 'scaling-ratio',
      title: ['지배 비용의 예상 비율', 'Expected dominant-cost ratios'],
      expression: 'Rmemory=(N2/N1)^2; Rsolve=(N2/N1)^3',
      explanation: [
        '링크 수 비의 제곱은 밀집 행렬 크기 비, 세제곱은 분해의 점근적 연산량 비입니다. 벽시계 시간의 확정 예측식은 아닙니다.',
        'The squared link-count ratio estimates dense storage growth; its cube estimates asymptotic factorization work. These are not guaranteed wall-clock ratios.'
      ],
      symbols: [
        ['Rmemory', '1', '행렬 저장 원소 수의 비', 'Dense storage element ratio'],
        ['N2', '1', '비교 사슬의 링크 수', 'Comparison chain link count'],
        ['N1', '1', '기준 사슬의 링크 수', 'Reference chain link count'],
        ['Rsolve', '1', '지배 분해 연산량 비', 'Dominant factorization work ratio']
      ]
    }
  ],
  questions: [
    {
      id: 'count',
      prompt: [
        'N=8일 때 상태 원소 수와 한 관성행렬의 float64 저장 바이트 수는?',
        'For N=8, what are the state length and bytes of one float64 inertia matrix?'
      ],
      correct: ['16개와 512바이트입니다.', '16 entries and 512 bytes.'],
      distractor: ['64개와 16바이트입니다.', '64 entries and 16 bytes.'],
      explanation: [
        '2N=16, N²=64, 8×64=512입니다. 추가 작업 버퍼와 궤적은 별도입니다.',
        '2N=16, N squared=64, and 8 times 64=512. Scratch buffers and trajectories are additional.'
      ]
    },
    {
      id: 'timing',
      prompt: [
        'N을 두 배로 늘렸는데 실행 시간이 정확히 여덟 배가 아닙니다. 구현 오류인가요?',
        'Doubling N did not multiply runtime by exactly eight. Is that an implementation error?'
      ],
      correct: [
        '그 측정만으로는 아닙니다. 점근 비용과 고정 비용을 구분해야 합니다.',
        'That observation alone is insufficient; distinguish asymptotic and fixed costs.'
      ],
      distractor: ['그렇습니다. 모든 N에서 정확히 여덟 배여야 합니다.', 'Yes. It must be exactly eight at every N.'],
      explanation: [
        '작은 N, 기기 부하, JIT와 표시 비용은 측정 시간에 영향을 줍니다.',
        'Small N, device load, JIT and rendering overhead affect measured time.'
      ]
    }
  ],
  prediction: [
    'N=2에서 N=4로 늘리면 상태·행렬·분해 비용은 각각 어떻게 늘까요?',
    'How do state size, matrix size and solve work change from N=2 to N=4?'
  ],
  action: [
    'links를 2, 4, 8로 바꾸며 같은 기간과 시간 간격에서 실행하세요. 차원·행렬 원소 수·측정 실행 비용·에너지 변화를 비교하세요.',
    'Run links=2, 4 and 8 at matched duration and step. Compare dimensions, matrix entries, measured execution cost and energy change.'
  ],
  expected: [
    'N=2,4,8의 상태 차원은 4,8,16이며 한 행렬 원소 수는 4,16,64입니다. 이 정수 개수는 정확히 일치해야 합니다. 측정 시간은 양수여야 하지만 기기별 배율 허용 오차를 정하지 않습니다.',
    'For N=2,4,8 the state dimensions are 4,8,16 and matrix counts are 4,16,64 exactly. Measured time must be positive, but no device-independent timing ratio tolerance is claimed.'
  ],
  explanation: [
    '저장량은 구조로 검증하고 시간은 측정으로 조사합니다. N 변화는 다른 물리계를 만드는 조작이기도 합니다.',
    'Verify storage counts structurally and investigate time empirically. Changing N also changes the physical system.'
  ],
  next: [
    '복잡도는 물리 자유도뿐 아니라 선택한 알고리즘에 달려 있습니다. 3.3에서는 질량의 위치 분포가 관성행렬 자체를 어떻게 바꾸는지 확인하세요.',
    'Complexity depends on both physical dimension and algorithm. In 3.3, investigate how mass distribution changes the inertia matrix itself.'
  ],
  source: {
    path: 'src/physics/nPendulum.ts',
    locator: [
      'createChainWorkspace의 N² 버퍼, rhsChain의 이중 반복·Cholesky와 상태 2N 구조를 대조했습니다.',
      'Checked N squared buffers in createChainWorkspace, the nested loops and Cholesky solve in rhsChain, and the 2N state layout.'
    ]
  }
});
