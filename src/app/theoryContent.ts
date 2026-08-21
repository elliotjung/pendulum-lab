import type { TheoryLinkId, TheoryLocalizedText } from './theoryLinks';

export type TheoryLocale = keyof TheoryLocalizedText;

export const THEORY_SECTION_IDS = [
  'assumptions',
  'geometry',
  'velocities',
  'energy',
  'formulations',
  'mass-matrix-eom',
  'numerical-representation',
  'validation-evidence',
  'implemented-in'
] as const;

export type TheorySectionId = (typeof THEORY_SECTION_IDS)[number];

export interface TheoryEquation {
  id: string;
  label: TheoryLocalizedText;
  expression: string;
  explanation: TheoryLocalizedText;
}

export interface TheorySection {
  id: TheorySectionId;
  step: number;
  title: TheoryLocalizedText;
  summary: TheoryLocalizedText;
  paragraphs: readonly TheoryLocalizedText[];
  equations: readonly TheoryEquation[];
  links: readonly TheoryLinkId[];
  caveat?: TheoryLocalizedText;
}

export const THEORY_OVERVIEW = {
  eyebrow: { en: 'FROM MODEL TO EVIDENCE', ko: '모델에서 근거까지' },
  title: { en: 'Double-pendulum theory', ko: '이중진자 이론' },
  summary: {
    en: 'Follow one point-mass model from its physical assumptions to the equations that run in the Lab, then inspect the evidence used to validate it.',
    ko: '하나의 질점 모델을 물리적 가정부터 실험실에서 실행되는 운동방정식까지 따라가고, 그 식을 검증하는 근거를 확인합니다.'
  },
  scope: {
    en: 'Scope: planar point masses on massless rigid links. This explanation does not describe the rope, spring, spherical, or distributed-mass models.',
    ko: '범위: 질량이 없는 강체 링크 끝의 평면 질점 모델입니다. 줄, 스프링, 구면 또는 분포질량 모델에는 이 설명을 그대로 적용하지 않습니다.'
  }
} as const satisfies Record<string, TheoryLocalizedText>;

