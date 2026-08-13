# 세계 수준 하드닝 통합 감사 색인

최종 무결성 확인: 2026-07-22. 이 문서는 두 저장소에 분산된 세부 감사 보고서의 전역 번호와 구현 근거를 연결하는 색인이다. 각 세부 보고서는 제안 목록이 아니라 실제 구현 완료 목록이다.

| 전역 번호 | 개수 | 영역 | 세부 보고서 |
|---:|---:|---|---|
| 1–66 | 66 | 랜딩 로딩 수명주기, 3D 물리·스크롤 연출, 접근성, 다국어, 성능·브라우저 검증 | [Pendulum Landing 감사](https://github.com/elliotjung/pendulum-landing/blob/main/docs/WORLD_CLASS_AUDIT_2026-07-20.md) |
| 67–105 | 39 | Pendulum Lab 반응형 UI, 모드·언어, 공용 모달, 검색·IME, 강제색·확대·키보드 | [UI 하드닝 보고서](./UI_HARDENING_2026-07-20.md) |
| 106–188 | 83 | 수치·확률 코어, 연구·런타임 경계, PWA, 공급망·워크플로·배포 gate | [비-UI 품질 하드닝 보고서](./QUALITY_HARDENING_2026-07-20.md) |
| **합계** | **188** | **두 프로젝트 전체** | **세 보고서 모두 구현·검증 근거 포함** |

## 번호 무결성

Markdown 표의 번호 열을 기계적으로 다시 읽어 확인한 결과는 다음과 같다.

- 전체 188개, 고유 번호 188개
- 최솟값 1, 최댓값 188
- 누락 번호 0개, 중복 번호 0개
- 범위별 개수: 1–66은 66개, 67–105는 39개, 106–188은 83개

## 구현 근거 지도

| 범위 | 대표 구현 | 대표 회귀 근거 |
|---:|---|---|
| 1–22 | 랜딩 `assets/main.js`, `assets/scene.js`의 지연 로드·WebGL2·prewarm/context lifecycle | `tests/landing-smoke.spec.ts`의 기본 로드, 폴백, preference, context-loss 경로 |
| 23–40 | RK4 좌표, 3D stage·light·particle, adaptive render tier, 2.25회 스크롤 회전·하강 | 공개 `scrollPose`·상태 API와 다중 브라우저 스크롤 검증 |
| 41–66 | 랜딩 metric 재계산, safe area·print·고대비, 미니랩 ARIA/i18n, KO 생성, Lighthouse·CI 직렬화 | 정적 검사, EN/KO·axe·asset Playwright, 3회 중앙값 Lighthouse |
| 67–105 | `src/app/Shell.ts`, `src/app/UiPolish.ts`, `src/app/modalSurface.ts`, `audiencePreferences.ts`, `control-search.ts`, `stable-help.ts`, command palette, `css/11-ui-hardening.css` | UI contract 14/14, module-size audit, production-preview Chromium E2E 11/11 |
| 106–124 | 8개 main workflow와 landing release workflow, Pages exact-SHA/`build_type=workflow` gate, bounded evidence dispatch, Stryker·mutation 전용 설정 | workflow 계약, remote Pages API 재조회, tracked-drift 계약, Stryker dry run |
| 125–164 | stochastic·`stochasticSteppers.ts`·수치 예산, FFT, event locator, linear/Cholesky solver | stochastic 전체 20/20, hostile·alias·overflow·atomicity 회귀 묶음, module-size audit |
| 165–188 | 연구 sampling, referral, shared ring/seqlock, service worker/PWA, Kramers, direct matrix SDE, library build | 실제 Node Worker stress, SW/workflow 계약, quick 179 files/1,266 tests |

## 최종 검증 스냅샷

- Pendulum Lab: typecheck, 609-file lint, format, build, library build, bundle budget, standalone/wasm sync 모두 통과.
- 코어 회귀: stochastic 20/20, 집중 묶음 8 files/108 tests, quick 179 files/1,266 tests 통과.
- UI 브라우저 회귀: production preview Chromium 11/11 통과(320–1024px, 중첩 모달, IME, coarse pointer, forced colors, 200% scale 포함).
- 공급망 검사: `npm audit` 0건, legacy risk 0, mojibake finding 0, pending install scripts 0. Miniflare/sharp는 exact direct dependency이며 reviewed esbuild/workerd install script와 실제 Images transform smoke로 검증했다.
- 원격 release control: 두 저장소 vulnerability alerts를 확인했고 landing Pages를 legacy에서 workflow source로 전환해 custom quality gate 우회를 차단했다.
- 랜딩의 최신 브라우저·Lighthouse 수치는 랜딩 세부 보고서의 검증 기록을 단일 기준으로 삼는다.

`tmp-trace-lab3d/`는 사용자 소유의 로컬 비추적 산출물이므로 감사 구현·검증·커밋 범위에서 제외하고 건드리지 않았다.
