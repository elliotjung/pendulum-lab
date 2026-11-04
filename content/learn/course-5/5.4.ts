import { authorChaosLesson } from '../../../src/product/learn/authoring-course-five';

export default authorChaosLesson({
  id: '5.4',
  title: ['Poincaré 단면과 return map', 'Poincaré sections and return maps'],
  question: [
    '계속 움직이는 궤적을 같은 문턱에서만 관찰하면 무엇이 남을까요? 첫 각도의 상향·하향 교차와 연속 교차의 return map을 비교합니다.',
    'What remains when a continuous trajectory is observed only at one threshold? Compare rising and falling first-angle crossings and successive returns.'
  ],
  prerequisites: [
    '매끄러운 연속 이중진자와 theta1 단면을 사용합니다. 사건 교차는 균일 시간 sampling과 다르며 단면 방향·좌표·기간이 실험 정의의 일부입니다.',
    'Use a smooth continuous double pendulum and a theta1 section. Event crossings differ from uniform time sampling; direction, coordinate and duration belong to the experiment definition.'
  ],
  objectives: [
    [
      '횡단 조건과 교차 방향을 명시하여 단면을 정의합니다.',
      'Define a section with transversality and crossing direction.'
    ],
    [
      '단면 점집합과 return map의 해석·유한 관찰 한계를 설명합니다.',
      'Interpret section points and return maps with finite-observation limitations.'
    ]
  ],
  concepts: [
    {
      title: ['시간을 교차 순서로 바꾸기', 'Replacing time with crossing order'],
      body: [
        '단면 함수h가0이고 궤적이 한 방향으로 가로지를 때 상태를 기록합니다. 일반적인 횡단은 시간 도함수가0이 아닌 사건입니다. 같은 위치에 접하기만 하는 경우에는 다음 교차의 정의와 root 정확도가 불안정할 수 있습니다.',
        'Record a state when a section functionh vanishes in a chosen direction. A transverse crossing has a nonzero time derivative. A grazing contact can make the next return and root location ill-conditioned.'
      ]
    },
    {
      title: ['점집합에서 return 규칙으로', 'From point sets to a return rule'],
      body: [
        '같은 방향의 연속 교차를n과n+1로 짝짓습니다. 주기궤도는 유한 점, 준주기 운동은 곡선, 카오스는 복잡한 집합으로 나타날 수 있지만 이 대응에는 적절한 단면과 충분한 관찰이 필요합니다. 한 장의 적은 점으로 모든 regime을 판정하지 않습니다.',
        'Pair successive crossings of the same direction. Periodic motion can yield finitely many points, quasiperiodic motion curves and chaos more complex sets, but this requires a suitable section and sufficient observations. A sparse picture cannot classify every regime.'
      ]
    },
    {
      title: ['실제 사건 검출', 'Actual event detection'],
      body: [
        '공용 Poincaré 분석은 원 초기조건에서 별도로 RK4 적분하고 step 내부 root를 정밀화합니다. 기록된 점 사이를 단순히 직선으로 잇는 계산이 아닙니다. root 잔차가 작아도 전체 적분해의 오차가 작다는 보증은 아닙니다.',
        'The shared Poincaré analysis reintegrates from the original initial state with RK4 and refines within-step roots. It does not simply interpolate the stored observations. A small root residual does not certify the full integration error.'
      ]
    },
    {
      title: ['실패 예제와 다음 탐구', 'Failure example and next inquiry'],
      body: [
        '선택한 문턱에 도달하지 않으면 교차 0개가 정상 결과입니다. 양·음 방향을 섞거나 transient 처리를 바꾸면 다른 return 규칙을 비교하게 됩니다. 5.5에서 단면의 인상과 독립 접선 성장률이 일치하는지 확인합니다.',
        'Zero crossings can be a valid result when the threshold is never reached. Mixing directions or changing transient handling changes the return rule. In 5.5, compare geometric impressions with an independent tangent-growth estimate.'
      ]
    }
  ],
  equations: [
    {
      title: ['1. 첫 각도의 단면 함수', '1. First-angle section function'],
      expression: 'section = theta1-sectionAngle',
      explanation: [
        '두 각도를 같은rad 단위로 뺀 값이0인 순간을 찾습니다. 상향 사건은 이 함수의 시간 도함수가 양수인 경우입니다.',
        'Find zeros of the angular difference in radians. A rising event has a positive time derivative.'
      ],
      symbols: [
        ['section', 'rad', '단면 함수', 'Section function'],
        ['theta1', 'rad', '첫 각도', 'First angle'],
        ['sectionAngle', 'rad', '단면 문턱', 'Section threshold']
      ]
    },
    {
      title: ['2. 교차 사이의 돌아오는 시간', '2. Time between returns'],
      expression: 'returnTime = nextCrossing-currentCrossing',
      explanation: [
        '같은 방향의 연속 교차시각 차이는 초 단위 return time입니다. 처음 교차와 다음 교차가 실제로 존재할 때만 정의됩니다.',
        'The difference of successive same-direction crossing times is a return time in seconds, defined only when both crossings exist.'
      ],
      symbols: [
        ['returnTime', 's', '돌아오는 시간', 'Return time'],
        ['nextCrossing', 's', '다음 교차시각', 'Next crossing time'],
        ['currentCrossing', 's', '현재 교차시각', 'Current crossing time']
      ]
    }
  ],
  term: ['횡단 단면', 'Transverse section'],
  definition: [
    '흐름이 접하지 않고 가로지르는 국소 관찰 면입니다.',
    'A local observation surface crossed by the flow rather than touched tangentially.'
  ],
  checks: [
    {
      prompt: ['단면에 도달하지 않으면 교차 0개는?', 'Are zero crossings invalid when the section is never reached?'],
      correct: [
        '기간과 문턱에 따른 유효한 빈 결과입니다.',
        'They are a valid empty result for that duration and threshold.'
      ],
      wrong: ['카오스가 없다는 증명입니다.', 'They prove absence of chaos.'],
      explanation: [
        '교차의 부재와 동역학의 분류는 다릅니다.',
        'Absence of a crossing differs from a dynamical classification.'
      ]
    },
    {
      prompt: [
        '상향·하향 점을 섞어도 같은 return map인가요?',
        'Does mixing rising and falling crossings preserve the return map?'
      ],
      correct: ['방향은 단면 정의의 일부여서 달라집니다.', 'Direction belongs to the definition, so the map changes.'],
      wrong: ['문턱만 같으면 항상 같습니다.', 'The threshold alone makes it identical.'],
      explanation: ['연속 관찰 순서와 되돌아오는 규칙이 바뀝니다.', 'The observation sequence and return rule change.']
    }
  ],
  task: {
    prediction: [
      'sectionValue를 0에서 0.3 rad로 옮기면 교차 수와 점집합이 같을까요?',
      'Will moving sectionValue from 0 to 0.3 rad preserve crossing count and geometry?'
    ],
    action: [
      '기본 run에서 상향·하향 표와 return map을 읽고 문턱만 바꿉니다. 기간을 늘린 결과와도 비교하세요.',
      'Inspect rising and falling tables and the return map, then change only the threshold. Also compare a longer duration.'
    ],
    expected: [
      '같은 설정은 교차시각·상태가1e-10 이내로 재현됩니다. 문턱을 바꾸면 교차 수는 달라질 수 있으며 점이 2개 미만이면 return map을 만들지 않습니다.',
      'Repeated settings reproduce crossing times and states within 1e-10. Changing the threshold can change count; fewer than two points cannot form a return map.'
    ],
    explanation: [
      '단면은 동역학을 보는 관측 규칙이며 기간과 조건을 함께 보존해야 합니다.',
      'A section is an observation rule whose duration and conditions must be preserved.'
    ]
  },
  source: {
    title: ['Symplectic maps — Poincaré section', 'Symplectic maps — Poincaré section'],
    authors: 'Christophe Golé',
    url: 'https://www.scholarpedia.org/article/Symplectic_maps',
    locator: [
      '저자 해설의 Historical Motivation/Poincaré Section에서 횡단면·first return 정의와 Hamiltonian 면적 보존의 조건을 대조했습니다.',
      'Checked transverse sections, first returns and conditions for Hamiltonian area preservation in the author section Historical Motivation/Poincaré Section.'
    ]
  }
});
