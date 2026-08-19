# 불확도·재현성 제출 체크리스트

## 데이터

- [ ] 원자료는 덮어쓰지 않았고 원본 hash를 기록했다.
- [ ] 모든 열에 이름·단위·결측값 규칙이 있다.
- [ ] 제외한 표본과 이유를 기록했다.
- [ ] 카메라/IMU 사용 시 보정값, 권한 결과, sampling jitter, marker-loss 구간을 저장했다.

## 수치 계산

- [ ] 적분기, `dt` 또는 tolerance, 최대 step, seed를 기록했다.
- [ ] `dt` 절반화/허용오차 강화 결과를 비교했다.
- [ ] implicit solver의 residual·반복·수렴 상태를 확인했다.
- [ ] 감쇠계는 dissipated-work balance, 보존계는 energy drift를 사용했다.
- [ ] Poincaré 표본은 crossing direction과 root residual을 포함한다.

## 통계와 주장

- [ ] 반복 수, 평균, 산포와 불확도 산출법을 썼다.
- [ ] 기준값/독립 구현과 비교 범위를 명시했다.
- [ ] 카오스 비교는 shadowing horizon 또는 오차 밴드를 사용했다.
- [ ] 유한 시간·유한 해상도 결과를 수학적 증명으로 표현하지 않았다.

## 재현 묶음

- [ ] 앱 버전, source SHA, package/lockfile hash를 기록했다.
- [ ] 설정 snapshot, accepted-step metadata, CSV, figure와 manifest가 있다.
- [ ] 다른 기기 또는 새 브라우저 프로필에서 재현 절차를 확인했다.
- [ ] 개인정보·장치 식별자를 제거했다.

