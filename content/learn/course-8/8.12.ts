import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '8.12',
  summary: [
    '연구 질문에서 실제 기록·그림·보고서·정적 reviewer까지 이어지는 검증 가능한 ZIP을 완성합니다.',
    'Complete a verifiable ZIP connecting a research question to actual records, figures, report and static reviewer.'
  ],
  objectives: [
    [
      '그림의 각 축·표본이 원 run으로 연결됨을 확인한다.',
      'Verify that figure axes and samples trace to the original run.'
    ],
    [
      'notebook·report·reviewer와 원본 bytes를 함께 검토 패키지로 묶는다.',
      'Package notebook, report, reviewer and original bytes together for review.'
    ]
  ],
  assumptions: [
    '실험은 같은 입력의 두 실제 이중진자 run과 원 시계열을 캡처합니다. figure는 저장한 시간·theta1 표본으로 만들고 보간하지 않습니다. error bar의 불확실성은 측정·추정하지 않았으며 0이 측정된 불확실성이라는 주장을 하지 않습니다. 오프라인 reviewer는 정적 보기로 파일을 실행하지 않습니다.',
    'The experiment captures two native double-pendulum repetitions and their original series. The figure uses saved time/theta1 samples without interpolation. Error-bar uncertainty has not been measured or estimated; zero is not claimed as measured zero uncertainty. The offline reviewer is a static view that does not execute attachments.'
  ],
  concepts: [
    {
      id: 'narrative-figure',
      title: ['주장과 그림에 원본 연결', 'Link claims and figures to originals'],
      body: [
        'notebook은 질문·방법·관찰·한계를 plain text로 기록하고 artifact ID를 참조합니다. figure는 원 run과 정확한 series artifact를 지정하며 축·단위·표본 수·원 SHA256을 출력 metadata에 남깁니다. 그림을 보기 좋게 다시 그리는 행위가 원 자료 변환이나 새로운 측정을 숨겨서는 안 됩니다.',
        'A notebook records question, method, observation and limits as plain text with artifact references. Each figure names its original run and exact series artifact, retaining axes, units, sample count and source SHA256 in metadata. Presentation must not conceal transformations or invent measurements.'
      ]
    },
    {
      id: 'reviewer-package',
      title: ['정적 보기와 실행 검증을 구별', 'Distinguish static review from execution verification'],
      body: [
        '실제 ZIP에는 원 설정·series, project/package/checksum manifest, notebook.json, report.md, figures의 SVG/CSV와 reviewer.html을 함께 넣습니다. 다시 import해 checksum과 계보를 검증한 후 제공하지만 정적 reviewer 자체는 재계산하거나 checksum을 다시 검사하지 않습니다. 사람의 과학 검토는 별도입니다.',
        'The actual ZIP includes original configurations and series, project/package/checksum manifests, notebook.json, report.md, figure SVG/CSV and reviewer.html. Import verifies checksums and lineage before delivery, but the static reviewer itself neither reruns calculations nor rechecks checksums. Human scientific review remains separate.'
      ]
    }
  ],
  equations: [
    {
      id: 'figure-axis',
      title: ['그림의 기록 시간축', 'The recorded time axis of a figure'],
      expression: 't = t0 + i * h',
      explanation: [
        '균일 기록의 시각은 시작 t0에 표본 번호 i와 간격 h의 곱을 더한 값입니다. 실제 figure는 이 식으로 보간하지 않고 보존된 time 배열 값을 그대로 씁니다.',
        'A uniform record time is t0 plus sample index i times interval h. The actual figure uses the preserved time array rather than interpolating points from this expression.'
      ],
      symbols: [
        ['t', 's', '표본 기록 시각', 'recorded sample time'],
        ['t0', 's', '기록 시작 시각', 'record start time'],
        ['i', '1', '0부터 시작한 표본 번호', 'zero-based sample index'],
        ['h', 's', '기록 간격', 'record interval']
      ]
    },
    {
      id: 'package-budget',
      title: ['원본과 파생 출력의 크기 예산', 'Size budget for original and derived outputs'],
      expression: 'Btotal = Boriginal + Bderived + Bmetadata',
      explanation: [
        '패키지 크기는 원본 bytes·생성 그림/문서·manifest와 ZIP metadata를 모두 포함합니다. byte 수는 무차원 개수이고 개별 파일과 전체 크기 한도를 함께 검사합니다.',
        'Package size includes original bytes, derived figures/documents, manifests and ZIP metadata. Byte counts are dimensionless counts; both per-file and whole-package bounds must be checked.'
      ],
      symbols: [
        ['Btotal', '1', '총 byte 수', 'total byte count'],
        ['Boriginal', '1', '원본 파일 bytes', 'original-file bytes'],
        ['Bderived', '1', '파생 그림·문서 bytes', 'derived figure/document bytes'],
        ['Bmetadata', '1', 'manifest와 ZIP metadata bytes', 'manifest and ZIP metadata bytes']
      ]
    }
  ],
  prediction: [
    '연구 그림을 추가하면 원 시계열을 없애도 되는지, 다운로드 ZIP에 어떤 원본과 검토 파일이 필요한지 먼저 예측하세요.',
    'Predict whether adding a research figure permits removing the original series and which original and reviewer files the downloadable ZIP must retain.'
  ],
  action: [
    '패키지 실험을 실행하고 그림 출처·ZIP 경로 표를 확인한 뒤 다운로드하여 reviewer.html과 원본 figures CSV를 함께 살펴보세요.',
    'Run the package experiment, inspect figure provenance and ZIP paths, then download and compare reviewer.html with the original figure CSV.'
  ],
  expected: [
    '실제 ZIP은 두 run·네 원본 artifact에 report.md·notebook.json·reviewer.html과 figures/figure-s27.svg·CSV를 포함합니다. figure 출처는 원 run과 series SHA256으로 연결됩니다.',
    'The actual ZIP contains two runs, four original artifacts, report.md, notebook.json, reviewer.html and figures/figure-s27.svg/CSV. Figure provenance links to the original run and series SHA256.'
  ],
  explanation: [
    '그림은 데이터를 대신하는 요약이 아니라 원본과 연결된 파생 artifact입니다. 다운로드는 같은 입력을 다시 계산해 생성·검증하며 정적 reviewer 열기를 사람 검토 완료로 표시하지 않습니다.',
    'A figure is a derived artifact linked to originals, rather than a replacement for data. Downloading recalculates the same inputs and builds a verified package; opening the static reviewer is not labeled completed human review.'
  ],
  next: [
    '독립 검토자에게 질문·원본·변환·실패 조건을 함께 전달하고 실제 피드백을 별도 기록하세요. 이를 수행하기 전 사람 검토 완료를 주장하지 않습니다.',
    'Provide an independent reviewer with the question, originals, transforms and failure conditions, and record actual feedback separately before claiming human review.'
  ],
  glossary: [
    ['검토 패키지', 'Review package'],
    [
      '주장·그림·원 run·원본 bytes·검증 manifest를 함께 전달하는 재현 산출물 묶음입니다.',
      'A reproducibility bundle delivering claims, figures, original runs, original bytes and validation manifests together.'
    ]
  ],
  sources: [
    {
      path: 'src/product/provenance/render.ts',
      locator: [
        'renderResearchFigure/researchExportEntries의 원본 축·SVG/CSV·정적 reviewer',
        'renderResearchFigure/researchExportEntries source-bound axes, SVG/CSV and static reviewer'
      ]
    },
    {
      path: 'src/product/provenance/package.ts',
      locator: [
        'ZIP manifest/checksum과 안전한 생성 출력 경로 검사',
        'ZIP manifest/checksum verification and safe generated-output path validation'
      ]
    }
  ],
  external: {
    title: 'PROV Model Primer',
    authors: 'W3C Provenance Working Group; Y. Gil and S. Miles, editors',
    url: 'https://www.w3.org/TR/prov-primer/',
    locator: [
      '3장의 generation·derivation 예와 산출물 계보 연결',
      'Section3 examples: generation, derivation and relationships between source and derived entities'
    ]
  },
  labTransferDescription: [
    '기준 run의 정확한 canonical 물성·초기조건·단위·RK4와 단원 출처를 Lab에 전달합니다. notebook·그림·report·reviewer는 별도 검증 ZIP 다운로드로 보존하며 현재 Lab 프로젝트에 자동 합치지 않습니다.',
    'Transfer exact baseline canonical physics, initial conditions, units, RK4 and source lesson to Lab. Preserve notebook, figures, report and reviewer in the separate verified ZIP download; they are not automatically merged into a Lab project.'
  ],
  checks: [
    {
      prompt: ['SVG 그림만 있으면 재현 패키지가 완전한가요?', 'Is an SVG alone a complete reproducibility package?'],
      correct: [
        '원 run·원본 기록·설정·계보·검증도 필요하다.',
        'Original runs, records, inputs, lineage and verification are also needed.'
      ],
      incorrect: [
        '보기 좋은 그림이면 원본 데이터는 삭제한다.',
        'A polished figure permits deleting the original data.'
      ],
      explanation: [
        '그림의 각 점과 해석을 원본에 대조할 수 있어야 합니다.',
        'Each plotted point and interpretation must remain traceable to original records.'
      ]
    },
    {
      prompt: ['정적 reviewer를 열면 무엇이 완료되나요?', 'What is completed by opening a static reviewer?'],
      correct: [
        '저장된 보고서를 본 것이며 사람 검토·재계산 인증은 별도다.',
        'It displays a saved report; human review and rerun certification remain separate.'
      ],
      incorrect: [
        '과학 전문가 검토와 재계산이 자동 완료된다.',
        'Expert scientific review and recalculation automatically complete.'
      ],
      explanation: [
        '정적 HTML은 파일을 실행하지 않고 실제 검토자의 판단을 대신하지 않습니다.',
        'Static HTML executes no attachments and cannot stand in for an actual reviewer’s judgment.'
      ]
    }
  ]
});
