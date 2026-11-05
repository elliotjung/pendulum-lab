# 과정8 — 계산 실험과 재현 가능한 연구

## 범위와 실제 계산

S27의 `8.1`~`8.12`는 한국어·영어 이론, 변수·단위, 유도와 식, 예측→실행→관찰→설명, 확인 질문 두 개, 용어, 출처와 canonical Lab 전달을 포함한다. 모든 단원은 독립적으로 열 수 있고 진행도가 기능을 잠그지 않는다.

| 단원 | 실제 재사용 기능 | 해석의 한계 |
|---|---|---|
| 8.1 | S21 `buildBatch`/`executeBatchRun`/`aggregateBatch` paired | 한 입력의 유한 endpoint 차이이며 수치 오차·전역 인과성의 인증이 아님 |
| 8.2 | S21 grid/log/LHS/ensemble 네 설계와 실제 run | 작은 단일 입력 설계이며 희귀 사건·다변수 상호작용을 전수 방문하지 않음 |
| 8.3 | S22 CSV preview/confirm, `runInverse`의 native RK4/LM | 알려진 초기상태의 단일 g 국소 복원; deterministic 교란은 posterior/실측 잡음 아님 |
| 8.4 | S22 CSV/sensor preview/confirm와 calibration 이력 | native 자료를 ms·deg로 표시한 교육 기록. 실제 영상 decode는 DOM이 필요한 전체 Lab에서 수행 |
| 8.5 | S22 `runInverse`의 native Sobol | 독립 균등 입력 g의 유한 표본 민감도; 지수를 강제 절삭하지 않음 |
| 8.6 | S22 native normalized Legendre PCE·다른 seed의 LHS validation | 훈련 적합도·새 입력 오차를 분리하고 외삽 거부. validation은 전역 오차 상한 아님 |
| 8.7 | S23 native SINDy 훈련·저장 모델 재평가 | 이중진자 theta1/omega1 투영은 일반적으로 닫힌 상태가 아님 |
| 8.8 | S23 native DMD operator·이산/연속 spectrum, HAVOK σ·basis·core A/B·spectrum·held-out forcing | DMD 공간 고유벡터는 native 결과에 없어 만들어내지 않음. HAVOK validation forcing은 관측에서 제공되며 완전 autonomous 예측 아님 |
| 8.9 | S14 native Duffing harmonic limit + S23 reservoir/Hamiltonian | 정규화 unit mass의 q=x,p=v. 이중진자 각속도를 운동량으로 가장하지 않음. native Hamiltonian은 다항 회귀이며 신경망 epoch 학습 아님 |
| 8.10 | S23 native Arnoldi/Lanczos와 원 연산자 residual | 무차원 대칭 Dirichlet 삼대각 benchmark. 정규화 Ritz 벡터의 절대 residual이며 relative residual로 바꾸어 부르지 않음 |
| 8.11 | S24 project/session/capture run/원본 artifact/ZIP import | 두 실제 run 기록 일치와 bytes 무결성. 외부 진위·과학 검토·모든 장치 bitwise 재현 아님 |
| 8.12 | S24 notebook/figure SVG·CSV/report/static reviewer/검증 ZIP | 실제 다운로드 ZIP. static reviewer가 checksum 재실행·사람 과학 검토를 대체하지 않음 |

`reproducibility-focus-*`는 기존 공용 계산을 조합하는 bounded 교육 adapter다. 운동방정식·적분기·회귀·UQ·Krylov·checksum/ZIP 알고리즘을 복제하지 않는다. 범위 밖 데이터와 불법 입력은 명시적으로 거부한다. native 비수렴·표본·단위 경고를 결과에 유지한다.

## 전달과 다운로드

- canonical은 원래 물성·초기조건·실행 기간·step·단위·모델/적분 버전과 `learn:course-8:<id>:v1` 출처를 보존한다.
- Lab 전달은 기준 run을 초기조건에서 시작한다. 동반 sweep·학습 모델·import 관측·연구 project를 자동으로 기존 Lab 데이터에 합치지 않는다. 그 자료는 Focus 표/진단 JSON 또는 별도 ZIP으로 보존한다.
- 8.11/8.12 다운로드는 현재 단원 입력의 짧은 native run을 다시 계산해 실제 ZIP을 만들고 import 검증한다. 화면에 표시한 artifact hash와 다운로드 ZIP의 원 artifact hash는 같은 canonical 출처로 일치한다.
- 8.12 ZIP은 원 설정·series, project/package/checksum manifests, notebook.json, report.md, reviewer.html 및 원 series와 연결된 figure SVG/CSV를 포함한다. 원 시계열을 대신하여 그림만 남기지 않는다.
- checksum은 파일 bytes 무결성만 확인한다. 그림의 uncertainty는 측정하지 않았고 error=0을 측정된 무불확실성으로 해석하지 않는다.

## 출처 대조

2026-11-05에 단원의19개 고유 native 출처 경로가 기준 commit `9cfd9842570cdd3137e3ea866a1266de2585b941`에 실제 존재함을 Git object로 확인했다. 단원별 locator는 호출 함수·가정·경고 위치를 명시한다. 외부 1차 자료도 아래와 같이 확인했다. 이는 AI의 source-check이며 사람/물리 전문가 review가 아니다.

