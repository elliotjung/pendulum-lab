import type { LearnUnit } from '../../../src/product/learn/schema';
import { extendedFocusDefinition } from '../../../src/product/experiments/extended-definitions';

/** Declarative lesson data; all numerical work stays in the shared experiment adapter. */
const focusExperiment = extendedFocusDefinition('2.9', {
  guidance: [
    {
      key: 'learn.course-2.2.9.focus.guidance',
      ko: '예측을 먼저 적은 뒤 현재 설정으로 실행하세요. 단위가 있는 실제 결과와 companion의 적용 범위를 확인하고 한 변수만 바꿔 반복합니다.',
      en: 'Predict first, then run the current settings. Inspect actual unit-labeled results and the companion scope, and repeat after changing one variable.'
    }
  ],
  successCriteria: [
    {
      key: 'learn.course-2.2.9.focus.criteria',
      ko: '동일 source·설정의 계획 ID와 run 입력은 정확히 일치해야 합니다. 같은 환경의 결정론적 종점은 성분별 1e-12 이내로 일치하고 모든 run이 성공했는지 따로 확인합니다.',
      en: 'Plan identity and run inputs must match exactly for identical source/settings. Deterministic endpoints in the same environment should agree within 1e-12 per component; check every run status separately.'
    }
  ],
  tasks: [
    {
      id: 'repeat-batch',
      prediction: {
        key: 'learn.course-2.2.9.task.repeat-batch.prediction',
        ko: '같은 계획을 두 번 실행하면 어떤 항목이 같아야 할까요?',
        en: 'Which fields should match when the same plan is executed twice?'
      },
      action: {
        key: 'learn.course-2.2.9.task.repeat-batch.action',
        ko: '기본 비교를 두 번 실행해 계획 ID·run 순서·입력·종점 결과를 비교하고 현재 설정을 Lab으로 보냅니다.',
        en: 'Execute the default comparison twice, compare plan ID, run order, inputs and endpoints, then send the current source settings to Lab.'
      },
      expected: {
        key: 'learn.course-2.2.9.task.repeat-batch.expected',
        ko: '동일 source·설정의 계획 ID와 run 입력은 정확히 일치해야 합니다. 같은 환경의 결정론적 종점은 성분별 1e-12 이내로 일치하고 모든 run이 성공했는지 따로 확인합니다.',
        en: 'Plan identity and run inputs must match exactly for identical source/settings. Deterministic endpoints in the same environment should agree within 1e-12 per component; check every run status separately.'
      },
      explanation: {
        key: 'learn.course-2.2.9.task.repeat-batch.explanation',
        ko: '계획의 결정론성과 수치 결과의 재현성을 각각 확인합니다. elapsed wall time이나 생성 시각의 일치까지 요구하지 않습니다.',
        en: 'Check deterministic planning and numerical reproducibility separately; equal elapsed wall time or creation timestamps are not required.'
      }
    }
  ]
});

