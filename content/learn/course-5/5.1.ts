import { authorChaosLesson } from '../../../src/product/learn/authoring-course-five';

export default authorChaosLesson({
  id: '5.1',
  title: ['상태공간·위상공간과 궤적 기하', 'State space, phase space and trajectory geometry'],
  question: [
    '한 run의 그림이 세 가지로 보이면 서로 다른 운동일까요? 구성공간, 각도·각속도 투영, 지연 좌표를 같은 기록에서 비교합니다.',
    'Do three pictures of one run imply three motions? Compare configuration, angle–velocity projection and delay coordinates from the same observations.'
  ],
  prerequisites: [
    '고정 지지점의 질점 이중진자, rad·rad/s·s를 사용합니다. theta1,theta2만으로 속도와 미래가 결정되지 않습니다. 과도구간과 지연 표본 수를 구분하세요.',
    'Use a point-mass double pendulum with a fixed pivot, in rad, rad/s and s. Two angles alone do not determine velocity or the future. Distinguish transient time from delay sample count.'
  ],
  objectives: [
    [
      '같은 실제 궤적의 구성공간과 상태공간 투영을 구별합니다.',
      'Distinguish configuration space from a state-space projection of the same trajectory.'
    ],
    [
      '지연과 embedding 차원이 잃는 표본과 기하에 미치는 영향을 설명합니다.',
      'Explain how delay and embedding dimension affect geometry and available points.'
    ]
  ],
  concepts: [
    {
      title: ['상태를 닫는 변수', 'Variables that close the state'],
      body: [
        '상태는 운동을 이어 계산하는 데 필요한 정보입니다. 이중진자는 두 각도와 두 각속도로 4차원 상태를 이룹니다. 두 각도만 그리면 같은 위치를 다른 속도로 지나는 점이 겹치므로 그림의 교차가 동역학의 비유일성을 뜻하지 않습니다.',
        'A state contains the information needed to continue the motion. Two angles and two angular velocities form a four-dimensional state. A plot of angles can overlap at different velocities; crossing curves do not imply nonunique dynamics.'
      ]
    },
    {
      title: ['위상공간과 투영', 'Phase space and projection'],
      body: [
        '정준 위상공간은 좌표와 정준 운동량을 사용합니다. 이 실험의 theta1–omega1 그림은 관측 상태의 2차원 투영입니다. 각속도는 결합 질량행렬을 거친 운동량과 다르므로 그림 면적을 Liouville 부피로 해석하지 않습니다.',
        'Canonical phase space uses coordinates and canonical momenta. The theta1–omega1 picture here is a two-dimensional state projection. Angular velocity differs from momentum coupled through the mass matrix, so its area is not automatically a Liouville volume.'
      ]
    },
    {
      title: ['지연 좌표를 만드는 순서', 'Constructing delay coordinates'],
      body: [
        '단일 관측 theta1을 선택하고 일정한 관측 간격으로 기록합니다. 현재 값과 delay개 뒤 값을 짝지으면 앞방향 지연 점군을 얻습니다. 차원을 하나 늘릴 때마다 끝에서 delay개 표본을 더 잃습니다. 이 연산은 기존 delayEmbed를 호출하며 새로운 운동방정식을 만들지 않습니다.',
        'Select theta1 at uniform observation intervals. Pair each value with one delay samples later to obtain forward-delay points. Each extra dimension loses another delay samples at the end. The existing delayEmbed function constructs these points without adding equations of motion.'
      ]
    },
    {
      title: ['실패 예제와 다음 탐구', 'Failure example and next inquiry'],
      body: [
        '상수 관측이나 너무 작은 지연은 거의 직선인 점군을 만듭니다. 긴 지연과 짧은 기록은 점을 부족하게 만듭니다. 보기 좋은 고리만으로 원래 상태가 복원되었다고 단정하지 말고 5.2에서 같은 기록의 시간·주파수 정보를 함께 확인합니다.',
        'A constant observable or a very short delay produces a nearly collapsed point cloud. Long delays and short records leave too few points. An attractive loop does not establish state reconstruction; in 5.2, inspect time and frequency information from the same record.'
      ]
    }
  ],
  equations: [
    {
      title: ['1. 관측 시각의 지연', '1. Delay in observation time'],
      expression: 'delayTime = delaySamples*sampleInterval',
      explanation: [
        '지연 표본 수에 실제 관측 시간 간격을 곱하면 초 단위 지연입니다. 적분 step과 관측 간격은 기록 stride가 있으면 다릅니다.',
        'Multiply the delay sample count by the actual observation interval to obtain seconds. With a recording stride, this interval differs from the integration step.'
      ],
      symbols: [
        ['delayTime', 's', '물리적 지연', 'Physical delay'],
        ['delaySamples', '1', '지연 표본 수', 'Delay sample count'],
        ['sampleInterval', 's', '실제 관측 간격', 'Actual observation interval']
      ]
    },
    {
      title: ['2. 사용 가능한 지연 점 수', '2. Available delay points'],
      expression: 'embeddedCount = sampleCount-(dimension-1)*delaySamples',
      explanation: [
        '차원1에서는 모든 표본을 쓰며 추가 차원마다 지연 길이만큼 감소합니다. 결과가 양수여야 하고 기하 분석은 더 많은 점을 요구합니다.',
        'Dimension one retains every sample; each extra dimension removes one delay length. The result must be positive, and geometry estimators require additional points.'
      ],
      symbols: [
        ['embeddedCount', '1', '사용 가능한 지연 점 수', 'Available delay points'],
        ['sampleCount', '1', '원 관측 표본 수', 'Original sample count'],
        ['dimension', '1', 'embedding 차원', 'Embedding dimension'],
        ['delaySamples', '1', '지연 표본 수', 'Delay sample count']
      ]
    }
  ],
  term: ['관측 투영', 'Observation projection'],
  definition: [
    '전체 상태의 일부 좌표만 표시한 그림입니다. 그림의 겹침과 전체 궤적의 만남은 다릅니다.',
    'A picture showing selected coordinates of the complete state; overlap in the picture differs from intersection of full trajectories.'
  ],
  checks: [
    {
      prompt: ['theta1–omega1 곡선의 교차가 뜻하는 것은?', 'What does a crossing in theta1–omega1 show?'],
      correct: [
        '다른 숨은 좌표가 같은 투영점에 놓일 수 있습니다.',
        'Different hidden coordinates can share one projected point.'
      ],
      wrong: ['같은 전체 상태에서 두 미래가 반드시 존재합니다.', 'Two futures must exist at one complete state.'],
      explanation: [
        'theta2와 omega2를 버린 투영이므로 전체 상태의 교차를 보장하지 않습니다.',
        'Discarding theta2 and omega2 means a projected crossing need not be a full-state crossing.'
      ]
    },
    {
      prompt: ['delay가 커지면 사용 가능한 점 수는?', 'What happens to usable point count as delay grows?'],
      correct: ['같은 길이 기록에서는 감소합니다.', 'It decreases for a record of fixed length.'],
      wrong: ['항상 그대로입니다.', 'It always remains unchanged.'],
      explanation: [
        '고정 차원에서 끝부분의 지연 좌표를 구성할 수 없는 표본이 늘어납니다.',
        'At fixed dimension, more final samples lack the required delayed coordinates.'
      ]
    }
  ],
  task: {
    prediction: [
      'delay를 6에서 12로 바꾸면 고리와 점 수가 어떻게 달라질까요?',
      'How will the loop and point count change when delay goes from 6 to 12?'
    ],
    action: [
      '기본 run을 실행하고 세 투영을 읽은 뒤 delay만 바꾸어 반복합니다. 같은 run의 관측 표와 embeddedCount를 대조하세요.',
      'Run the default setup, inspect all three projections, then change only delay. Compare the observation table with embeddedCount.'
    ],
    expected: [
      '2차원 embedding에서 점 수는 원 표본 수-delay입니다. delay를 6 늘리면 정확히 6개 줄고 원 run의 물리 표본은 같습니다.',
      'For dimension two, embedded count equals sample count minus delay. Increasing delay by 6 removes exactly 6 points while the physical observations remain unchanged.'
    ],
    explanation: [
      '그림 변화는 관측 좌표 선택의 변화이며 새 힘이 추가된 결과가 아닙니다.',
      'The changed picture follows from coordinate selection, without adding a physical force.'
    ]
  },
  source: {
    title: ['Grassberger–Procaccia algorithm', 'Grassberger–Procaccia algorithm'],
    authors: 'Peter Grassberger',
    url: 'https://www.scholarpedia.org/article/Grassberger-Procaccia_algorithm',
    locator: [
      '저자 해설의 Main Application과 지연 벡터 식(3), 정상성과 유한 표본의 전제를 대조했습니다.',
      'Checked the author discussion under Main Application, delay-vector equation (3), stationarity and finite-sample assumptions.'
    ]
  }
});
