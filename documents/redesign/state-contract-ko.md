# S03 canonical 상태·공유·라우트 계약

이 문서는 S03에서 추가한 **실험 재시작 설정의 전송 계약**을 설명한다. 기존 앱이나 저장소에 migration을 적용하지 않는다. S04의 화면과 라우터 실행, S07 이후 엔진 adapter, S28의 전체 legacy migration은 각 단계에서 별도로 검증한다.

## 진입점과 버전

| 계약 | 버전 | 구현 |
|---|---|---|
| 실험 설정 | `pendulum-experiment/v1` | [experiment.ts](../../src/product/contracts/experiment.ts), [experiment-validation.ts](../../src/product/contracts/experiment-validation.ts) |
| 독립 UI 설정 | `pendulum-ui/v1` | [ui-state.ts](../../src/product/contracts/ui-state.ts) |
| 분석 산출물 계보 | `pendulum-analysis-provenance/v1` | [analysis-provenance.ts](../../src/product/contracts/analysis-provenance.ts) |
| 공유 envelope | `pe1.` 접두사와 내부 `v: 1` | [share.ts](../../src/product/persistence/share.ts) |
| Learn/Lab hash 주소 | 아래의 엄격한 예약 주소 | [routes.ts](../../src/product/contracts/routes.ts) |
| 향후 legacy 연결 | adapter 자체 `version` + `sourceSchema` + `canonicalSchema` | [legacy-adapter.ts](../../src/product/contracts/legacy-adapter.ts) |

제품 내부 import는 [contracts/index.ts](../../src/product/contracts/index.ts)와 [persistence/index.ts](../../src/product/persistence/index.ts)를 사용한다. 기존 npm 공개 entrypoint는 변경하지 않았다. 모든 공개 validator/codec은 성공 시 `value`, 실패 시 `issues`를 반환하고 원본을 수정하지 않는다.

## 실험 의미와 단위

`ExperimentStateV1`의 필수 필드는 schema, S02 `system:*` ID, modelVersion, parameters, initialConditions, integrator, runtime, analyses이다. modelOptions, topology, seed, provenance는 선택 사항이며 SDE 시스템은 seed가 필수다.

- 수치는 scalar, vector, complex-vector의 명시적 형태와 SI 단위로 저장한다. 복소 벡터의 re/im 길이는 같아야 한다. 각도는 rad, 각속도는 rad/s이며 serializer가 각도를 감거나 clamp하지 않는다.
- [quantities.ts](../../src/product/contracts/quantities.ts)의 단위 allowlist가 계약이다. SI 차원을 가진 값과 정규화된 무차원 값(`1`)을 구분한다. 단위 변환은 자동 실행하지 않는다. 비 SI 값은 adapter가 명시적으로 변환한 뒤 provenance.sourceUnits로 원래 입력 단위를 보존할 수 있다.
- S13은 cartpole gain을 정확히 직렬화하기 위해 `N/rad`, `N*s/rad`를 추가한다. 기존 단위·schema·fixture는 그대로 유지하며 inverted gain은 `s^-2`, `s^-1`, cartpole 위치 gain은 `N/m`, `N*s/m`를 사용한다.
- sourceUnits는 `parameters.<name>` 또는 `initialConditions.<name>`의 실제 quantity를 가리키며 canonical 단위와 차원이 맞아야 한다. 예를 들어 deg→rad, cm→m만 허용하며 deg→kg는 거부한다.
- 기존 double의 감쇠 계수는 질량행렬 역산 전 일반화 토크에 곱해지므로 fixture에서 `kg*m^2/s`를 사용한다. 다른 모델의 감쇠 계수에 이 단위를 일괄 적용하지 않는다.
- parameters/initialConditions/settings는 adapter가 소유하는 이름→quantity map이다. modelOptions 및 적분기/분석 options는 안전한 식별자 또는 boolean map이며, 임의 함수·실행식·자유 서술 텍스트를 담지 않는다.
- 이 동적 map의 키는 확장 가능한 계약의 일부다. 구조 밖 unknown field와 구분한다. 필수 물성, 정확한 model field 이름·차원·범위·벡터 크기·알고리즘 버전 지원 여부는 향후 시스템 adapter가 실행 전에 검증해야 한다. 구조 검사 통과는 물리적 실행 가능성 인증이 아니다.

