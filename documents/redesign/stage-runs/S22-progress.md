# S22 — 역문제·UQ·관측 데이터 가져오기

## 기준과 범위

- 기준 local/remote HEAD: `3a09c3f6bb0c9bb4ba01aa4e9a09763fbc17eb12` (`codex/redesign`).
- 깨끗한 worktree, fetch 성공, HEAD 일치, plan check와 preflight22 exit0을 확인했다. sandbox의 Git 쓰기/하위 프로세스 제한은 같은 명령의 확장 권한으로 해결했다.
- S01~S21 완료 목록·Git history와 S21 progress/verification/preservation 산출물을 확인했다. 필수 선행 S21 status commit은 원격에 있다.
- 목표: CSV·각도 센서·색상 마커 영상의 관측 자료를 preview→확정으로 가져오고, 보정·단위·시간·결측 처리와 원본을 연결한다. 기존 매개변수 추정·Sobol·PCE 모듈을 bounded worker에서 실행하고 원본과 결과 관계를 파일로 복원한다.
- 범위 밖: S23 데이터 학습/고유해석, S24 프로젝트 저장·ZIP/reviewer, S25 이후 교육 콘텐츠, S28 parity 인증, app cutover·master merge·release.
- 기존 `app.html`, physics/chaos/research/runtime/workers/validation, 기존 product physics adapters, 공개 API·저장 데이터·공유 schema·golden fixture·이전 테스트를 보존한다.
- UI 모델 선택값은 이 실행 환경에서 읽을 수 없다. 사용자 선택을 전제로 진행하며 selector 변경이나 검증을 주장하지 않는다.

## 내부 checkpoint

| ID | 내용 | 검증 | 상태 |
|---|---|---|---|
| CP0 | 범위·보존·진행 기록 | plan/preflight22/typecheck | 완료·원격 확인 |
| CP1 | immutable 관측 계약·보정·원본 복원, 역문제/UQ adapter·worker | malicious/malformed, recovery, native/UQ benchmark, progress/cancel/memory, typecheck/lint | 완료·원격 확인 |
| CP2 | lazy 관측 wizard·추정/UQ UI·결과·복원 | production browser desktop/mobile, keyboard/a11y, visual, build | 검증 완료·push 대기 |
| CP3 | 보존·통합 검증·완료 후보 | 전체 Vitest, golden, 품질 검사, 보존 해시, 원격 구현 확인 | candidate-complete |
| STATUS | 별도 완료 상태 commit | 원격 HEAD 정확한 일치 | 대기 |

변경 예정 경로: `src/product/observations/`, `src/product/adapters/analysis/inverse/`, `src/product/lab/research/`, 공유 diagnostics 연결, 전용 CSS, 관련 `tests/product/`와 `e2e/redesign/`, S22 문서/검증 증거. 각 checkpoint에서 명시적 경로만 stage한다.

## 위험·검토 상태

- 영상은 두 색상 마커와 교정값을 요구한다. 범용 영상 추론이나 임의 센서 자동 인식을 주장하지 않는다.
- 기존 inverse fitter의 실제 지원 모델/적분/초기조건만 허용하고, 부적합 설정은 이유를 표시한다. UQ의 독립 uniform 가정·유한 표본·비식별성과 대리모델 외삽 한계를 표시한다.
- 불러온 수치 결과는 인증된 실험 결과가 아니다. schema/유한성/입출력 관계를 검사하고 원본을 보존한다.
- 기존 보안 부채는 S21 기록을 이어받으며 dependency 변경이나 위험 수용을 하지 않는다. 사람의 과학 검토는 수행한 것으로 표시하지 않는다.
- S22는 사용자 review gate가 아니다. 승인 목록 `[7,9,17]`을 유지하며 다음 review는 S24다.

## commit·push 증거