export const THEORY_SECTIONS: readonly TheorySection[] = [
  {
    id: 'assumptions',
    step: 1,
    title: { en: 'Physical assumptions', ko: '물리적 가정' },
    summary: {
      en: 'State the model before interpreting a trajectory.',
      ko: '궤적을 해석하기 전에 어떤 모델인지 먼저 밝힙니다.'
    },
    paragraphs: [
      {
        en: 'Two point masses m₁ and m₂ move in one vertical plane. Massless, rigid links of lengths l₁ and l₂ join them to a fixed pivot, and g acts downward.',
        ko: '두 질점 m₁, m₂가 하나의 수직 평면에서 움직입니다. 길이 l₁, l₂인 질량 없는 강체 링크가 질점을 고정된 축에 연결하며 중력 g는 아래로 작용합니다.'
      },
      {
        en: 'Angles θ₁ and θ₂ are measured from the downward vertical. Positive finite masses and lengths keep the point-mass mass matrix nonsingular.',
        ko: '각도 θ₁, θ₂는 아래쪽 수직선에서 측정합니다. 양의 유한한 질량과 길이는 질점 모델의 질량행렬을 비특이 상태로 유지합니다.'
      },
      {
        en: 'When damping γ is zero the model is conservative. When γ is positive, the generalized damping torque is Qᵢ = −γωᵢ, so mechanical energy is expected to decay.',
        ko: '감쇠 γ가 0이면 보존계입니다. γ가 양수이면 일반화 감쇠 토크는 Qᵢ = −γωᵢ이며 역학적 에너지는 감소해야 합니다.'
      }
    ],
    equations: [],
    links: ['derivations-document'],
    caveat: {
      en: 'This is an idealized model: joint friction, link mass, air drag, elasticity, and out-of-plane motion require different equations.',
      ko: '이 모델은 이상화되어 있습니다. 관절 마찰, 링크 질량, 공기 저항, 탄성, 평면 밖 운동에는 다른 방정식이 필요합니다.'
    }
  },
  {
    id: 'geometry',
    step: 2,
    title: { en: 'Coordinates and geometry', ko: '좌표와 기하' },
    summary: {
      en: 'Convert the two angles into the positions drawn on the canvas.',
      ko: '두 각도를 캔버스에 그려지는 위치로 바꿉니다.'
    },
    paragraphs: [
      {
        en: 'The first bob is one link from the pivot. The second bob starts at the first bob and adds the second link, so its position couples both angles.',
        ko: '첫 번째 추는 축에서 링크 하나만큼 떨어져 있습니다. 두 번째 추는 첫 번째 추의 위치에 두 번째 링크를 더하므로 두 각도가 함께 위치를 결정합니다.'
      }
    ],
    equations: [
      {
        id: 'bob-positions',
        label: { en: 'Bob positions', ko: '추의 위치' },
        expression: 'x₁ = l₁ sin θ₁,   y₁ = −l₁ cos θ₁\nx₂ = x₁ + l₂ sin θ₂,   y₂ = y₁ − l₂ cos θ₂',
        explanation: {
          en: 'The y-axis points upward, which is why the hanging rest state has negative y.',
          ko: 'y축은 위쪽이 양의 방향이므로 아래로 늘어진 평형 상태의 y값은 음수입니다.'
        }
      }
    ],
    links: ['lab-workspace', 'double-source']
  },
  {
    id: 'velocities',
    step: 3,
    title: { en: 'Velocities', ko: '속도' },
    summary: {
      en: 'Differentiate the geometry before building kinetic energy.',
      ko: '운동에너지를 만들기 전에 기하식을 시간에 대해 미분합니다.'
    },
    paragraphs: [
      {
        en: 'With ωᵢ = dθᵢ/dt, the second bob inherits the motion of the first link. The cosine coupling records the angle between the two velocity contributions.',
        ko: 'ωᵢ = dθᵢ/dt로 두면 두 번째 추는 첫 번째 링크의 운동을 함께 물려받습니다. 코사인 결합항은 두 속도 성분 사이의 각도를 나타냅니다.'
      }
    ],
    equations: [
      {
        id: 'speed-squared',
        label: { en: 'Squared speeds', ko: '속력의 제곱' },
        expression: 'v₁² = l₁²ω₁²\nv₂² = l₁²ω₁² + l₂²ω₂² + 2l₁l₂ω₁ω₂ cos(θ₁ − θ₂)',
        explanation: {
          en: 'The cross term is the kinematic coupling that later appears in the energy and mass matrix.',
          ko: '교차항은 이후 에너지와 질량행렬에 나타나는 운동학적 결합입니다.'
        }
      }
    ],
    links: ['derivations-document']
  },
  {
    id: 'energy',
    step: 4,
    title: { en: 'Kinetic and potential energy', ko: '운동에너지와 위치에너지' },
    summary: {
      en: 'Energy packages the geometry into a scalar model.',
      ko: '에너지는 기하 정보를 하나의 스칼라 모델로 묶습니다.'
    },
    paragraphs: [
      {
        en: 'Kinetic energy T follows from the two squared speeds. Potential energy V uses the upward-positive heights, so the hanging state has the lowest potential.',
        ko: '운동에너지 T는 두 속력의 제곱에서 얻습니다. 위치에너지 V는 위쪽이 양수인 높이를 사용하므로 아래로 늘어진 상태에서 가장 작습니다.'
      }
    ],
    equations: [
      {
        id: 'kinetic-energy',
        label: { en: 'Kinetic energy', ko: '운동에너지' },
        expression: 'T = ½m₁l₁²ω₁² + ½m₂[l₁²ω₁² + l₂²ω₂² + 2l₁l₂ω₁ω₂ cos(θ₁ − θ₂)]',
        explanation: {
          en: 'The second mass contributes to motion on both links.',
          ko: '두 번째 질량은 두 링크의 운동 모두에 기여합니다.'
        }
      },
      {
        id: 'potential-energy',
        label: { en: 'Potential energy', ko: '위치에너지' },
        expression: 'V = −(m₁ + m₂)gl₁ cos θ₁ − m₂gl₂ cos θ₂',
        explanation: {
          en: 'Adding a constant to V would not change the equations of motion.',
          ko: 'V에 상수를 더해도 운동방정식은 바뀌지 않습니다.'
        }
      }
    ],
    links: ['double-source']
  },
  {
    id: 'formulations',
    step: 5,
    title: { en: 'Lagrangian and Hamiltonian formulations', ko: '라그랑주와 해밀토니안 형식' },
    summary: {
      en: 'Describe the same idealized mechanics with velocities or momenta.',
      ko: '같은 이상화된 역학을 속도 또는 운동량으로 표현합니다.'
    },
    paragraphs: [
      {
        en: 'The Euler-Lagrange path starts from L = T − V and produces coupled equations for angular acceleration. The canonical path uses q = (θ₁, θ₂) and momentum p = M(q)ω.',
        ko: '오일러-라그랑주 경로는 L = T − V에서 시작해 각가속도 연립방정식을 얻습니다. 정준 경로는 q = (θ₁, θ₂)와 운동량 p = M(q)ω를 사용합니다.'
      },
      {
        en: 'For γ = 0 both formulations encode the same continuous model. Numerical trajectories can still differ because the state representation, stepper, tolerance, and finite precision differ.',
        ko: 'γ = 0일 때 두 형식은 같은 연속 모델을 나타냅니다. 다만 상태 표현, 적분기, 허용오차와 유한 정밀도 때문에 수치 궤적은 달라질 수 있습니다.'
      }
    ],
    equations: [
      {
        id: 'euler-lagrange',
        label: { en: 'Euler-Lagrange equation', ko: '오일러-라그랑주 방정식' },
        expression: 'L = T − V\nd/dt(∂L/∂ωᵢ) − ∂L/∂θᵢ = Qᵢ',
        explanation: {
          en: 'Qᵢ is zero for the conservative model and −γωᵢ for the implemented linear damping model.',
          ko: '보존 모델에서는 Qᵢ = 0이고 구현된 선형 감쇠 모델에서는 Qᵢ = −γωᵢ입니다.'
        }
      },
      {
        id: 'hamiltonian',
        label: { en: 'Canonical Hamiltonian', ko: '정준 해밀토니안' },
        expression: 'p = M(q)ω\nH(q,p) = ½pᵀM(q)⁻¹p + V(q)\nq̇ = ∂H/∂p,   ṗ = −∂H/∂q + Q',
        explanation: {
          en: 'The canonical implementation evaluates the analytic Hamiltonian gradient and an implicit midpoint step.',
          ko: '정준 구현은 해석적 해밀토니안 기울기와 암시적 중점 적분을 계산합니다.'
        }
      }
    ],
    links: ['canonical-source', 'derivations-document']
  },
  {
    id: 'mass-matrix-eom',
    step: 6,
    title: { en: 'Mass matrix and equations of motion', ko: '질량행렬과 운동방정식' },
    summary: {
      en: 'Solve one coupled 2 × 2 system for the angular accelerations.',
      ko: '각가속도를 구하기 위해 결합된 2 × 2 연립방정식을 풉니다.'
    },
    paragraphs: [
      {
        en: 'Let Δ = θ₁ − θ₂ and α = (dω₁/dt, dω₂/dt). The mass matrix contains the inertial coupling; the right-hand side contains centrifugal coupling, gravity, and damping.',
        ko: 'Δ = θ₁ − θ₂, α = (dω₁/dt, dω₂/dt)로 둡니다. 질량행렬에는 관성 결합이, 우변에는 원심 결합, 중력과 감쇠가 들어갑니다.'
      },
      {
        en: 'The implementation scales the matrix before solving and checks a norm-relative determinant, so unit rescaling alone does not decide whether the solve is safe.',
        ko: '구현은 풀이 전에 행렬을 스케일링하고 노름 상대 행렬식을 검사하므로 단위 스케일 변화만으로 풀이 안전성이 결정되지 않습니다.'
      }
    ],
    equations: [
      {
        id: 'mass-matrix',
        label: { en: 'Mass matrix', ko: '질량행렬' },
        expression: 'M(θ) = [ (m₁+m₂)l₁²          m₂l₁l₂ cos Δ ]\n       [ m₂l₁l₂ cos Δ          m₂l₂²       ]',
        explanation: {
          en: 'For positive masses and lengths, det M = m₂l₁²l₂²(m₁ + m₂ sin²Δ) is positive.',
          ko: '질량과 길이가 양수이면 det M = m₂l₁²l₂²(m₁ + m₂ sin²Δ)는 양수입니다.'
        }
      },
      {
        id: 'equations-of-motion',
        label: { en: 'Coupled acceleration solve', ko: '결합 각가속도 풀이' },
        expression:
          'M(θ)α = [ −m₂l₁l₂ sinΔ·ω₂² − (m₁+m₂)gl₁ sinθ₁ − γω₁ ]\n         [  m₂l₁l₂ sinΔ·ω₁² − m₂gl₂ sinθ₂ − γω₂       ]',
        explanation: {
          en: 'rhsDouble solves this system and returns (ω₁, ω₂, α₁, α₂).',
          ko: 'rhsDouble은 이 연립방정식을 풀어 (ω₁, ω₂, α₁, α₂)를 반환합니다.'
        }
      }
    ],
    links: ['double-source'],
    caveat: {
      en: 'Damping is a generalized torque inside the coupled solve, not an independent velocity decay applied after a step.',
      ko: '감쇠는 결합 풀이 안의 일반화 토크이며, 한 스텝 뒤 속도에 별도로 곱하는 감쇠가 아닙니다.'
    }
  },
  {
    id: 'numerical-representation',
    step: 7,
    title: { en: 'Numerical representation', ko: '수치 상태 표현' },
    summary: {
      en: 'Keep the physical model separate from the coordinates and integrator used to approximate it.',
      ko: '물리 모델과 이를 근사하는 좌표·적분기를 구분합니다.'
    },
    paragraphs: [
      {
        en: 'The live double-pendulum right-hand side uses x = [θ₁, θ₂, ω₁, ω₂]. The canonical backend uses z = [q₁, q₂, p₁, p₂], with q = θ and p = M(q)ω.',
        ko: '실시간 이중진자 우변은 x = [θ₁, θ₂, ω₁, ω₂]를 사용합니다. 정준 백엔드는 q = θ, p = M(q)ω인 z = [q₁, q₂, p₁, p₂]를 사용합니다.'
      },
      {
        en: 'A fixed or adaptive method, step size, tolerance, and floating-point precision belong to the numerical experiment. They are not new laws of motion.',
        ko: '고정/적응 적분법, 시간 간격, 허용오차와 부동소수점 정밀도는 수치 실험의 일부이지 새로운 운동 법칙이 아닙니다.'
      }
    ],
    equations: [
      {
        id: 'state-conversion',
        label: { en: 'State conversion', ko: '상태 변환' },
        expression: '[θ₁, θ₂, ω₁, ω₂] ⇄ [q₁, q₂, p₁, p₂]\nq = θ,   p = M(q)ω,   ω = M(q)⁻¹p',
        explanation: {
          en: 'The conversion is configuration-dependent because M depends on θ₁ − θ₂.',
          ko: 'M이 θ₁ − θ₂에 의존하므로 변환도 현재 자세에 의존합니다.'
        }
      }
    ],
    links: ['canonical-source', 'lab-workspace']
  },
  {
    id: 'validation-evidence',
    step: 8,
    title: { en: 'Validation and evidence', ko: '검증과 근거' },
    summary: {
      en: 'A plausible animation is not, by itself, evidence that the calculation is correct.',
      ko: '그럴듯한 애니메이션만으로 계산이 옳다고 판단할 수는 없습니다.'
    },
    paragraphs: [
      {
        en: 'The validation ladder checks energy behavior, time-step refinement, small-angle normal modes, analytic derivatives, replay determinism, and independent SciPy or SymPy references.',
        ko: '검증 단계는 에너지 거동, 시간 간격 세분화, 소각도 고유모드, 해석적 미분, 재생 결정성과 독립 SciPy·SymPy 기준을 확인합니다.'
      },
      {
        en: 'For chaotic motion, long trajectories separate exponentially even when both computations are sound. Compare short-horizon agreement, convergence, invariants, and uncertainty instead of demanding bitwise equality forever.',
        ko: '카오스 운동에서는 두 계산이 모두 타당해도 긴 궤적이 지수적으로 벌어집니다. 영구적인 비트 단위 일치 대신 짧은 구간 일치, 수렴성, 불변량과 불확실성을 비교합니다.'
      }
    ],
    equations: [],
    links: ['validation-workspace', 'trust-validation', 'invariant-tests', 'reference-tests'],
    caveat: {
      en: 'A passing badge applies only to its stated model, parameters, horizon, tolerance, platform, and evidence date.',
      ko: '통과 배지는 명시된 모델, 매개변수, 시간 구간, 허용오차, 플랫폼과 근거 날짜 범위에서만 유효합니다.'
    }
  },
  {
    id: 'implemented-in',
    step: 9,
    title: { en: 'From equation to implementation', ko: '수식에서 구현으로' },
    summary: {
      en: 'Trace the model into code, run it, and then inspect its evidence.',
      ko: '모델을 코드까지 추적하고 실행한 뒤 그 근거를 검토합니다.'
    },
    paragraphs: [
      {
        en: 'The explicit θ–ω right-hand side, energy, and analytic Jacobian live in double.ts. Canonical transforms and the Hamiltonian path live in canonical.ts. The derivation and tests remain separate evidence, not hidden implementation details.',
        ko: '명시적 θ–ω 우변, 에너지와 해석적 야코비안은 double.ts에 있습니다. 정준변환과 해밀토니안 경로는 canonical.ts에 있습니다. 유도 문서와 테스트는 숨겨진 구현 세부사항이 아니라 별도의 근거입니다.'
      }
    ],
    equations: [],
    links: ['double-source', 'canonical-source', 'derivations-document', 'lab-workspace', 'trust-provenance']
  }
];

export function normalizeTheoryLocale(value: unknown): TheoryLocale {
  return value === 'ko' ? 'ko' : 'en';
}

export function theoryText(text: TheoryLocalizedText, locale: TheoryLocale): string {
  return text[locale];
}

export function theorySection(id: TheorySectionId): TheorySection {
  const section = THEORY_SECTIONS.find((candidate) => candidate.id === id);
  if (!section) throw new Error(`Unknown theory section: ${id}`);
  return section;
}