## 적분·runtime·seed·분석

- selectable 적분기는 S02의 실제 ID와 지원 시스템 목록을 검사한다. internal stepping 시스템에는 내부 알고리즘 버전과 설정을 저장한다. standard map/quantum에는 iteration, spectral/diagnostic에는 evaluation, 나머지에는 time runtime을 사용한다.
- time runtime은 start/duration/step을 초 단위로, iteration runtime은 start/iterations를 정수로 저장한다. sampleEvery는 표본 간격이며 UI 속도나 패널 배치가 아니다. 유한한 끝 시각과 표현 가능한 시간 증가, 최대 10억 step/iteration 제한을 검사한다.
- seed는 문자열 원문, generator 식별자, generatorVersion으로 구성한다. 음수·0·큰 정수 문자열을 임의 uint32로 변환하지 않는다. 특정 생성기의 지원 seed 범위와 stream 복원은 그 adapter의 책임이다.
- analysis는 S02 `analysis:*` ID, algorithmVersion, settings와 선택 options를 가진다. 동일 ID 중복과 시스템 비호환을 거부한다. 필요한 trajectory/관측 데이터가 실제 존재하는지, 표본 수나 비용이 적합한지는 실행 adapter에서 추가 확인한다.
- 실험 provenance는 생성 소프트웨어 버전, 출처 종류·공개 식별자, 부모 실험 ID와 원래 입력 단위를 가진다. 독립 분석 artifact provenance는 inputRunId, artifactId, 분석 버전·설정, 유효한 UTC 생성 시각을 기록한다. 파일 경로나 원본 데이터는 넣지 않는다.

이 계약은 초기 상태와 실행 설정으로 재시작하는 의미다. solver 내부 버퍼, 진행 중 RNG stream/Box–Muller spare, 임의 delay callback의 연속 실행 상태, 큰 장 데이터 파일 전체를 직렬화한다고 주장하지 않는다. 향후 adapter는 필요한 versioned history/model/artifact를 명시하고, 표현할 수 없는 데이터는 보존 안내와 함께 거부해야 한다.

## 독립 UI와 결정론적 JSON

UI schema는 locale, theme, layout, displayUnits만 저장한다. 실험에 UI 필드를 끼워 넣으면 unknown-field 오류다. UI 파일이 없어도 실험을 복원하며, UI 설정 변경이 실험 JSON 또는 공유 token을 바꾸지 않는다.

```ts
import { serializeExperiment, parseExperiment, createExperimentRoute, resolveProductRoute } from '../../src/product/persistence';

const saved = serializeExperiment(experiment);
if (saved.ok) {
  const restored = parseExperiment(saved.value);
  // restored.ok인 경우 값·단위·seed·분석 설정이 동일하다.
}
const link = createExperimentRoute(experiment);
if (link.ok) {
  const restored = resolveProductRoute(link.value);
  // route의 시스템과 token 내부 systemId가 같아야 성공한다.
}
```

객체 키는 재귀적으로 정렬하고 배열 순서와 모든 명시적 설정은 유지한다. 동일 입력은 동일 JSON/token을 만든다. `-0`, NaN, Infinity, undefined, BigInt, sparse array, 부적절한 UTF-16은 손실성 변환을 피하기 위해 거부한다. `-0`이 필요 없는 입력은 호출자가 의미를 확인해 `0`으로 수정해야 하며 serializer가 조용히 고치지 않는다.

## 공유와 주소

공유는 minified canonical JSON envelope `{v: 1, e: experiment, c: crc32}`를 UTF-8 및 unpadded base64url로 인코딩한 `pe1.<payload>`이다. 압축 해제나 외부 서비스가 없다. CRC32는 우발적인 손상을 탐지하며 암호화·서명·진위 인증이 아니다. 누구나 checksum을 다시 만들 수 있으므로 decode에서도 전체 schema와 개인정보 필터를 검사한다. token은 읽을 수 있는 공개 실험 정보다.