- CP0: plan check/preflight22/typecheck exit0. commit/push exit0. local HEAD와 `git ls-remote origin refs/heads/codex/redesign` 모두 `339d5f85500fd1871c6b5242669eaa70d11871ec`로 확인했다.
- 구현 checkpoint를 검증·push하고 정확한 원격 hash를 확인한 뒤에만 다음 checkpoint로 진행한다. 최종 status push 전에는 완료가 아니다.
- CP0 push의 GitHub 기본 branch 보안 알림은 22개(high12/moderate7/low3)였다. 이는 새 dependency audit가 아니며 기존 부채 해결을 뜻하지 않는다.

## CP1 검토·검증 진행

- native 물리 adapter를 통과하는 독립 표준 사상 선형 benchmark에서 Sobol/PCE의 해석적 분산비0.2/0.8을 확인했다. native 이중진자에서 생성한81개 표본을 ms/deg CSV로 가져와 초기 g=8에서 참값9.81을 오차7.16e-7로 복원했다. 원본·단위·변환·결과 관계 왕복까지 수치7개 불변식이 통과했다. 이는 브라우저 반응성이나 실물 센서 정확도 검증과 구별한다.
- 관측 importer의84개와 독립 회귀7개, 합91개가 통과했다. 영상19개는 주입한 decoder/native tracker로 검사하며 실제 browser 영상 decoding 증거와 구별한다.
- 초기 통합 targeted는178개 중177pass/1fail이었다(`tmp/s22-cp1-targeted.json`). 새 async worker 결과 검증 도입 후 기존 새 client test가 동기 오류 통지를 기대하는 문제다. 오류 assertion은 유지하며 async terminal 처리를 확인하도록 보완한다. 이 상태를 publish하지 않는다.
- 영상 원본8MiB의 base64와 관측16MiB를 모두 담도록 inverse 결과 envelope은24MiB로 맞췄다. 다른 canonical/share 한도를 변경하지 않았다.
- 저장 관측 복원의 fabricated preview를 private 확인 표식이 거부하는 UI 연결 오류를 독립 검토에서 발견했다. 원본에서 다시 preview를 생성하고 명시적 확인을 요구하는 흐름으로 고친다. 저장 결과의 embedded 관측도 새 추정에 쓰기 전 확인한다.
- CP1 최종 targeted `tmp/s22-cp1-targeted-final.json`:12파일187/187, 실패·pending0, exit0. 신규140개와 기존 native/golden47개이며 timeout/retry/기존 테스트·fixture를 바꾸지 않았다. 최종 typecheck·scoped ESLint·Prettier exit0. 관측 source decoder8Mi pixels/8192edge 제한과26개 영상 fixture, native/golden13개, worker12개를 포함한다.
- LM damping이 accepted step에서1e-15까지 내려가므로 반복별 거절 평가 상한을30으로 보수적으로 잡았다. UQ 비용은 평균 corner가 아닌 최대 corner를 사용하며 정수 전용 ensembleMembers/maxIterations를 연속 균일분포 변수로 취급하지 않는다. 공통 질량 배율과 무감쇠 두 길이·g 공통 배율의 비식별 조합을 명시적으로 거부한다.
- decoder 원본8Mi pixels·각 변8192px·metadata preload 검사로 큰 원본 프레임을 draw 전에 차단한다. 색상 마커 추적·CSV 기하 변환·optimizer·Sobol·PCE는 기존 native 구현을 호출한다. 결과 복원은 물리 궤도를 재실행하지 않고 저장 표본의 Sobol/PCE와 진단 관계를 검증하며 원본·결과를 불변으로 반환한다.
- CP1 commit/push exit0, local HEAD와 `git ls-remote` 모두 `9c2c0ae33191c815bcea629b2fc6c2284c122ce9`로 확인했다. core25경로만 명시적으로 stage했으며 UI/CSP 변경은 CP2로 남겼다.

## CP2 진행