const unit: LearnUnit = {
  schema: 'pendulum-learn-unit/v1',
  id: '2.9',
  courseId: 'course-2',
  contentVersion: 1,
  kind: 'published',
  title: {
    key: 'learn.course-2.2.9.title',
    ko: '적분기 비교 실험의 재현성',
    en: 'Reproducible integrator comparisons'
  },
  summary: {
    key: 'learn.course-2.2.9.summary',
    ko: '비교 실험을 다른 날 다시 돌릴 수 있을까요? S21의 실제 batch builder·executor로 같은 source·seed·기간의 적분기 비교를 만들고 run 식별자와 결과를 보존합니다.',
    en: 'Can an integrator comparison be rerun another day? Use the actual S21 batch builder/executor for the same source, design seed and duration, and retain run identities and results.'
  },
  objectives: [
    {
      key: 'learn.course-2.2.9.objective.0',
      ko: '적분기만 바뀌는 통제 비교를 만들고 source/run/artifact 관계를 읽습니다.',
      en: 'Build a controlled comparison that changes only integrator and read source/run/artifact links.'
    },
    {
      key: 'learn.course-2.2.9.objective.1',
      ko: '결정론적 모델의 design seed와 확률 모델의 생성기 seed를 구별합니다.',
      en: 'Distinguish a deterministic experiment-design seed from a stochastic generator seed.'
    }
  ],
  prerequisites: [
    {
      id: 'prerequisite',
      title: {
        key: 'learn.course-2.2.9.prerequisite.title',
        ko: '필요한 개념과 실험 조건',
        en: 'Prerequisites and experimental conditions'
      },
      body: {
        key: 'learn.course-2.2.9.prerequisite.body',
        ko: '동일한 canonical 물성·초기조건·시간 간격·기간·분석 설정을 사용합니다. 이 단원의 이중진자는 결정론적입니다. 각 run은 비교 기준으로부터 새로 시작하며 중간 상태를 다른 적분기에 이어 붙이지 않습니다.',
        en: 'Use identical canonical physical parameters, initial conditions, step, duration and analysis settings. This double pendulum is deterministic. Each run restarts from the common source rather than continuing another integrator intermediate state.'
      },
      recommendedUnits: [
        {
          courseId: 'course-2',
          unitId: '2.8'
        }
      ]
    }
  ],
  concepts: [
    {
      id: 'controlled',
      title: {
        key: 'learn.course-2.2.9.concept.controlled.title',
        ko: '하나만 바뀌는 비교',
        en: 'Change one factor'
      },
      body: {
        key: 'learn.course-2.2.9.concept.controlled.body',
        ko: '실제 buildBatch의 integrators 종류는 물성과 초기조건 축을 함께 바꾸는 것을 거부합니다. 실행 가능한 adapter 적분기만 선택하며 각각 같은 원본에서 시작합니다. 첫 run은 endpoint 차이의 기준일 뿐 참해가 아니므로 정밀화 비교와 별도로 읽습니다.',
        en: 'The actual buildBatch integrators mode rejects simultaneous physical or initial-condition axes. It permits only executable adapter integrators and starts each from the same source. The first run is an endpoint reference rather than an exact solution, so refinement remains a separate check.'
      },
      citationIds: ['native-batch']
    },
    {
      id: 'identity',
      title: {
        key: 'learn.course-2.2.9.concept.identity.title',
        ko: '입력·설정·결과의 계보',
        en: 'Lineage of input, settings and result'
      },
      body: {
        key: 'learn.course-2.2.9.concept.identity.body',
        ko: 'source와 builder 설정이 같으면 계획 식별자·run 순서·입력이 결정적으로 만들어집니다. 알고리즘·모델 버전, canonical 상태, seed 정책, 적분기 목록과 step을 함께 남겨야 이후의 차이를 설명할 수 있습니다. ID 일치는 외부 파일의 진실성이나 과학적 정확도의 인증이 아닙니다.',
        en: 'The same source and builder settings deterministically produce plan identity, run order and inputs. Retain model/algorithm versions, canonical state, seed policy, integrator list and step to explain later differences. Matching IDs certify neither external authenticity nor scientific accuracy.'
      },
      citationIds: ['native-batch']
    },
    {
      id: 'seed-failure',
      title: {
        key: 'learn.course-2.2.9.concept.seed-failure.title',
        ko: 'seed와 실패의 의미',
        en: 'Meaning of seed and failure'
      },
      body: {
        key: 'learn.course-2.2.9.concept.seed-failure.body',
        ko: '결정론적 진자에서는 design seed만 바꿔도 물리 궤적은 달라지지 않을 수 있습니다. 확률계에서는 생성기 이름·버전·seed까지 같아야 합니다. 취소·실패한 run을 0의 결과로 평균내지 않으며 재실행은 원래 입력에서 다시 시작합니다.',
        en: 'Changing only a design seed may leave deterministic trajectories unchanged. Stochastic systems additionally require generator name, version and seed. Do not average cancelled/failed runs as zero; rerun them from their original inputs.'
      },
      citationIds: ['native-batch']
    },
    {
      id: 'synthesis',
      title: {
        key: 'learn.course-2.2.9.concept.synthesis.title',
        ko: '핵심 정리와 다음 탐구',
        en: 'Synthesis and next inquiry'
      },
      body: {
        key: 'learn.course-2.2.9.concept.synthesis.body',
        ko: '재현 가능한 비교는 입력·방법·관측 규칙·실패 상태를 함께 기록합니다. 과정 3에서 자유도와 구속이 다른 계에도 같은 원칙을 적용합니다.',
        en: 'A reproducible comparison records inputs, method, observation rules and failure status. Apply these principles to systems with different degrees of freedom and constraints in course 3.'
      },
      citationIds: ['native-batch']
    }
  ],
  equations: [
    {
      id: 'common-time',
      title: {
        key: 'learn.course-2.2.9.equation.common-time.title',
        ko: '1. 같은 기간과 같은 격자',
        en: '1. Use the same duration and time grid'
      },
      expression: 'tEnd = tStart+duration; tNode = tStart+n*h',
      accessibleText: {
        key: 'learn.course-2.2.9.equation.common-time.accessible',
        ko: '물성과 초기값뿐 아니라 최종 시각과 기록 규칙도 같아야 공정한 비교가 됩니다.',
        en: 'A fair comparison fixes endpoint time and recording rules as well as parameters and initial state.'
      },
      symbols: [
        {
          symbol: 'tEnd',
          unit: 's',
          meaning: {
            key: 'learn.course-2.2.9.equation.common-time.symbol.tEnd',
            ko: '모든 비교 run의 최종 시각',
            en: 'Common comparison endpoint time'
          }
        },
        {
          symbol: 'tStart',
          unit: 's',
          meaning: {
            key: 'learn.course-2.2.9.equation.common-time.symbol.tStart',
            ko: '공통 시작 시각',
            en: 'Common start time'
          }
        },
        {
          symbol: 'duration',
          unit: 's',
          meaning: {
            key: 'learn.course-2.2.9.equation.common-time.symbol.duration',
            ko: '공통 관찰 기간',
            en: 'Common observation duration'
          }
        },
        {
          symbol: 'tNode',
          unit: 's',
          meaning: {
            key: 'learn.course-2.2.9.equation.common-time.symbol.tNode',
            ko: '기록 격자 시각',
            en: 'Recorded grid time'
          }
        },
        {
          symbol: 'n',
          unit: '1',
          meaning: {
            key: 'learn.course-2.2.9.equation.common-time.symbol.n',
            ko: '0부터 시작하는 step 번호',
            en: 'Zero-based step index'
          }
        },
        {
          symbol: 'h',
          unit: 's',
          meaning: {
            key: 'learn.course-2.2.9.equation.common-time.symbol.h',
            ko: '공통 시간 간격',
            en: 'Common time step'
          }
        }
      ],
      citationIds: ['native-batch']
    },
    {
      id: 'reference-difference',
      title: {
        key: 'learn.course-2.2.9.equation.reference-difference.title',
        ko: '2. 첫 run과의 종점 차이',
        en: '2. Endpoint difference from the reference run'
      },
      expression: 'dq = qMethod-qReference; dw = omegaMethod-omegaReference',
      accessibleText: {
        key: 'learn.course-2.2.9.equation.reference-difference.accessible',
        ko: '차이는 두 수치해 사이의 차이이며 참해를 모르면 참오차와 같다고 할 수 없습니다.',
        en: 'This is a difference between numerical solutions; without an exact solution it is not an exact error.'
      },
      symbols: [
        {
          symbol: 'dq',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.9.equation.reference-difference.symbol.dq',
            ko: '동일 시각의 각도 차이',
            en: 'Angular difference at the same time'
          }
        },
        {
          symbol: 'dw',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.9.equation.reference-difference.symbol.dw',
            ko: '동일 시각의 각속도 차이',
            en: 'Angular-velocity difference at the same time'
          }
        },
        {
          symbol: 'qMethod',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.9.equation.reference-difference.symbol.qMethod',
            ko: '선택한 적분기의 최종 각도',
            en: 'Chosen-method final angle'
          }
        },
        {
          symbol: 'qReference',
          unit: 'rad',
          meaning: {
            key: 'learn.course-2.2.9.equation.reference-difference.symbol.qReference',
            ko: '첫 run의 최종 각도',
            en: 'Reference-run final angle'
          }
        },
        {
          symbol: 'omegaMethod',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.9.equation.reference-difference.symbol.omegaMethod',
            ko: '선택한 적분기의 최종 각속도',
            en: 'Chosen-method final velocity'
          }
        },
        {
          symbol: 'omegaReference',
          unit: 'rad/s',
          meaning: {
            key: 'learn.course-2.2.9.equation.reference-difference.symbol.omegaReference',
            ko: '첫 run의 최종 각속도',
            en: 'Reference-run final velocity'
          }
        }
      ],
      citationIds: ['native-batch']
    }
  ],
  figures: [],
  glossary: [
    {
      id: 'design-seed',
      term: {
        key: 'learn.course-2.2.9.glossary.design-seed.term',
        ko: '실험 설계 seed',
        en: 'Experiment-design seed'
      },
      definition: {
        key: 'learn.course-2.2.9.glossary.design-seed.definition',
        ko: '실험 계획과 표본 설계의 결정론적 입력입니다. 물리 모형의 확률 생성기 seed와 다르며 결정론적 진자에 무작위성을 추가하지 않습니다.',
        en: 'A deterministic input to planning and sample design. It differs from a physical stochastic-generator seed and adds no randomness to a deterministic pendulum.'
      }
    }
  ],
  checks: [
    {
      id: 'fair',
      prompt: {
        key: 'learn.course-2.2.9.check.fair.prompt',
        ko: '적분기 비교와 동시에 질량도 바꾸면?',
        en: 'What if mass changes during an integrator comparison?'
      },
      correctOptionId: 'supported',
      explanation: {
        key: 'learn.course-2.2.9.check.fair.explanation',
        ko: '적분기 효과를 보려면 다른 canonical 입력과 관찰 규칙을 고정해야 합니다.',
        en: 'Fix other canonical inputs and observation rules to isolate integrator effects.'
      },
      options: [
        {
          id: 'supported',
          label: {
            key: 'learn.course-2.2.9.check.fair.supported.label',
            ko: '방법 효과와 물성 효과를 분리할 수 없습니다.',
            en: 'Method and physical effects cannot be separated.'
          },
          feedback: {
            key: 'learn.course-2.2.9.check.fair.supported.feedback',
            ko: '설정과 단위, 가정을 함께 확인한 해석입니다. 적분기 효과를 보려면 다른 canonical 입력과 관찰 규칙을 고정해야 합니다.',
            en: 'This interpretation accounts for settings, units and assumptions. Fix other canonical inputs and observation rules to isolate integrator effects.'
          }
        },
        {
          id: 'unsupported',
          label: {
            key: 'learn.course-2.2.9.check.fair.unsupported.label',
            ko: '항상 더 정확한 비교가 됩니다.',
            en: 'The comparison is always more accurate.'
          },
          feedback: {
            key: 'learn.course-2.2.9.check.fair.unsupported.feedback',
            ko: '이 결론은 해당 검사가 보장하는 범위를 넘습니다. 적분기 효과를 보려면 다른 canonical 입력과 관찰 규칙을 고정해야 합니다.',
            en: 'This conclusion exceeds what the diagnostic establishes. Fix other canonical inputs and observation rules to isolate integrator effects.'
          }
        }
      ]
    },
    {
      id: 'seed',
      prompt: {
        key: 'learn.course-2.2.9.check.seed.prompt',
        ko: '결정론적 이중진자에서 design seed만 바꾸면?',
        en: 'What if only design seed changes for the deterministic double pendulum?'
      },
      correctOptionId: 'supported',
      explanation: {
        key: 'learn.course-2.2.9.check.seed.explanation',
        ko: 'design seed는 실험 배치의 식별·표본 설계와 관련되며 이 모형에 무작위 외력을 추가하지 않습니다.',
        en: 'A design seed concerns experiment identity/sampling and does not add random forcing to this model.'
      },
      options: [
        {
          id: 'supported',
          label: {
            key: 'learn.course-2.2.9.check.seed.supported.label',
            ko: '입력 상태가 같으면 궤적은 같을 수 있습니다.',
            en: 'With identical physical input the trajectory can remain the same.'
          },
          feedback: {
            key: 'learn.course-2.2.9.check.seed.supported.feedback',
            ko: '설정과 단위, 가정을 함께 확인한 해석입니다. design seed는 실험 배치의 식별·표본 설계와 관련되며 이 모형에 무작위 외력을 추가하지 않습니다.',
            en: 'This interpretation accounts for settings, units and assumptions. A design seed concerns experiment identity/sampling and does not add random forcing to this model.'
          }
        },
        {
          id: 'unsupported',
          label: {
            key: 'learn.course-2.2.9.check.seed.unsupported.label',
            ko: '반드시 다른 무작위 궤적이 나옵니다.',
            en: 'A different random trajectory must result.'
          },
          feedback: {
            key: 'learn.course-2.2.9.check.seed.unsupported.feedback',
            ko: '이 결론은 해당 검사가 보장하는 범위를 넘습니다. design seed는 실험 배치의 식별·표본 설계와 관련되며 이 모형에 무작위 외력을 추가하지 않습니다.',
            en: 'This conclusion exceeds what the diagnostic establishes. A design seed concerns experiment identity/sampling and does not add random forcing to this model.'
          }
        }
      ]
    }
  ],
  focusExperiment: focusExperiment,
  labTransfer: {
    status: 'ready',
    systemId: focusExperiment.systemId,
    sourceUnitId: '2.9',
    description: {
      key: 'learn.course-2.2.9.transfer.description',
      ko: '현재 지원되는 기준 run의 물성·초기조건·시간 설정·분석과 출처 단원을 실험실로 보냅니다. 별도 adaptive·canonical·implicit companion 결과는 화면에 구분되어 있으며 Lab이 그 solver를 복원했다고 표시하지 않습니다.',
      en: 'Send the supported baseline run physical parameters, initial conditions, time settings, analyses and source unit to Lab. Separate adaptive, canonical and implicit companion results are identified explicitly; transfer does not claim to restore those solvers.'
    }
  },
  references: [
    {
      id: 'native-batch',
      title: {
        key: 'learn.course-2.2.9.reference.native-batch.title',
        ko: 'Pendulum Lab — deterministic batch builder',
        en: 'Pendulum Lab — deterministic batch builder'
      },
      authors: 'Pendulum Lab contributors',
      url: 'https://github.com/elliotjung/pendulum-lab/blob/831e7afeda1c5d94439a2bf52276b2ff5996587d/src/product/lab/experiments/builders.ts',
      locator: {
        key: 'learn.course-2.2.9.reference.native-batch.locator',
        ko: 'S24 기준 원본 buildBatch, checkSettings와 integrators 경로를 로컬 소스에서 대조했습니다. source·설정 기반 ID와 첫 run을 참해로 취급하지 않는 경고가 핵심입니다.',
        en: 'Preserved S24 source: buildBatch, checkSettings and integrators path inspected locally; IDs depend on source/settings, and the first run is explicitly a reference rather than an exact solution.'
      },
      accessedOn: '2026-11-04'
    }
  ],
  review: {
    schemaVerified: true,
    automatedVerified: true,
    sourceChecked: true,
    humanReviewed: false,
    note: {
      key: 'learn.course-2.2.9.review.note',
      ko: '식·기호·단위·공용 엔진 fixture와 경계 사례를 자동 검사하고 아래 저자 교재·논문·공식 문서 또는 보존된 원 소스와 대조합니다. 사람 또는 물리 전문가 검토는 아직 완료되지 않았습니다.',
      en: 'Equations, symbols, units, shared-engine fixtures and boundary cases are checked automatically and compared with the author texts, papers, official documentation or preserved source listed below. Human or physics-expert review is still pending.'
    }
  }
};

export default unit;