경로·연락처 문자열, password/secret/token/credential/privateKey 등 민감 이름을 가진 필드는 공유 시 거부하며 자동 삭제하지 않는다. 공개 식별자에는 실제 개인정보나 비밀을 넣지 않는 것이 호출자 계약이다. 식별자처럼 보이는 임의 비밀값의 의미까지 자동 판별한다고 주장하지 않는다.

| 주소 | 내부 route |
|---|---|
| `#/learn` | learn |
| `#/learn/course-1` | learn-course |
| `#/learn/course-1/1.8` | learn-unit |
| `#/lab` | lab |
| `#/lab/double` | lab-system, `system:double` |
| `#/lab/double?state=pe1.<payload>` | 해당 시스템 실험 공유 |

parser는 hash, `/learn` 등의 hash body, 정확한 `/next.html#...` 상대 주소를 받는다. serializer는 배포 base path와 독립적인 hash만 출력한다. 카탈로그 34개 시스템과 교육과정 8개 과정·86개 단원을 예약하며 콘텐츠를 공개하거나 화면을 만들지는 않는다. compound 주소는 S02 ID에 따라 `#/lab/compound-double`이다.

외부 origin, 다른 entrypoint, percent escape, traversal, 빈/중복/알 수 없는 query, 시스템 없는 state query, 존재하지 않는 ID를 거부한다. 실제 token 해석은 `resolveProductRoute`를 사용한다. 문법 parser만의 성공으로 실험 복원 성공을 판단하면 안 된다. 초기 빈 hash 처리와 오류 화면은 S04의 책임이다.

## 오류와 자원 제한

`ContractIssue`는 code, path, message, recovery를 가진다. 원문 payload 값은 오류 메시지에 복사하지 않는다. 오류가 나면 부분 복원값을 반환하지 않는다.

| 상황 | 대표 code | 복구 |
|---|---|---|
| 모르는 schema/envelope 버전 | unsupported-version | use-supported-version; 원본 보존 |
| 구조 밖 필드 | unknown-field | keep-original |
| 중복 키·손상 JSON | invalid-json | keep-original |
| 위험한 객체·자료형·구조 한도 초과 | unsafe-data | keep-original |
| 단위·값·ID·호환성 오류 | invalid-value / unknown-id / incompatible-capability | correct-input |
| URL 제한 초과 | share-too-large / payload-too-large | export-file |
| checksum 불일치 | damaged-share | keep-original |
| 주소/상태 시스템 불일치 | route-state-mismatch | keep-original |
| 공유 민감 필드 | private-share-data | keep-original |

공통 한도는 JSON 256 KiB, 깊이 24, 방문 노드 32,768(키 포함), 객체당 256개 키, 배열당 4,096개 값, 문자열당 4,096 UTF-16 code unit이다. byte 예산은 보수적으로 검사하므로 파일 길이가 작아도 매우 조밀한 객체는 먼저 거부될 수 있다. quantity map은 최대 256개, options는 최대 128개, analyses는 최대 64개다. 공유 token은 32 KiB 문자, 전체 route는 40 KiB 문자 이하이며 작은 URL도 브라우저/배포 환경 한도는 S04 이후 확인한다. 큰 데이터는 현재 계약 범위 내 JSON 파일 또는 향후 별도 artifact로 전달해야 한다.

[safe-data.ts](../../src/product/persistence/safe-data.ts)는 accessor/toJSON/숨은 속성/symbol/custom prototype/cycle/sparse array/prototype pollution 키를 거부하며 detached plain-data copy를 만든다. JSON scanner는 escape로 위장한 중복 키도 거부한다. programmatic Proxy의 reflection trap 자체까지 실행을 막는 JS 격리 경계는 아니며, 외부 전송 입력에는 JSON parser를 사용한다.

## 보존과 검증

### S15의 versioned topology 확장