- 초기 production16개는6pass/10fail이었다(`tmp/s22-browser-initial.json`). 표 스크롤 영역 axe 접근성6건, 실제 계산량 제한을 초과한 새 cancellation fixture2건, blob media CSP 거부2건을 확인했다. UI 포커스 경로를 보완하고 cancellation은 동일한 예산 안의 장기 계산을 사용하며, 실제 영상 decoding에 필요한 `media-src 'self' blob:`만 추가한다. 기존 timeout/retry와 보안 script/worker/connect 정책을 바꾸지 않는다.
- media CSP 변경으로 inventory의 frozen legacy fingerprint가 달라지는 것을 확인했다. S04와 같은 좁은 projection으로 **정확한 로컬 media 지시문 하나만** 분리하며 S01 인벤토리는 재생성하지 않는다. 회귀 검사에서 원격 media·실행 blob 추가는 계속 fingerprint 차이로 탐지된다. inventory check와 기존 배포/PWA37개가 exit0이다. 이 변경과 검사는 CP2에 포함한다.
- 실제 Chromium VP8 녹화에서 loadeddata/readyState가 준비됐어도 t=0의 canvas draw가 검게 읽히는 문제를 probe3으로 재현했다. 같은 원본에서 짧은 양수 시각으로 seek한 뒤0으로 돌아오면 실제 마커 픽셀이 읽혔다. decoder를 그 방식으로 준비하고 t=0과 모든 행을 보존한다. 주입 decoder 회귀27/27, actual browser4-frame/source-byte 검증 양쪽 project와 visual 준비4/4가 통과했다(`tmp/s22-preparation2.json`). 결측 정책이나 마커 허용오차를 완화하지 않았다.
- 관측 복원은 원본 재preview→사용자 확인을 거치고 결과 복원은 모든 비동기 검증 후 atomic하게 게시한다. 계산 설정을 hydrate하여 저장한 PCE를 같은 설정으로 다시 실행한다. CSV는 BOM을 보존하고 잘못된 UTF-8을 거부하는 fatal decoder로 읽는다.
- 새 light/dark·desktop/mobile PNG4개를 직접 검사했다. 표본·단위·시간/보정 요약을 먼저 표시하고 전체 ID/SHA/변환 이력은 접이식 영역에 보존한다. 최초 snapshot 준비 실패는 missing baseline 생성이며 기존 PNG는 변경하지 않았다. 최종 비교는 명시적으로 update-snapshots=none이다.
- 최종 보호 해시:286파일·기존 test/fixture417개·기존 PNG212개와 desktop 전달본2개 모두 기준과 정확히 일치했다. 순수 엔진·API·사용자 데이터 형식·원본 계획·package/lockfile을 보존했다.
- provisional26개는25pass/1fail이었다(`tmp/s22-browser-provisional26.json`). 새 테스트가320px와200%를 동시에 적용해 유효160CSSpx를 검사하던 설정이었다. 기존 S18/S20/S21과 같은 독립320px·desktop200% 검증으로 맞추고 axe/overflow assertion은 유지하며 확대 후 원본 다운로드까지 검사한다. 제품 소스·빌드는 바꾸지 않았다.
- CP2 targeted는 production Chromium13+Pixel5 13,26/26 pass, 실패·skip·flaky·runner error0, exit0이다(`tmp/s22-browser-cp2-targeted.json`,202.833초). retries0·원래30초 timeout·snapshot update none으로 원본 가져오기/확정/재확정, 변환·보안 오류 보존, 실제4프레임 영상·원본 바이트, worker 취소, PCE 저장 설정 재실행, keyboard/axe/320px/200%를 확인했다. 새 PNG4개를 직접 검사했다.
- 같은 소스의 구현 전 전체 Vitest도340파일5294/5294(신규143개), 실패·pending0으로 통과했다. 구현을 먼저 원격에 보존한 뒤 프로토콜의 완료 후보 전체 gate를 다시 실행하며 앞 실행은 별도 targeted 증거로 남긴다. 최종 typecheck·전체 ESLint·format·policy는 exit0이다.
