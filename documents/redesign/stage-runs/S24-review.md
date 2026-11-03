# S24 연구 워크플로 사용자 검토

## 열기

- 개발 서버: `npm run dev`, `http://127.0.0.1:5173/next.html#/lab/double`
- production: `npm run build` 후 `npm run preview -- --port 4173`, `http://127.0.0.1:4173/next.html#/lab/double`
- 별도 package 검토: 같은 서버의 `/reviewer.html#/project`. 기존 `/reviewer.html` 배포 증거 콘솔도 유지한다.
- 제공 예시: [S24-example.zip](S24-example.zip), [파일별 독립 SHA-256](S24-example-manifest.json). 실제 기존 이중진자 엔진으로 계산한 두 run, native 에너지 분석, 두 figure와 notebook을 담는다.

## 확인할 흐름

1. Lab에서 짧은 이중진자 실험을 실행한다. `분석 → 연구 프로젝트 · 재현 패키지`를 열고 제목·연구 질문으로 프로젝트를 만든다. 다른 세션을 추가하고 현재 기록을 연구 run으로 보존한다. 시스템 라이브러리에서 복합진자로 이동한 뒤 같은 프로젝트에 두 번째 run을 담고 다시 돌아와 두 run이 유지되는지 확인한다. 시작·종료까지 보존한 기록과 partial 기록을 구분한다.
2. 보존된 run의 canonical 설정과 원본 series의 시간축·좌표·단위·seed·모델/적분기 버전을 확인한다. 원본 `experiment.json`을 내려받아 해당 시스템 Lab의 상태 JSON 가져오기로 초기조건을 복원할 수 있다. 기존 분석 도구에서 받은 native JSON을 원 run에 첨부한다. 다른 입력의 결과는 거부되고 이전 프로젝트가 유지되는지 확인한다.
3. notebook에 관찰과 해석을 적고 artifact ID를 연결한다. figure composer에서 원본 series와 축·theme·caption을 고른다. 그림·CSV·보고서에 원 run과 source SHA-256이 연결되는지 확인한다. 상태 좌표끼리의 그림은 산점도이며 각속도를 운동량으로 바꾸지 않는다.
4. 재현 ZIP을 내보내고 새 브라우저 환경에서 가져온다. 미리보기를 확인하기 전에는 현재 프로젝트가 교체되지 않아야 한다. 채택 후 같은 session/run/artifact/노트북/그림이 복원되고 원본 바이트가 유지되는지 확인한다. 별도 로컬 저장은 명시적으로 저장한 경우만 갱신한다.
5. ZIP을 풀어 `reviewer.html`을 네트워크 없이 연다. 보고서·manifest·삽입 그림이 보여야 한다. 이 정적 파일은 export 당시 보기이며 체크섬 재검사를 수행하지 않는다. 전체 ZIP 검증은 별도 `/reviewer.html#/project`에 ZIP을 넣어 수행한다. 누락 source는 숨기지 않고 보고서·figure의 unavailable 파일에 표시한다.
6. 가져오기/내보내기/원본 첨부 중 취소와 손상 파일 오류를 확인한다. 이전 프로젝트·기존 앱 저장 키·원본 파일이 보존되어야 한다. 좁은 화면과 키보드에서도 프로젝트·파일 선택·검토가 가능해야 한다.

## 재현 패키지 규격과 한계

- 프로젝트 manifest는 `pendulum-research-project/v1`, package는 `pendulum-research-package/v1`, notebook은 `pendulum-research-notebook/v1`이다. 기존 `pendulum-bundle-checksums/v2` 형식의 SHA-256/CRC32/legacy hash를 재사용한다. checksum manifest 자신을 제외한 모든 파일을 정확히 검증한다.
- package ZIP은 STORE 방식, 최대64 MiB/512파일, 원본 파일24 MiB, 프로젝트 metadata2 MiB다. localStorage는 별도 key에3 MiB 이하 ZIP을 저장한다. 네이티브 파일에는 각 원래 도구의 더 작은 한도도 적용된다.
- 실제 기록은 최대8192표본·256좌표·100만 scalar다. 자동 보간·축약은 하지 않는다. 장시간 실행에서 시작 부분이 이미 제거된 기록은 partial로 보존한다. 그림의 error=0 열은 불확실성을 추정하지 않았다는 뜻이며 측정 오차가 0이라는 주장이 아니다.
- 같은 페이지의 내부 라우트 이동에서는 프로젝트·직전 프로젝트·검증 미리보기를 메모리에 유지한다. 새로고침·탭 종료·다른 브라우저로의 이동에는 명시적 ZIP 또는 로컬 저장이 필요하다. 현재 폼에서 아직 저장하지 않은 narrative 초안은 프로젝트 manifest와 구분한다.
- import/ZIP/hash/native 파일 검증과 캡처는 전용 worker에서 실행한다. 취소는 worker를 종료하며30초 무응답을 오류로 처리한다. 진행률은 단계 진행이며 초 단위 완료 예측이 아니다.
- 기존 research ZIP 호환 adapter는 checksum을 검증하고 원본 ZIP 및 모든 멤버를 보존한다. legacy snapshot을 canonical run으로 변환하거나 외부 notebook/HTML/SVG를 실행하지 않는다. legacy ZIP 원본 첨부는24 MiB 이하이며 member 개수·총 바이트 상한도 적용된다. 전체 legacy migration/parity는 S28 범위다.
- SHA-256은 패키지 내부 무결성을 검증한다. 외부 출처의 진위, 기록의 실제 실험 수행 여부, 과학적 정확성, 사람의 검토 또는 모든 하드웨어에서의 bitwise 재현을 인증하지 않는다. 기록 캡처는 실행중인 엔진/지연 버퍼/worker checkpoint를 복제한 것이 아니다.
- 사람의 과학 검토는 미완료다. 기존 dependency/CodeQL 보안 부채를 해결하거나 수락한 것으로 표시하지 않는다. 실제 검증 명령·횟수·환경·제한은 `S24-verification.json`과 `S24-progress.md`에 기록한다.

## 보존과 복구

기존 `app.html`, 순수 엔진, 공개 API, 기존 저장/공유 schema와 사용자 데이터는 유지한다. S23 원격 status commit `e6aa7094229e26527b02ceeeeb0cb7e6c01b38a3`이 이전 단계 복구 기준이며 기존 앱 경로를 계속 사용할 수 있다. S24는 기본 앱 전환이나 master 병합을 수행하지 않는다.

이 checklist를 받은 후 사용자가 `25단계 실행해줘.`라고 요청하면 S24 연구 워크플로 사용자 승인으로 기록한다. 질문이나 수정 요청은 승인으로 간주하지 않으며 과학 전문가의 실제 검토를 대신하지 않는다.
