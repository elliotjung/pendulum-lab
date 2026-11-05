import { s27Lesson } from '../../../src/product/experiments/s27-authoring';

export default s27Lesson({
  id: '8.11',
  summary: [
    '실제 run을 두 번 계산해 입력에서 기록 artifact까지 계보를 보존하고 checksum 검증 ZIP을 다시 엽니다.',
    'Calculate a native run twice, preserve input-to-record lineage and reopen a checksum-verified research ZIP.'
  ],
  objectives: [
    [
      'project·session·run·artifact의 관계를 추적한다.',
      'Trace relationships among project, session, run and artifact.'
    ],
    [
      '동일 환경 재현·무결성·출처 진위·과학 검토를 구별한다.',
      'Distinguish same-environment repeatability, integrity, authenticity and scientific review.'
    ]
  ],
  assumptions: [
    '질점 이중진자를 동일한 canonical SI 입력과 RK4 설정에서 두 번 시작합니다. 시작부터 지정 종료까지 실제 표본이 있어야 completed로 캡처합니다. 날짜는 교육 패키지의 고정 metadata이며 실험 측정 시각이 아닙니다. checksum은 bytes 무결성만 검사합니다.',
    'Two point-mass double-pendulum runs start from identical canonical SI inputs and RK4 settings. A completed capture requires actual samples from start to the requested endpoint. The fixed teaching-package date is metadata rather than a measurement timestamp. Checksums verify byte integrity only.'
  ],
  concepts: [
    {
      id: 'lineage-objects',
      title: ['계산 행위와 파일을 연결', 'Connect computational activities and files'],
      body: [
        'project 안의 session은 연구 맥락, run은 canonical 입력과 실제 기록 상태, artifact는 원본 bytes와 hash를 가집니다. 설정 artifact를 parent로 둔 series artifact가 입력→기록 관계를 남깁니다. 원 run과 native artifact의 입력을 대조할 수 없는 첨부는 검증된 계산 계보처럼 표시하지 않습니다.',
        'A session supplies project context; a run records canonical input and actual capture status; an artifact retains original bytes and hashes. A series artifact names its configuration artifact as a parent. Attachments whose original inputs cannot be compared with the selected run are not presented as verified computational lineage.'
      ]
    },
    {
      id: 'repeatability-integrity',
      title: ['재현·무결성과 인증의 한계', 'Limits of repeatability, integrity and authentication'],
      body: [
        '같은 입력으로 native run을 다시 계산한 뒤 실제 시계열을 비교하고, ZIP을 만들고 다시 읽어 checksum·schema·계보를 검사합니다. byte 일치는 다른 장치·적분기·장기 동역학의 정확성을 보장하지 않습니다. checksum을 모두 통과해도 조작자가 함께 바꾼 manifest의 외부 진위와 사람 검토는 인증되지 않습니다.',
        'Repeat a native run from the same inputs and compare actual series, then build and reopen a ZIP to verify checksums, schemas and lineage. Byte agreement does not guarantee other devices, integrators or long-time dynamics. Passing checksums does not authenticate an externally altered manifest or establish human review.'
      ]
    }
  ],
  equations: [
    {
      id: 'repeat-difference',
      title: ['같은 시각의 반복 차이', 'Repeat difference at a matched time'],
      expression: 'd = abs(qcopy - qoriginal)',
      explanation: [
        '복제 run과 원 run의 같은 기록 시각 각도를 뺀 절댓값을 비교합니다. 동일 환경의 이 fixture에서 모든 기록 차이는 0이며 이를 다른 환경의 보증으로 확대하지 않습니다.',
        'Compare the absolute angle difference between repeated and original runs at matched recorded times. Every difference is zero in this same-environment fixture, without extending that observation into a cross-environment guarantee.'
      ],
      symbols: [
        ['d', 'rad', '반복 각도 차이', 'repeated-angle difference'],
        ['qcopy', 'rad', '복제 기록 각도', 'repeated recorded angle'],
        ['qoriginal', 'rad', '원 기록 각도', 'original recorded angle']
      ]
    },
    {
      id: 'complete-record',
      title: ['균일 시작·끝 기록의 관계', 'Relationship of uniform start/end records'],
      expression: 'T = (N - 1) * h',
      explanation: [
        '시작 t=0을 포함하고 sampleEvery=1인 N개 균일 기록의 마지막 시각은 (N−1)h입니다. 실제 canonical 기간과 끝 표본을 대조해야 completed로 기록할 수 있습니다.',
        'For N uniform samples including t=0 with sampleEvery=1, the final time is(N−1)h. A completed capture requires checking the actual endpoint against the canonical duration.'
      ],
      symbols: [
        ['T', 's', '마지막 기록 시각', 'final recorded time'],
        ['N', '1', '시작 포함 기록 표본 수', 'sample count including the start'],
        ['h', 's', '균일 기록 간격', 'uniform record interval']
      ]
    }
  ],
  prediction: [
    '같은 canonical 입력으로 다시 계산하면 실제 기록 일치와 ZIP의 원본 artifact 개수가 어떻게 나타날지 예측하세요.',
    'Predict recorded-series agreement and original-artifact counts when the same canonical input is calculated twice.'
  ],
  action: [
    '두 실제 run의 재현 실험을 실행하고 run→artifact→parent ID와 SHA256 표를 읽은 뒤 검증 ZIP을 다운로드하세요.',
    'Run the two native repetitions, inspect run-to-artifact-to-parent IDs and SHA256, then download the verified research ZIP.'
  ],
  expected: [
    '기본 예는 run 2개와 원본 artifact 4개를 검증·복원하며 실제 기록 일치 지표는 1입니다. ZIP에는 설정·series와 manifest/checksums.json이 있습니다.',
    'The default example verifies and restores2 runs and4 original artifacts with recorded-series equality flag1. The ZIP contains configurations, series and manifest/checksums.json.'
  ],
  explanation: [
    '각 run은 설정과 실제 기록을 별도 원본 artifact로 남기므로 합계가 4개입니다. 다운로드는 같은 짧은 입력을 다시 계산하고 현재 단원의 canonical 출처를 패키지에 넣습니다.',
    'Each run retains configuration and actual series as separate original artifacts, giving four in total. Downloading repeats the same short inputs and preserves the current lesson canonical source in the package.'
  ],
  next: [
    '패키지를 별도 환경에서 열어 schema·checksum을 먼저 검증하고, 그다음 같은 물리 입력으로 다시 계산해 수치 허용오차를 비교하세요.',
    'Open the package in another environment, verify schemas and checksums first, then recalculate the same physical inputs and compare using numerical tolerances.'
  ],
  glossary: [
    ['Provenance', 'Provenance'],
    [
      '산출물이 어떤 입력·활동·원본에서 파생되었는지 추적하는 계보입니다.',
      'A lineage tracing the inputs, activities and originals from which an artifact was derived.'
    ]
  ],
  sources: [
    {
      path: 'src/product/provenance/project.ts',
      locator: [
        'captureResearchRun의 완료 조건·원본 artifact·parent 연결',
        'captureResearchRun completion requirements, original artifacts and parent relationships'
      ]
    },
    {
      path: 'src/product/provenance/package.ts',
      locator: [
        'buildResearchPackage/importResearchPackage의 checksum·schema 검증',
        'buildResearchPackage/importResearchPackage checksum, schema and original-artifact validation'
      ]
    }
  ],
  external: {
    title: 'PROV Model Primer',
    authors: 'W3C Provenance Working Group; Y. Gil and S. Miles, editors',
    url: 'https://www.w3.org/TR/prov-primer/',
    locator: [
      '2장의 entity·activity·generation과 derivation 개념',
      'Section2: entities, activities, usage/generation and derivation concepts'
    ]
  },
  labTransferDescription: [
    '기준 run의 정확한 물성·초기조건·단위·RK4·관찰 기간과 출처 단원을 Lab에 전달합니다. 생성한 연구 project/ZIP은 별도 다운로드로 보존하며 Lab에서 자동으로 덮어쓰지 않습니다.',
    'Transfer exact baseline physics, initial conditions, units, RK4, horizon and source lesson to Lab. Preserve the generated project/ZIP by separate download; it does not automatically overwrite a Lab project.'
  ],
  checks: [
    {
      prompt: ['SHA256 일치로 확인하는 것은?', 'What does a matching SHA256 verify?'],
      correct: ['지정 bytes의 무결성이다.', 'Integrity of the specified bytes.'],
      incorrect: [
        '물리 해석과 작성자 진위를 모두 인증한다.',
        'It certifies all physical interpretations and author authenticity.'
      ],
      explanation: [
        'checksum과 외부 진위·과학 검토는 서로 다른 증거입니다.',
        'Checksums, external authenticity and scientific review require different evidence.'
      ]
    },
    {
      prompt: ['종료에 도달한 실제 표본이 없으면?', 'What if actual samples do not reach the endpoint?'],
      correct: ['완료 run으로 캡처하지 않는다.', 'Do not capture it as a completed run.'],
      incorrect: [
        'canonical 기간만 있으면 완료로 표시한다.',
        'A declared canonical duration is sufficient for completion.'
      ],
      explanation: [
        '입력 의도와 실제 계산된 범위를 구분해야 재현 주장이 정확합니다.',
        'Distinguishing intended inputs from actual computed coverage keeps reproducibility claims accurate.'
      ]
    }
  ]
});