- [NIST 실험 설계](https://www.itl.nist.gov/div898/handbook/pri/section2/pri212.htm): 단일 요인 설계와 상호작용 한계. 검색에서 해당 공식 본문을 확인했으며 직접 open 재시도는 timeout이었다.
- [McKay·Beckman·Conover 원논문](https://www.stat.cmu.edu/technometrics/70-79/VOL-21-02/v2102239.pdf): LHS 축별 층화 설계와 유한 표본 전제.
- [NIST 최소제곱](https://www.itl.nist.gov/div898/handbook/pmd/section1/pmd141.htm): 잔차 최소화와 모형 전제. native 진자 추정은 비선형 전방 RK4/LM이며 이를 선형 회귀라고 부르지 않는다.
- [W3C 표형 데이터 모델](https://www.w3.org/TR/tabular-data-model/): 원 표와 열·datatype·단위 metadata 분리.
- [Saltelli 등의 원논문](https://doi.org/10.1016/j.cpc.2009.09.018): 분산 기반 1차·총효과 지수.
- [저자 공개 PCE 원고](https://sudret.ibk.ethz.ch/publications/preprints-archive/2016-007.html): PCE surrogate와 sensitivity 분석. 실제 식·기저 정규화·별도 validation은 보존 native 소스에서 대조했다.
- [Brunton·Proctor·Kutz 원논문](https://doi.org/10.1073/pnas.1517384113): 희소 library 회귀와 좌표/기저 의존성.
- [HAVOK 저자 원논문](https://arxiv.org/abs/1608.05306): 지연 좌표와 retained 선형/forcing 분해. native validation forcing 한계는 보존 소스에서 별도 대조했다.
- [Hamiltonian Neural Networks 원논문](https://arxiv.org/abs/1906.01563): 보존 구조의 학습 편향에 대한 참고. 이 프로젝트의 native 다항 회귀가 해당 neural network 구현이라고 주장하지 않는다.
- [Netlib Arnoldi 저자 설명](https://netlib.org/utk/people/JackDongarra/etemplates/node215.html): 희소 연산자·Krylov 부분공간·restart 개요. actual residual 정의는 native adapter의 `eigenResidual`과 대조했다.
- [W3C PROV Primer](https://www.w3.org/TR/prov-primer/): entity/activity/generation/derivation 개념. 프로젝트가 W3C RDF 구현 인증을 받았다고 주장하지 않는다.

## 검증 기록

초기 직접 native suite는44/44 통과했다. 포함 범위는12개 실제 기본 계산, 각 단원 첫 노출 필드의 일반 수정, 동일 seed LHS 반복, zero paired perturbation, 알려진 g 복원과 native 비수렴, 원본 보존 calibration, Sobol48/PCE24 평가 수와 별도 validation8, 두 실제 run·네 원본 artifact ZIP roundtrip, download source canonical과 표시 hash 일치, 물리 rebinding·malformed import·ZIP 변조 거부, 모든 필드의 고정/미지/비유한/범위 경계다. g 복원 residual 허용치는 관측 생성과 각 관측시각별 native 적분의 부동소수점 바닥을 고려한2e-8 rad다.

명시적 소유 파일의 ESLint와 Prettier가 통과했다. 전체86단원 schema·차원·route·transfer, 공통 worker lifecycle, 전체 Vitest와 browser/a11y/시각 검증은 S27 통합 증거를 따른다. 초기 direct suite가 이러한 최종 검증을 대신하지 않는다.

과학 검증 상태: 자동 fixture 및 source-check 대상, `human-reviewed`는12개 모두 false. 사용자 workflow 승인과 과학 전문가 검토를 혼동하지 않는다.

### 독립 구현 검토 반영

- SINDy 훈련/validation RMSE를 혼합 `rad/s · rad/s^2`, 상태 rollout을 혼합 `rad · rad/s`로 명시했다. DMD의 상태 오차도 혼합 단위다. 이를 무차원1로 표시하지 않는다.
- HAVOK core 도함수 RMSE는 `s^-1`, 관측 forcing을 쓰는 latent 재구성 오차는1이다. 비율·표본 수·rank는1이며8.9의 상태·도함수·학습 H는 각각 정규화 좌표/시간/에너지임을 표시한다.
- 각 모델의 native `output.details`를 결과 표에 보존하여 derivative fit, teacher forcing, 자유 rollout과 전처리 구간 의미를 확인할 수 있다.
- 8.8은 실제 저장 모델의 DMD one-step operator, 이산 multiplier와 complex-log/dt spectrum, 성장률·각주파수를 표시한다. HAVOK은 실제 retained singular values, frozen training delay basis, core A·forcing coupling B, 연속 core spectrum, 모든 제한된 held-out window의 native 투영과 마지막 관측 forcing을 표시한다. 새 엔진·회귀·eigensolver를 구현하지 않는다.
- 추가 독립 대조 테스트는 직접 실행한 S23 모델과 각 표·basis·spectrum·forcing 값을 비교하고 rank2→3에서 core mode1→2와 관측 forcing 변화가 나타남을 확인한다. 검토 수정 후 표적46/46이 통과했다. 이 기록은 전체 S27 최종 검증을 대신하지 않는다.
