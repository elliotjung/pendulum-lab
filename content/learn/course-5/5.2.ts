import { authorChaosLesson } from '../../../src/product/learn/authoring-course-five';

export default authorChaosLesson({
  id: '5.2',
  title: ['시계열·스펙트럼·FFT의 해석', 'Interpreting time series, spectra and FFT'],
  question: [
    '넓은 peak는 카오스일까요, 짧게 관찰한 주기 신호일까요? 같은 run의 직사각·Hann 창과 실제 관측 길이를 비교합니다.',
    'Does a broad peak indicate chaos, or a periodic signal observed briefly? Compare rectangular and Hann windows on one run and inspect the actual observation length.'
  ],
  prerequisites: [
    '균일 간격의 theta1 기록, Hz와 rad/s의 차이, 적분 간격과 기록 간격을 구분합니다. 평균을 제거한 단측 진폭이며 raw power density가 아닙니다.',
    'Use uniformly sampled theta1 and distinguish Hz from rad/s and integration from recording intervals. The output is a mean-removed, one-sided amplitude spectrum, rather than raw power density.'
  ],
  objectives: [
    ['Nyquist 한계와 유한 길이 분해능을 계산합니다.', 'Calculate Nyquist limits and finite-record resolution.'],
    [
      '창 함수의 leakage 감소와 peak 폭·진폭 보정의 관계를 설명합니다.',
      'Explain leakage suppression, peak broadening and amplitude correction from windowing.'
    ]
  ],
  concepts: [
    {
      title: ['sampling이 만드는 상한', 'Sampling imposes an upper frequency'],
      body: [
        '기록 간격이 deltaT이면 sampling 주파수는 1/deltaT입니다. 이산 기록에서 그 절반보다 빠른 성분은 낮은 주파수로 alias될 수 있습니다. 적분기가 작은 step으로 계산해도 저장 간격이 크면 잃은 대역을 FFT로 되찾을 수 없습니다.',
        'At recording interval deltaT, sampling frequency is 1/deltaT. Components beyond half that frequency can alias to lower frequencies. Small integration steps do not recover a frequency band discarded by coarse recording.'
      ]
    },
    {
      title: ['유한 구간과 창', 'Finite records and windows'],
      body: [
        '관측을 유한하게 자르면 실제 신호에 창을 곱한 것과 같습니다. 구간 양끝이 맞지 않는 주기 신호는 여러 주파수 칸으로 퍼집니다. Hann 창은 끝을 줄여 leakage를 완화하지만 peak를 넓힐 수 있어 가까운 성분의 분리를 자동 보장하지 않습니다.',
        'Truncation multiplies the signal by a window. A periodic signal whose endpoints do not match spreads into multiple frequency bins. Hann tapering reduces endpoint leakage but can broaden peaks, so it does not automatically separate close components.'
      ]
    },
    {
      title: ['진폭과 zero padding', 'Amplitude and zero padding'],
      body: [
        '공용 분석은 평균을 빼고 창을 적용한 뒤 coherent gain으로 보정한 단측 진폭을 표시합니다. 0 채움은 FFT 길이를 늘려 그림을 촘촘하게 하지만 새로운 관측을 만들지 않습니다. 실제 주파수 분해능은 원 표본 수와 기록 간격에 제한됩니다.',
        'The shared analysis removes the mean, applies the selected window and reports one-sided amplitudes corrected by coherent gain. Zero padding densifies the frequency grid without creating observations. Resolution remains constrained by the original sample count and interval.'
      ]
    },
    {
      title: ['실패 예제와 다음 탐구', 'Failure example and next inquiry'],
      body: [
        '불균일한 마지막 기록 간격은 자동 보간하지 않고 거부합니다. 넓은 스펙트럼만으로 결정론적 카오스와 잡음을 구별할 수 없습니다. 기간을 늘려 peak가 어떻게 바뀌는지 확인한 뒤 5.3에서 FFT 칸 사이의 주파수 추정을 비교합니다.',
        'A shortened final interval is rejected without silent interpolation. A broad spectrum cannot distinguish deterministic chaos from noise by itself. Extend the record and inspect peak changes before comparing off-bin frequency estimates in5.3.'
      ]
    }
  ],
  equations: [
    {
      title: ['1. Nyquist 한계', '1. Nyquist limit'],
      expression: 'nyquist = 1/(2*sampleInterval)',
      explanation: [
        '한 주기를 두 표본보다 적게 기록하는 대역은 유일하게 복원할 수 없습니다. 이 수는 sampling의 상한이며 관측 신호가 그 아래에 있음을 보증하지 않습니다.',
        'Frequencies with fewer than two observations per cycle cannot be uniquely reconstructed. The limit describes sampling, without certifying that the signal lies below it.'
      ],
      symbols: [
        ['nyquist', 'Hz', 'Nyquist 주파수', 'Nyquist frequency'],
        ['sampleInterval', 's', '실제 기록 간격', 'Actual recording interval']
      ]
    },
    {
      title: ['2. 원 기록의 주파수 척도', '2. Frequency scale of the original record'],
      expression: 'frequencyScale = 1/(sampleCount*sampleInterval)',
      explanation: [
        '원 표본 수와 간격의 곱으로 정해지는 주파수 척도입니다. 창 함수에 따른 유효 peak 폭은 별도이며 0 채움 길이로 원 관측 분해능을 주장하지 않습니다.',
        'This scale uses the original sample count times the recording interval. Window-dependent peak width is separate; padded length cannot establish physical resolution.'
      ],
      symbols: [
        ['frequencyScale', 'Hz', '원 관측의 주파수 척도', 'Original-record frequency scale'],
        ['sampleCount', '1', '원 표본 수', 'Original sample count'],
        ['sampleInterval', 's', '기록 간격', 'Recording interval']
      ]
    }
  ],
  term: ['spectral leakage', 'Spectral leakage'],
  definition: [
    '유한 창 때문에 한 성분의 진폭이 여러 주파수 칸에 퍼지는 현상입니다.',
    'Spreading of a component across frequency bins due to a finite observation window.'
  ],
  checks: [
    {
      prompt: [
        '0 채움을 두 배로 하면 실제 관측 분해능은?',
        'What happens to actual resolution after doubling zero padding?'
      ],
      correct: ['원 관측이 같으면 늘지 않습니다.', 'It does not improve when observations are unchanged.'],
      wrong: ['두 배 정확해집니다.', 'It becomes twice as accurate.'],
      explanation: [
        '0 채움은 표시 주파수 격자를 촘촘하게 할 뿐입니다.',
        'Zero padding only densifies the displayed frequency grid.'
      ]
    },
    {
      prompt: ['Hann 창이 넓은 peak를 만들면 카오스인가요?', 'Does a broad Hann-window peak establish chaos?'],
      correct: ['유한 구간·창·잡음을 먼저 확인합니다.', 'First check finite length, windowing and noise.'],
      wrong: ['넓으면 항상 카오스입니다.', 'A broad peak always means chaos.'],
      explanation: [
        '스펙트럼 형태에는 동역학과 관측 처리의 영향이 함께 있습니다.',
        'Spectral shape combines dynamics with observation processing.'
      ]
    }
  ],
  task: {
    prediction: [
      '관측 기간을 늘리면 peak의 위치와 폭 중 무엇이 안정될까요?',
      'Which will stabilize as duration increases: peak position, width, or both?'
    ],
    action: [
      '기본 run의 두 창을 비교하고 duration만 8에서 16으로 늘립니다. 실제 표본 수, Nyquist와 peak 주변 폭을 기록하세요.',
      'Compare both windows, then change only duration from 8 to 16. Record actual sample count, Nyquist and peak width.'
    ],
    expected: [
      '같은 기록 간격이면 Nyquist는 1e-12 Hz 이내에서 같고 기간이 길수록 1/(N deltaT)는 작아집니다. 창에 따른 peak 차이는 남을 수 있습니다.',
      'At the same interval, Nyquist agrees within 1e-12 Hz, while 1/(N deltaT) decreases with longer duration. Window-dependent peak differences can remain.'
    ],
    explanation: [
      '시간 대역폭과 sampling 대역폭은 서로 다른 제약입니다.',
      'Observation duration and sampling bandwidth impose different constraints.'
    ]
  },
  source: {
    title: ['SciPy Signal Processing — Spectral Analysis', 'SciPy Signal Processing — Spectral Analysis'],
    authors: 'SciPy contributors',
    url: 'https://docs.scipy.org/doc/scipy/tutorial/signal.html#spectral-analysis',
    locator: [
      '공식 Spectral Analysis의 유한 구간 leakage, 단측 진폭, 식(7)의 창 적용과 coherent gain 보정·주엽과 부엽의 절충을 대조했습니다.',
      'Checked finite-record leakage, one-sided amplitudes, windowing and coherent-gain correction in equation (7), and the main-lobe/side-lobe trade-off in the official Spectral Analysis tutorial.'
    ]
  }
});