S15의 5개 네트워크 시스템은 정확한 `network-model-v1`에서만 선택적 `topology`를 전송한다. `pendulum-network-topology/v1`은 고유 node ID의 배열, 고유 edge ID·source·target을 가진 무방향 단순 그래프, 선택적 물리적 `ringOrder`를 포함한다. 최대 128노드·4,096edge이며 self/parallel edge, 없는 endpoint, 중복 ID와 알 수 없는 필드를 거부한다. Chimera는 모든 노드가 한 번씩 등장하는 ringOrder가 필수다. 배열 재배열과 물리적 이웃 관계를 구분하여 노드 순열 뒤에도 같은 실험을 나타낼 수 있게 한다.

질량·길이·고유진동수·초기 상태·edge weight는 기존 quantity 벡터에 저장한다. 공통 validator는 구조·버전·ID를 검사하고, adapter가 그래프와 벡터 차원·가중치·모델 제약을 실행 전에 검사한다. 이전 모델의 topology 없는 상태는 그대로 유효하다. 공통 schema ID와 단위 allowlist를 변경하지 않으며 새 graph 의미를 다른 모델 버전에서 조용히 무시하지 않는다.

### S14의 명시적 adapter 확장

`nonlinear-model-v1` 모델 버전은 `system:mathieu`와 `system:friction`에 한해서 시간응답 wrapper를 선언한다. 이 두 버전 지정 상태는 `runtime.domain=time`을 사용하며, 기존 버전·알 수 없는 버전의 진단 상태는 계속 `evaluation`을 요구한다. 다른 진단 모델에는 이 예외를 적용하지 않는다. 카탈로그의 기존 diagnostic 의미와 native API는 보존한다. `nonlinear-runtime.test.ts`가 이 양방향 구분을 검증한다.

정규화 모델(Duffing·Van der Pol·Mathieu)은 `modelOptions.timeConvention=normalized`, 물리 모델은 `si`를 명시한다. 기존 공통 runtime의 s carrier를 유지하면서 정규화 시간의 의미를 버전 지정 adapter가 해석하고, 불일치 convention을 거부한다. 화면과 CSV는 정규화 눈금을 실제 초로 표시하지 않는다.

Pyragas의 설정은 `historyKind`, `historyTheta`, `historyOmega`와 선택적 `delayTimes`·`delayTheta`·`delayOmega` 벡터로 과거 이력 함수를 표현한다. 실행 초기의 analytic 과거 이력이 필요한 동안에는 `delayHistoryBoundary` 상대 시각도 보존하여 경계 불연속을 가짜 ramp로 바꾸지 않는다. 이는 새 시점의 지연 초기조건이며 engine 객체나 UI layout을 직렬화하는 것이 아니다. 공통 schema·단위 allowlist·공개 API는 바꾸지 않는다.

[legacy-adapter.test.ts](../../tests/product/contracts/legacy-adapter.test.ts)는 실제 v11 RuntimeSnapshot 타입에서 명시적으로 고른 double 재시작 표본의 왕복을 검증한다. 기존 StateStore를 호출하지 않으며 UI/mode/hash 등이 포함된 전체 session migration으로 표현하지 않는다. 원본 객체, theta/omega 순서, 감쇠 단위, winding, verlet ID, signed safe integer seed, simTime을 보존하고 역변환 손실을 거부한다.

[계약 테스트 폴더](../../tests/product/contracts/)에는 SI scalar/vector/complex, stochastic seed, 별도 UI, artifact 계보, strict JSON, 임의 삽입 순서, 고정 seed property test, 공유 손상·공격·시스템 불일치가 포함된다. S01 수치 fixture와 인벤토리, S02 카탈로그 및 전체 기존 Vitest 회귀도 함께 확인한다. 집계와 Git 증거는 [S03 진행 기록](stage-runs/S03-progress.md)에 보존한다.

S03에서는 새 UI/E2E나 과학 단원을 제작하지 않았으며 사람·전문가 검토 완료를 표시하지 않는다. 기존 dependency/CodeQL 미해결 위험은 S01 기록을 유지한다. S03 완료 여부는 별도 status commit의 `origin/codex/redesign` 존재 확인으로 결정한다.
