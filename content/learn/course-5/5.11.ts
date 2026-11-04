import { authorChaosLesson } from '../../../src/product/learn/authoring-course-five';

export default authorChaosLesson({
  id: '5.11',
  title: ['recurrence network 분석', 'Recurrence network analysis'],
  question: [
    '재귀 그림을 그래프로 읽으면 어떤 기하를 얻을까요? 같은 지연 점군에서 목표 재귀율을 바꾸어 차수·군집·transitivity·연결성분을 비교합니다.',
    'What geometry emerges when a recurrence plot is read as a graph? Vary target recurrence rate on the same delay points and compare degree, clustering, transitivity and components.'
  ],
  prerequisites: [
    '각 지연점은 시간순 표본의 정점이고 가까운 쌍은 무방향 간선입니다. 자기연결과 |i-j|가 Theiler 이하인 연결을 제외합니다. 최대 256점의 제한된 조밀 그래프입니다.',
    'Each delay point is a sampled vertex and nearby pairs form undirected edges. Exclude self-links and pairs with |i-j| at most the Theiler window. This bounded dense graph contains at most 256 points.'
  ],
  objectives: [
    ['재귀 행렬을 단순 무방향 그래프로 변환합니다.', 'Translate a recurrence matrix into a simple undirected graph.'],
    [
      '차수·군집·경로 통계의 threshold·유한 표본 의존성을 설명합니다.',
      'Explain threshold and finite-sample dependence of degree, clustering and path statistics.'
    ]
  ],
  concepts: [
    {
      title: ['시간순 표본에서 그래프 이웃으로', 'From temporal samples to graph neighbors'],
      body: [
        '간선은 시간상 다음 점이라는 뜻이 아니라 상태공간에서 가깝다는 뜻입니다. 자기 재귀와 가까운 시간 이웃을 제외한 행렬을 공용 네트워크 함수로 전달합니다. 원래 시간의 방향이나 인과성을 간선 방향으로 꾸며내지 않습니다.',
        'An edge denotes state-space proximity rather than the next time point. After removing self-recurrence and temporal neighbors, the shared network routine evaluates the matrix. The graph does not invent direction or causality.'
      ]
    },
    {
      title: ['차수와 밀도', 'Degree and density'],
      body: [
        '한 정점의 차수는 연결된 이웃 수입니다. 간선 수를 전체 가능한 무방향 쌍 수로 나누면 밀도입니다. 목표 재귀율이 같아도 거리 동률과 Theiler 제외 때문에 밀도가 같지 않을 수 있어 실제 밀도와 epsilon을 함께 보존합니다.',
        'A vertex degree counts its neighbors. Density divides edges by possible undirected pairs. Tied distances and Theiler exclusions can produce different graph densities at equal target rates; preserve actual density and epsilon.'
      ]
    },
    {
      title: ['군집과 경로의 범위', 'Scope of clustering and paths'],
      body: [
        '군집과 transitivity는 이웃 사이의 삼각형 구조를 봅니다. 평균 경로 길이는 공용 함수가 최대 연결성분 안에서 평가하며 고립점에서는 0입니다. 작은 평균 경로가 전체 점군의 연결을 뜻하지 않으므로 성분 크기와 함께 읽습니다.',
        'Clustering and transitivity describe triangular neighbor structures. Native average path length is evaluated within the largest connected component and is 0 for an isolated point. A small path statistic does not mean the full graph is connected; inspect component size.'
      ]
    },
    {
      title: ['실패 예제와 다음 탐구', 'Failure example and next inquiry'],
      body: [
        '작은 epsilon은 그래프를 끊고 큰 epsilon은 거의 완전 그래프를 만듭니다. 높은 군집만으로 차원이나 카오스를 확정하지 않습니다. 5.12에서 같은 점군을 여러 거리 척도로 나누어 차원을 직접 추정하고 적합 범위를 검사합니다.',
        'Small epsilon disconnects a graph; large epsilon can make it nearly complete. High clustering alone does not establish dimension or chaos. In 5.12, evaluate distance scaling and inspect the dimension fitting range.'
      ]
    }
  ],
  equations: [
    {
      title: ['1. 무방향 간선의 가능한 쌍', '1. Possible undirected pairs'],
      expression: 'possibleEdges = nodes*(nodes-1)/2',
      explanation: [
        '서로 다른 정점 쌍을 두 번 세지 않고 자기연결을 제외합니다. 시간 이웃 제외를 포함한 실제 간선 수는 이 값 이하입니다.',
        'Count distinct pairs once without self-links. Actual edges, including temporal-neighbor exclusions, cannot exceed this number.'
      ],
      symbols: [
        ['possibleEdges', '1', '가능한 무방향 쌍 수', 'Possible undirected pair count'],
        ['nodes', '1', '정점 수', 'Node count']
      ]
    },
    {
      title: ['2. 그래프 밀도', '2. Graph density'],
      expression: 'density = edges/possibleEdges',
      explanation: [
        '간선 수를 가능한 쌍 수로 나누는 무차원 비율입니다. 재귀율과 그래프 밀도는 대각선·Theiler 규칙이 다르면 수치가 다를 수 있습니다.',
        'Divide edges by possible pairs. Recurrence rate and graph density can differ when diagonal and Theiler conventions differ.'
      ],
      symbols: [
        ['density', '1', '그래프 밀도', 'Graph density'],
        ['edges', '1', '실제 간선 수', 'Actual edge count'],
        ['possibleEdges', '1', '가능한 쌍 수', 'Possible pair count']
      ]
    }
  ],
  term: ['재귀 간선', 'Recurrence edge'],
  definition: [
    '시간의 앞뒤가 아니라 정해진 거리 이하의 두 상태를 연결하는 무방향 관계입니다.',
    'An undirected proximity relation between states rather than a forward-time connection.'
  ],
  checks: [
    {
      prompt: [
        '평균 경로가 짧으면 모든 정점이 연결됐나요?',
        'Does a short average path imply all vertices are connected?'
      ],
      correct: ['최대 연결성분의 크기도 확인해야 합니다.', 'Check the largest component size as well.'],
      wrong: ['항상 전체가 연결됩니다.', 'The whole graph is always connected.'],
      explanation: [
        '공용 평균 경로는 최대 연결성분 안에서 계산합니다.',
        'The native path statistic is computed within the largest component.'
      ]
    },
    {
      prompt: ['재귀 간선은 인과 방향을 뜻하나요?', 'Does a recurrence edge indicate causal direction?'],
      correct: ['대칭적인 상태 근접 관계입니다.', 'It is a symmetric state-proximity relation.'],
      wrong: ['원인이 결과를 가리킵니다.', 'It points from cause to effect.'],
      explanation: [
        '시간순서와 상태공간의 이웃은 다른 관계입니다.',
        'Temporal order and state-space neighborhood are distinct relations.'
      ]
    }
  ],
  task: {
    prediction: [
      '목표 재귀율을 늘리면 정점 수·간선 수 중 무엇이 변할까요?',
      'Which changes when target recurrence rises: nodes or edges?'
    ],
    action: [
      '현재 목표율과 1.5배 목표율의 실제 epsilon·밀도·성분 통계를 비교합니다. Delay를 바꾸면 점군 자체도 바뀜을 기록하세요.',
      'Compare actual epsilon, density and component statistics at the current and 1.5-times target rates. Record that changing delay also changes the point cloud.'
    ],
    expected: [
      '같은 점군에서는 정점 수가 같고 큰 epsilon의 간선 수는 줄지 않아야 합니다. 군집계수와 경로 길이의 단조 변화는 보장하지 않습니다.',
      'For the same point cloud, node count stays fixed and edges cannot decrease at a larger epsilon. Clustering and path length need not vary monotonically.'
    ],
    explanation: [
      '문턱만 바꾼 효과와 재구성 자료 자체의 변화를 분리합니다.',
      'Separate threshold effects from changes in the reconstructed data.'
    ]
  },
  source: {
    title: [
      'Recurrence networks — A novel paradigm for nonlinear time series analysis',
      'Recurrence networks — A novel paradigm for nonlinear time series analysis'
    ],
    authors: 'Reik V. Donner, Y. Zou, Jonathan F. Donges, Norbert Marwan, Jürgen Kurths',
    url: 'https://arxiv.org/abs/0908.3447',
    locator: [
      '재귀 행렬의 adjacency 해석과 기하·밀도·군집 통계를 저자 원문과 대조했습니다. 제품의 Theiler 제외·최대 연결성분 경로 규칙은 보존된 소스에서 별도로 확인했습니다.',
      'Checked recurrence adjacency, geometry, density and clustering in the author paper. Product Theiler exclusions and largest-component path conventions are checked separately against preserved source.'
    ]
  }
});
