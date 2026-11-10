# S28 기능 동등성 심사

S28 구현은 게시된 checkpoint에 보존되어 있으며, 최종 실행 인증은 진행 중이다. 최종 Chromium·Pixel5 검사는 44파일씩 560건, 합계 1,120건을 겹치지 않는 12묶음으로 실행한다. 첫 세 묶음 281건은 실제 통과했다. 추가 시각 변경과 시간 초과를 분리한 대상 재검증 8건도 통과했으며, 중단된 묶음과 남은 9묶음의 실행을 준비했다. 아직 전체 134행 인증이나 S28 완료·사용자 전환 승인을 부여하지 않는다. 최신 진행 기록은 `../stage-runs/S28-progress.md`와 실제 capture/report에서 확인한다.

## 무엇을 심사하는가

S01의 파일 883개·의미 기능 118개·AST 관찰 6,825개를 각각 기록한다. 실행 심사 행은 의미 기능 118개와 등록 적분기 16개를 합한 134개다. AST 관찰을 사용자 기능 수로 세지 않는다.

각 행에는 실제 새 UI 조작, native 또는 독립 결과 비교와 허용오차, 저장·공유·이전 round trip, 실제 runner identity와 export 증거를 연결한다. 카탈로그·파일·화면 주소 또는 기존 앱 링크만으로 통과를 부여하지 않는다. 입력 계획과 test 수집 목록도 실행 성공의 증거가 아니다.

`preserved`는 원래 S01 투영과 관찰의 보존을 뜻한다. 현재 byte가 달라진 native/tool 파일 세 개는 이 값과 별도로 versioned 예외 및 immutable 원본 차등 검사를 공개한다. `S28-preservation-exceptions.json`은 기존 `SimulationClock.ts`, legacy copier, public Vitest publisher의 원본 blob·SHA·현재 SHA와 실제 보존 사례를 연결한다. 바뀐 파일을 원래 byte와 같다고 표시하지 않는다. 별도 PNG 14개는 원본·실제 결과·AI 기술 검토를 보존한 의도 변경이다. 기존 Inspector 8개와 추가 단위 선택기·확률 공명 UI 6개를 구분한다. 수치 golden과 기존 core/chain workspace·analysis PNG 14개는 그대로다.

현재 구현은 기존 16 ODE·허용오차, 정밀 입력·표시·전체 설정, 조건 목록·기록/재생·실제 위상 자료, 확률·구조·확장·설계·런타임·공개 API·장치 관찰의 새 consumer를 제공한다. 이전 경로는 원문과 설정 envelope를 보존하고, 부분 query에는 명시적 base를 요구한다. workspace/연구 DB는 전용 preview와 별도 제품 저장 영역을 사용한다. 정확한 범위와 복구 절차는 `S28-compatibility-and-rollback.md`를 확인한다.

## 실행 증거와 재현

최종 증거는 실제 프로세스 종료 코드와 원시 runner report, source/helper 전후 SHA, 동결 production build 348파일 및 실제 export 바이트에 결속한다. 실패·skip·중복·누락·stale source·다른 build·변조된 첨부를 거부한다. 전체 단위 7,308건과 E2E helper/PNG 보완 뒤 현재 기능·보존 단위 724건은 각각 다른 실제 실행으로 기록한다.

원본 runner 보고서·capture·첨부는 Git `-text`로 byte를 보존한다. 실패와 대체된 시도도 성공 기록으로 덮어쓰지 않는다. 초기 35 gap·99 unverified·0인증 판정은 당시의 역사적 기록이며 `evidence/extra-checks/historical/`과 progress에 보존한다. 최종 판정은 검증을 마친 현재 소스의 새 matrix를 생성한 뒤에만 갱신한다.

`replay/README.md`에는 실제 생산 입력·스크립트·SHA manifest와 새 namespace에서 재실행하는 절차가 있다. fresh clone의 보관된 해시만으로 실행을 인증하지 않는다. 원래 348파일 build와 실행 경로가 없거나 현재 source가 달라지면 build·단위·브라우저 capture를 새로 만든다.

```powershell
# 현재 입력을 다시 읽는 조사. matrix를 쓰지 않는다.
npx tsx scripts/redesign/parity-audit.ts

# 실제 인증 bundle 연결 후 matrix를 생성한다. S01 원본은 변경하지 않는다.
npx tsx scripts/redesign/parity-audit.ts --write

# 저장된 matrix의 현재 소스 일치 및 실행 인증 gate를 검사한다.
npx tsx scripts/redesign/parity-audit.ts --check --certify

npx vitest run tests/product/parity/audit.test.ts --maxWorkers=1
```

`--certify`는 실제 capture와 build를 다시 검사한 결과로만 통과한다. 수동으로 100%·전환 가능 값을 쓴 JSON, 검증하지 않은 행, 변경된 S01 원본과 오래된 matrix는 거부한다. HEAD가 문서 commit으로 달라지는 것과 실제 source fingerprint 변경을 구분한다.

## 사용자 검토와 전환 경계

교육 8과정·86단원은 automated-verified/source-checked이며 human-reviewed는 0/86이다. AI·fixture·workflow 검사를 사람 또는 물리 전문가 승인으로 바꾸지 않는다. 모델 selector는 실행 환경에 노출되지 않았으므로 관찰·변경했다고 주장하지 않는다.

S28은 기본 `app.html`·Landing URL·기존 저장소를 유지한다. 전체 릴리스 R·CI green·실기기·하드웨어 GPU 인증이나 배포 전환을 주장하지 않는다. 알려진 dependency 및 큰 lazy worker의 예산 부채와 S29 standalone manifest 범위는 최종 검토 보고서에 공개한다. 사용자 gate 28은 미승인이며, 최종 S28 보고를 받은 뒤 사용자가 29단계 실행을 요청해야 다음 전환 단계로 진행한다.
