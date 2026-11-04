import { nonlinearLesson } from '../../../src/product/experiments/nonlinear-focus-authoring';
export default nonlinearLesson({
  id: '4.3',
  summary: [
    '평균 복원력이 양수인데도 진폭이 자랄 수 있을까요? Mathieu 계수의 주기 변화와 native Floquet 승수로 매개변수 가진의 불안정 영역을 조사합니다.',
    'Can a positive mean restoring force still permit growth? Explore parametric instability using the Mathieu coefficient and native Floquet multipliers.'
  ],
  objectives: [
    [
      '직접 외력과 복원 계수 변조를 구별합니다.',
      'Distinguish additive forcing from modulation of the restoring coefficient.'
    ],
    [
      'δ–ε 격자와 직접 응답을 비교하며 경계·Jordan 성장의 한계를 설명합니다.',
      'Compare a δ–ε grid with direct response and explain boundary and Jordan-growth limitations.'
    ]
  ],
  assumptions: [
    '정규화 시간 t에서 선형 방정식 ẍ+(δ+ε cos t)x=0입니다. x,v,δ,ε는 정규화 값이고 구동 주기는 2π입니다. 마찰·포화·진폭 의존 복원은 없으므로 큰 진폭에서도 선형 모형만 계산하며 실제 물체의 무한 성장을 보증하지 않습니다.',
    'Use ẍ+(δ+ε cos t)x=0 in normalized time. State and coefficients are normalized; modulation period is 2π. There is no damping, saturation or amplitude-dependent stiffness, so large responses remain linear-model predictions.'
  ],
  concepts: [
    {
      id: 'parametric',
      title: ['1. 진폭이 아니라 계수를 흔들기', '1. Modulate a coefficient'],
      body: [
        '평형 x=0은 모든 t에서 여전히 해입니다. 그러나 작은 교란이 경험하는 복원 계수가 주기적으로 바뀌므로 한 주기 동안의 에너지 교환이 누적될 수 있습니다. 주된 tongue은 무변조 극한 δ=1/4,1,9/4에서 시작합니다.',
        'The zero state remains an exact solution at every time. Periodic stiffness changes can nevertheless amplify perturbations over successive cycles. Tongues emerge near unmodulated δ=1/4,1,9/4.'
      ]
    },
    {
      id: 'monodromy',
      title: ['2. 한 주기의 기본해를 연결하기', '2. Connect fundamental solutions over one period'],
      body: [
        '두 독립 초기 벡터를 같은 선형 계수로 한 주기 적분한 행렬이 monodromy M입니다. 고유값 ρ가 단위원 밖이면 대응 교란이 주기마다 증폭됩니다. trace A=0이므로 det M=1이어야 하며 화면의 determinant drift가 수치 건전성을 보조합니다.',
        'Integrating two independent initial vectors over one period forms monodromy M. An eigenvalue outside the unit circle amplifies a perturbation each cycle. Since trace A=0, det M=1; determinant drift provides a numerical consistency check.'
      ]
    },
    {
      id: 'limits',
      title: ['3. 경계 판정의 한계와 Jordan 성장', '3. Boundary-classification limits and Jordan growth'],
      body: [
        '5×5 격자는 native solver의 반경을 보여 주며 선택한 점은 substep 1000과 2000을 비교합니다. 반경이 1에 가까워도 중복 승수의 비대각 Jordan 성장이 가능하므로 안정 또는 유계라고 단정하지 않습니다. NIST 표준형으로는 t=2z를 넣어 a=4δ,q=−2ε로 변환해야 합니다.',
        'The 5×5 grid uses the native solver, with 1000/2000 substep comparison at the selected point. Unit-modulus repeated multipliers can still permit Jordan growth. Conversion to the NIST standard form uses t=2z, a=4δ and q=−2ε.'
      ]
    }
  ],
  equations: [
    {
      id: 'first-order',
      title: ['1차 주기 계수계', 'First-order periodic system'],
      expression: 'xDot=v; vDot=-(delta+epsilon*cos(t))*x; T=6.283185307179586',
      explanation: [
        '위쪽 행은 ẋ=v이고 아래 행은 변위에 주기 복원 계수를 곱한 음의 가속도입니다. 계수행렬의 주기는 2π입니다.',
        'The first row gives ẋ=v; the second gives restoring acceleration. The coefficient matrix repeats every 2π normalized time units.'
      ],
      symbols: [
        ['x', '1', '정규화 변위', 'Normalized displacement'],
        ['v', '1', '정규화 속도', 'Normalized velocity'],
        ['xDot', '1', '정규화 변위 변화율', 'Normalized displacement rate'],
        ['vDot', '1', '정규화 가속도', 'Normalized acceleration'],
        ['delta', '1', '평균 복원 계수', 'Mean restoring coefficient'],
        ['epsilon', '1', '변조 크기', 'Modulation amplitude'],
        ['t', '1', '정규화 시간', 'Normalized time'],
        ['T', '1', '변조 주기', 'Modulation period']
      ]
    },
    {
      id: 'floquet',
      title: ['Floquet 성장과 수치 확인', 'Floquet growth and consistency'],
      expression: 'uNext1=M11*u1+M12*u2; uNext2=M21*u1+M22*u2; detM=M11*M22-M12*M21; detM=1; R=abs(rhoMax)',
      explanation: [
        'n주기 뒤 교란은 한 주기 행렬 M을 n번 적용한 결과입니다. 승수 반경 R과 determinant 보존을 함께 읽습니다.',
        'After n periods the perturbation is M applied n times. Read spectral radius alongside determinant preservation.'
      ],
      symbols: [
        ['u1', '1', '현재 교란의 첫 성분', 'First current perturbation component'],
        ['u2', '1', '현재 교란의 둘째 성분', 'Second current perturbation component'],
        ['uNext1', '1', '한 주기 뒤 교란의 첫 성분', 'First perturbation component one period later'],
        ['uNext2', '1', '한 주기 뒤 교란의 둘째 성분', 'Second perturbation component one period later'],
        ['M11', '1', 'monodromy 첫 행 첫 열', 'First monodromy diagonal entry'],
        ['M12', '1', 'monodromy 첫 행 둘째 열', 'First monodromy off-diagonal entry'],
        ['M21', '1', 'monodromy 둘째 행 첫 열', 'Second monodromy off-diagonal entry'],
        ['M22', '1', 'monodromy 둘째 행 둘째 열', 'Second monodromy diagonal entry'],
        ['detM', '1', 'monodromy 행렬식', 'Monodromy determinant'],
        ['rhoMax', '1', '절댓값이 가장 큰 Floquet 승수', 'Floquet multiplier of largest magnitude'],
        ['R', '1', '승수 반경', 'Multiplier spectral radius']
      ]
    }
  ],
  checks: [
    {
      prompt: [
        'x=0이 해이면 모든 작은 교란도 유계인가요?',
        'Does the exact zero solution imply bounded perturbations?'
      ],
      correct: ['아닙니다. 교란 성장률은 monodromy로 조사합니다.', 'No. Examine the monodromy of perturbations.'],
      incorrect: ['네. 평형이 존재하면 안정합니다.', 'Yes. Existence of equilibrium implies stability.'],
      explanation: ['해의 존재와 안정성은 서로 다른 질문입니다.', 'Existence and stability are different questions.']
    },
    {
      prompt: [
        '반경 1인 중복 승수만으로 유계성을 확정할 수 있나요?',
        'Do repeated unit-modulus multipliers certify boundedness?'
      ],
      correct: ['아닙니다. Jordan 성장과 경계 오차를 확인해야 합니다.', 'No. Check Jordan growth and boundary error.'],
      incorrect: ['네. 반경 하나면 충분합니다.', 'Yes. Radius alone is enough.'],
      explanation: [
        'δ=ε=0이면 x=x₀+v₀t가 되어 승수 반경 1에서도 선형 성장합니다.',
        'At δ=ε=0, x=x₀+v₀t can grow linearly despite radius 1.'
      ]
    }
  ],
  prediction: [
    'ε=0과 기본 ε=0.3에서 δ=0.25의 승수 반경은 같을까요?',
    'Will δ=0.25 have the same radius at ε=0 and ε=0.3?'
  ],
  action: [
    '기본 δ–ε 격자와 직접 응답을 실행하고 ε를 0으로 바꿔 대조하세요. δ를 0.6으로 옮기며 1000→2000 substep 차이와 det 잔차를 함께 확인하세요.',
    'Run the grid and direct response; compare with ε=0. Move δ to 0.6 and inspect substep refinement and determinant drift together.'
  ],
  expected: [
    '기본 δ=0.25,ε=0.3의 승수 반경은 약 2.47505로 1보다 큽니다(허용 오차 1e-4). ε=0,δ=0.25에서는 반경이 1에서 1e-7 이내입니다.',
    'Baseline δ=0.25, ε=0.3 gives radius about 2.47505, within 1e-4. At ε=0 and δ=0.25 it is within 1e-7 of 1.'
  ],
  explanation: [
    '평균 복원력이 양수여도 주기 계수는 교란을 증폭할 수 있습니다. 고정밀 수치 일치는 유한 해상도 증거이지 경계의 엄밀 증명이 아닙니다.',
    'Positive mean stiffness can coexist with parametric amplification. Numerical agreement is finite-resolution evidence, not a rigorous boundary proof.'
  ],
  next: [
    '4.4에서 실제 빠른 지지대 가진을 평균화 퍼텐셜과 비교하세요.',
    'In 4.4 compare a physically driven pivot with its averaged effective potential.'
  ],
  glossary: [
    ['불안정 tongue', 'Instability tongue'],
    [
      '매개변수 평면에서 주기 계수의 교란 증폭이 일어나는 혀 모양 영역입니다.',
      'A tongue-shaped parameter region where periodic coefficients amplify perturbations.'
    ]
  ],
  sources: [
    {
      path: 'src/chaos/mathieuStability.ts',
      locator: [
        'mathieuCoefficient,mathieuFloquet와 native 격자·허용오차를 대조했습니다.',
        'Checked mathieuCoefficient, mathieuFloquet, grid construction and tolerance.'
      ]
    }
  ],
  external: {
    title: 'NIST DLMF §28.17 Stability',
    authors: 'NIST Digital Library of Mathematical Functions',
    url: 'https://dlmf.nist.gov/28.17',
    locator: [
      '안정 쌍·경계 곡선의 정의와 대조했습니다. 제품의 t와 표준형 변수는 t=2z로 다릅니다.',
      'Compared stability-pair and boundary-curve definitions; product time and the standard variable differ by t=2z.'
    ]
  }
});
