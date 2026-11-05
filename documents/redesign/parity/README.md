# S28 기능 동등성 심사

현재 결과는 **미인증이며 S29 전환을 허용하지 않는다**. 보존된 기존 파일, 카탈로그 등록, 화면 주소 후보는 실제 새 UI의 기능 동등성 통과와 구분한다.

`S28-matrix.json`은 동결된 S01 인벤토리의 파일 883개, 의미 기능 118개, AST 관찰 6,825개를 각각 빠짐없이 기록한다. 실행 심사 행은 의미 기능 118개와 등록 적분기 16개를 합한 134개다. AST 관찰은 함수·제어·API·asset 등의 정적 증거이며 사용자 기능 수로 간주하지 않는다.

행의 `preserved`는 S01 검사기가 정의한 기존 소스 투영과 AST 관찰이 보존되었다는 뜻이다. 승인된 additive 변경 및 EOL 정규화는 기존 `inventory.ts`의 좁은 투영을 사용한다. 이 값은 새로운 화면에서 해당 기능을 실행했거나 수치 결과가 같다는 의미가 아니다. 카탈로그/단계 책임이 있는 항목에는 연결 ID를 남기고, 소유 관계가 증명되지 않은 세부 관찰은 null로 남긴다.

`executable`의 주소는 후보이며 `requiredEvidence`는 아직 비어 있다. 새 UI 조작, 기존 결과와의 비교 및 허용오차, 저장·공유 round trip, 실제 테스트 결과, export artifact를 각 행에 연결하고 검사하기 전에는 pass를 부여할 수 없다. 기존 앱으로 가는 링크만으로 새 UI 동등성을 인증하지 않는다. `unverified`는 실패 판정이 아니라 검증 증거가 닫히지 않았다는 의미이며, `gap`은 소스 조사에서 확인한 구현 차이다. 이 감사 도구 자체의 0%는 제품 기능이 모두 고장났다는 뜻이 아니라 S28 실행 인증 행이 아직 0개라는 뜻이다.

실제 구현 차이는 `gaps`의 이유와 소스·행 번호에서 확인한다. 현재 새 UI에는 소리화, OGY, live camera/IMU, 명령 팔레트, 언어 선택, 일부 정밀 입력·기록/재생 조작, 일부 확률 적분기, GPU/Wasm 실행, 기존 브라우저 공개 namespace와 자유 Lab 적분기 선택 등의 차이가 있다. 일부 기능의 카탈로그 설명이나 제한된 교육 실험이 존재하는 경우에도 전체 기존 계약을 보존한 것으로 대신 표시하지 않는다.

기존 share v1–v4, tab/query·수치 딥링크, workspace·연구 DB는 현재 원본 백업과 기존 앱 복구만 제공하며 canonical 실행/가져오기에는 연결하지 않는다. session·saved-run의 새 재시작 변환은 Euler/RK2/RK4만 지원하므로 다른 기존 적분기의 저장 파일은 복구 안내 대상이다. 이러한 지원 제한을 조용히 바꾸지 않고 원본을 보존하는 동작은 migration의 데이터 안전 조건에 맞지만, 해당 기존 기능의 새 UI 동등성은 아직 충족하지 않는다. 이 8개 항목도 `unverified` 대신 근거가 확인된 `gap`으로 분류한다. 현재 실행 심사는 **35개 gap·99개 unverified·0개 인증**이다.

```powershell
# 읽기 전용 조사. 매번 현재 소스와 동결 S01 입력을 다시 읽는다.
npx tsx scripts/redesign/parity-audit.ts

# 명시적으로 감사 행렬을 생성/갱신한다. 원래 S01 파일은 변경하지 않는다.
npx tsx scripts/redesign/parity-audit.ts --write

# 저장 행렬이 현재 소스와 일치하는지 검사한다. 일치하면 exit 0.
npx tsx scripts/redesign/parity-audit.ts --check

# 동일성 검사 후 실제 인증 gate를 검사한다. 현재는 미검증/차이로 exit 1이 정상이다.
npx tsx scripts/redesign/parity-audit.ts --check --certify

npx vitest run tests/product/parity/audit.test.ts
```

동결 인벤토리 SHA-256, 실제 product 코드/CSS/진입점과 감사 도구의 source fingerprint를 저장한다. HEAD 값은 문서·상태 커밋으로만 바뀔 수 있으므로 fingerprint를 대신 사용하며, 코드가 바뀌면 `--check`가 오래된 행렬을 거부한다. 누락·중복·변조 행, 변경된 S01 원본, 카탈로그/파일 경로만 넣은 pass, 조작한 100%/전환 승인 값은 검사에서 거부한다. `--certify`의 실패는 stage gate 결과이며 감사 도구의 단위 테스트 실패와 혼동하지 않는다.

사람 검토 및 사용자 S28 승인 기록은 이 파일이나 정적 검사로 생성하지 않는다. 교육 콘텐츠 86개가 source-checked여도 human-reviewed로 바꾸지 않으며, 실제 전환과 rollback 실행은 S28 모든 조건과 사용자 checkpoint 승인을 충족한 뒤 S29에서 수행한다.
