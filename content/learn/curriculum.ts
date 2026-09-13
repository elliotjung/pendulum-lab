import type { LearnCourse } from '../../src/product/learn/schema';

/** Curriculum metadata; only completed lessons are published. */
export const courses = [
  {
    schema: 'pendulum-learn-course/v1',
    id: 'course-1',
    order: 1,
    title: {
      key: 'learn.course-1.title',
      ko: '이중진자의 모델과 운동방정식',
      en: 'Models and equations of the double pendulum'
    },
    description: {
      key: 'learn.course-1.description',
      ko: '두 각도에서 운동방정식·정상모드·초기조건 민감성까지, 8개 단원의 이론과 공용 엔진 전용 실험으로 탐구합니다.',
      en: 'Explore eight lessons from coordinates to equations, normal modes and initial-condition sensitivity with focused shared-engine experiments.'
    },
    units: [
      {
        id: '1.1',
        courseId: 'course-1',
        title: {
          key: 'learn.course-1.1.1.title',
          ko: '이중진자의 일반화좌표와 구성공간',
          en: 'Generalized coordinates and configuration space'
        },
        availability: 'published',
        contentVersion: 1
      },
      {
        id: '1.2',
        courseId: 'course-1',
        title: {
          key: 'learn.course-1.1.2.title',
          ko: '질점 위치·속도와 기하학적 구속',
          en: 'Positions, velocities and geometric constraints'
        },
        availability: 'published',
        contentVersion: 1
      },
      {
        id: '1.3',
        courseId: 'course-1',
        title: {
          key: 'learn.course-1.1.3.title',
          ko: '운동에너지·위치에너지와 질량행렬',
          en: 'Kinetic energy, potential energy and the mass matrix'
        },
        availability: 'published',
        contentVersion: 1
      },
      {
        id: '1.4',
        courseId: 'course-1',
        title: {
          key: 'learn.course-1.1.4.title',
          ko: '라그랑주 방정식의 완전 유도',
          en: 'Full derivation of the Lagrange equations'
        },
        availability: 'published',
        contentVersion: 1
      },
      {
        id: '1.5',
        courseId: 'course-1',
        title: {
          key: 'learn.course-1.1.5.title',
          ko: '결합항·코리올리형 항·중력항',
          en: 'Coupling, Coriolis-type and gravitational terms'
        },
        availability: 'published',
        contentVersion: 1
      },
      {
        id: '1.6',
        courseId: 'course-1',
        title: {
          key: 'learn.course-1.1.6.title',
          ko: '작은 진동 근사와 정상모드',
          en: 'Small oscillations and normal modes'
        },
        availability: 'published',
        contentVersion: 1
      },
      {
        id: '1.7',
        courseId: 'course-1',
        title: {
          key: 'learn.course-1.1.7.title',
          ko: '에너지 교환과 모드 혼합',
          en: 'Energy exchange and mode mixing'
        },
        availability: 'published',
        contentVersion: 1
      },
      {
        id: '1.8',
        courseId: 'course-1',
        title: {
          key: 'learn.course-1.1.8.title',
          ko: '초기조건 민감성과 카오스의 출현',
          en: 'Sensitivity to initial conditions and the onset of chaos'
        },
        availability: 'published',
        contentVersion: 1
      }
    ]
  },
  {
    schema: 'pendulum-learn-course/v1',
    id: 'course-2',
    order: 2,
    title: {
      key: 'learn.course-2.title',
      ko: '수치적으로 운동을 푸는 방법',
      en: 'Solving motion numerically'
    },
    description: {
      key: 'learn.course-2.description',
      ko: '교육과정 지도에 예약된 과정입니다. 공개된 샘플과 앞으로 제작할 단원을 함께 탐색합니다.',
      en: 'A course reserved in the curriculum map. Explore available samples and planned units.'
    },
    units: [
      {
        id: '2.1',
        courseId: 'course-2',
        title: {
          key: 'learn.course-2.2.1.title',
          ko: '2차 운동방정식의 1차 상태공간 변환',
          en: 'First-order state-space form of second-order equations'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '2.2',
        courseId: 'course-2',
        title: {
          key: 'learn.course-2.2.2.title',
          ko: '명시적 Euler와 국소 절단오차',
          en: 'Explicit Euler and local truncation error'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '2.3',
        courseId: 'course-2',
        title: {
          key: 'learn.course-2.2.3.title',
          ko: 'Runge–Kutta 계열과 적응형 시간 간격',
          en: 'Runge–Kutta methods and adaptive time steps'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '2.4',
        courseId: 'course-2',
        title: {
          key: 'learn.course-2.2.4.title',
          ko: 'symplectic 적분과 위상공간 보존',
          en: 'Symplectic integration and phase-space preservation'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '2.5',
        courseId: 'course-2',
        title: {
          key: 'learn.course-2.2.5.title',
          ko: 'implicit 적분과 강성 문제',
          en: 'Implicit integration and stiffness'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '2.6',
        courseId: 'course-2',
        title: {
          key: 'learn.course-2.2.6.title',
          ko: '사건 검출과 Poincaré 교차의 보간',
          en: 'Event detection and Poincaré crossing interpolation'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '2.7',
        courseId: 'course-2',
        title: {
          key: 'learn.course-2.2.7.title',
          ko: '허용오차·step size·계산비용의 균형',
          en: 'Balancing tolerance, step size and computational cost'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '2.8',
        courseId: 'course-2',
        title: {
          key: 'learn.course-2.2.8.title',
          ko: '에너지·구속·시간역전 검증',
          en: 'Energy, constraint and time-reversal checks'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '2.9',
        courseId: 'course-2',
        title: {
          key: 'learn.course-2.2.9.title',
          ko: '적분기 비교 실험의 재현성',
          en: 'Reproducible integrator comparisons'
        },
        availability: 'planned',
        contentVersion: null
      }
    ]
  },
  {
    schema: 'pendulum-learn-course/v1',
    id: 'course-3',
    order: 3,
    title: {
      key: 'learn.course-3.title',
      ko: '삼중·다중·비강체·공간 진자',
      en: 'Triple, multiple, flexible and spatial pendulums'
    },
    description: {
      key: 'learn.course-3.description',
      ko: '교육과정 지도에 예약된 과정입니다. 공개된 샘플과 앞으로 제작할 단원을 함께 탐색합니다.',
      en: 'A course reserved in the curriculum map. Explore available samples and planned units.'
    },
    units: [
      {
        id: '3.1',
        courseId: 'course-3',
        title: {
          key: 'learn.course-3.3.1.title',
          ko: '삼중진자의 질량행렬과 재귀 구조',
          en: 'The triple-pendulum mass matrix and recursive structure'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '3.2',
        courseId: 'course-3',
        title: {
          key: 'learn.course-3.3.2.title',
          ko: 'N중 사슬의 일반화와 계산 복잡도',
          en: 'Generalizing to N links and computational complexity'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '3.3',
        courseId: 'course-3',
        title: {
          key: 'learn.course-3.3.3.title',
          ko: '복합진자의 관성모멘트와 물리진자',
          en: 'Moment of inertia and the compound pendulum'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '3.4',
        courseId: 'course-3',
        title: {
          key: 'learn.course-3.3.4.title',
          ko: '용수철 진자의 길이-각도 결합',
          en: 'Length–angle coupling in the spring pendulum'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '3.5',
        courseId: 'course-3',
        title: {
          key: 'learn.course-3.3.5.title',
          ko: '줄 진자의 장력과 비매끈 사건',
          en: 'Rope tension and nonsmooth events'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '3.6',
        courseId: 'course-3',
        title: {
          key: 'learn.course-3.3.6.title',
          ko: '이중 줄 진자의 구속 전환',
          en: 'Constraint transitions in the double-string pendulum'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '3.7',
        courseId: 'course-3',
        title: {
          key: 'learn.course-3.3.7.title',
          ko: '구면진자의 3차원 운동과 세차',
          en: 'Three-dimensional motion and precession'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '3.8',
        courseId: 'course-3',
        title: {
          key: 'learn.course-3.3.8.title',
          ko: '구면 사슬의 다체 3차원 역학',
          en: 'Many-body dynamics of spherical chains'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '3.9',
        courseId: 'course-3',
        title: {
          key: 'learn.course-3.3.9.title',
          ko: '임베디드 좌표·구속식·좌표 특이점',
          en: 'Embedded coordinates, constraints and coordinate singularities'
        },
        availability: 'planned',
        contentVersion: null
      }
    ]
  },
  {
    schema: 'pendulum-learn-course/v1',
    id: 'course-4',
    order: 4,
    title: {
      key: 'learn.course-4.title',
      ko: '감쇠·구동·비선형 진동과 제어',
      en: 'Damping, driving, nonlinear oscillations and control'
    },
    description: {
      key: 'learn.course-4.description',
      ko: '교육과정 지도에 예약된 과정입니다. 공개된 샘플과 앞으로 제작할 단원을 함께 탐색합니다.',
      en: 'A course reserved in the curriculum map. Explore available samples and planned units.'
    },
    units: [
      {
        id: '4.1',
        courseId: 'course-4',
        title: {
          key: 'learn.course-4.4.1.title',
          ko: '감쇠 이중진자의 위상공간 수축',
          en: 'Phase-space contraction of the damped double pendulum'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '4.2',
        courseId: 'course-4',
        title: {
          key: 'learn.course-4.4.2.title',
          ko: '주기 구동과 공명·위상 지연',
          en: 'Periodic driving, resonance and phase lag'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '4.3',
        courseId: 'course-4',
        title: {
          key: 'learn.course-4.4.3.title',
          ko: '매개변수 여기와 Mathieu 불안정성',
          en: 'Parametric excitation and Mathieu instability'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '4.4',
        courseId: 'course-4',
        title: {
          key: 'learn.course-4.4.4.title',
          ko: 'Kapitza 진자와 유효 퍼텐셜',
          en: 'The Kapitza pendulum and effective potential'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '4.5',
        courseId: 'course-4',
        title: {
          key: 'learn.course-4.4.5.title',
          ko: '역진자와 cart-pole의 선형 안정화',
          en: 'Linear stabilization of inverted pendulums and cart-poles'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '4.6',
        courseId: 'course-4',
        title: {
          key: 'learn.course-4.4.6.title',
          ko: '결합 진자의 동기화와 모드 분할',
          en: 'Synchronization and mode splitting of coupled pendulums'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '4.7',
        courseId: 'course-4',
        title: {
          key: 'learn.course-4.4.7.title',
          ko: 'Duffing 발진기의 다중안정성과 점프',
          en: 'Duffing multistability and jumps'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '4.8',
        courseId: 'course-4',
        title: {
          key: 'learn.course-4.4.8.title',
          ko: 'Van der Pol 발진기와 한계주기',
          en: 'The Van der Pol oscillator and limit cycles'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '4.9',
        courseId: 'course-4',
        title: {
          key: 'learn.course-4.4.9.title',
          ko: '마찰·stick-slip·불연속 동역학',
          en: 'Friction, stick–slip and discontinuous dynamics'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '4.10',
        courseId: 'course-4',
        title: {
          key: 'learn.course-4.4.10.title',
          ko: 'Pyragas 지연 피드백과 불안정 궤도 제어',
          en: 'Pyragas delayed feedback and unstable-orbit control'
        },
        availability: 'planned',
        contentVersion: null
      }
    ]
  },
  {
    schema: 'pendulum-learn-course/v1',
    id: 'course-5',
    order: 5,
    title: {
      key: 'learn.course-5.title',
      ko: '카오스를 측정하는 방법',
      en: 'Measuring chaos'
    },
    description: {
      key: 'learn.course-5.description',
      ko: '교육과정 지도에 예약된 과정입니다. 공개된 샘플과 앞으로 제작할 단원을 함께 탐색합니다.',
      en: 'A course reserved in the curriculum map. Explore available samples and planned units.'
    },
    units: [
      {
        id: '5.1',
        courseId: 'course-5',
        title: {
          key: 'learn.course-5.5.1.title',
          ko: '상태공간·위상공간과 궤적 기하',
          en: 'State space, phase space and trajectory geometry'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '5.2',
        courseId: 'course-5',
        title: {
          key: 'learn.course-5.5.2.title',
          ko: '시계열·스펙트럼·FFT의 해석',
          en: 'Interpreting time series, spectra and FFT'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '5.3',
        courseId: 'course-5',
        title: {
          key: 'learn.course-5.5.3.title',
          ko: 'NAFF와 준주기 기본주파수',
          en: 'NAFF and quasiperiodic fundamental frequencies'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '5.4',
        courseId: 'course-5',
        title: {
          key: 'learn.course-5.5.4.title',
          ko: 'Poincaré 단면과 return map',
          en: 'Poincaré sections and return maps'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '5.5',
        courseId: 'course-5',
        title: {
          key: 'learn.course-5.5.5.title',
          ko: '최대 Lyapunov 지수',
          en: 'The maximal Lyapunov exponent'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '5.6',
        courseId: 'course-5',
        title: {
          key: 'learn.course-5.5.6.title',
          ko: '전체 Lyapunov spectrum과 발산율',
          en: 'The full Lyapunov spectrum and divergence'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '5.7',
        courseId: 'course-5',
        title: {
          key: 'learn.course-5.5.7.title',
          ko: 'SALI와 FLI의 빠른 혼돈 판별',
          en: 'Rapid chaos detection with SALI and FLI'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '5.8',
        courseId: 'course-5',
        title: {
          key: 'learn.course-5.5.8.title',
          ko: '0–1 test와 관측량 의존성',
          en: 'The 0–1 test and observable dependence'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '5.9',
        courseId: 'course-5',
        title: {
          key: 'learn.course-5.5.9.title',
          ko: 'shadowing과 수치 궤적의 신뢰 시간',
          en: 'Shadowing and the trust horizon of numerical trajectories'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '5.10',
        courseId: 'course-5',
        title: {
          key: 'learn.course-5.5.10.title',
          ko: 'recurrence plot과 RQA',
          en: 'Recurrence plots and RQA'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '5.11',
        courseId: 'course-5',
        title: {
          key: 'learn.course-5.5.11.title',
          ko: 'recurrence network 분석',
          en: 'Recurrence network analysis'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '5.12',
        courseId: 'course-5',
        title: {
          key: 'learn.course-5.5.12.title',
          ko: 'correlation dimension과 scaling 영역',
          en: 'Correlation dimension and scaling regions'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '5.13',
        courseId: 'course-5',
        title: {
          key: 'learn.course-5.5.13.title',
          ko: 'multifractal spectrum과 국소 스케일링',
          en: 'Multifractal spectra and local scaling'
        },
        availability: 'planned',
        contentVersion: null
      }
    ]
  },
  {
    schema: 'pendulum-learn-course/v1',
    id: 'course-6',
    order: 6,
    title: {
      key: 'learn.course-6.title',
      ko: '인력권·주기궤도·분기 구조',
      en: 'Basins, periodic orbits and bifurcation structure'
    },
    description: {
      key: 'learn.course-6.description',
      ko: '교육과정 지도에 예약된 과정입니다. 공개된 샘플과 앞으로 제작할 단원을 함께 탐색합니다.',
      en: 'A course reserved in the curriculum map. Explore available samples and planned units.'
    },
    units: [
      {
        id: '6.1',
        courseId: 'course-6',
        title: {
          key: 'learn.course-6.6.1.title',
          ko: '고정점과 선형화 안정성',
          en: 'Fixed points and linearized stability'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '6.2',
        courseId: 'course-6',
        title: {
          key: 'learn.course-6.6.2.title',
          ko: '주기궤도 탐색과 shooting',
          en: 'Periodic-orbit search and shooting'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '6.3',
        courseId: 'course-6',
        title: {
          key: 'learn.course-6.6.3.title',
          ko: 'Floquet multiplier와 궤도 안정성',
          en: 'Floquet multipliers and orbit stability'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '6.4',
        courseId: 'course-6',
        title: {
          key: 'learn.course-6.6.4.title',
          ko: 'Melnikov 방법과 횡단 교차',
          en: 'The Melnikov method and transverse intersections'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '6.5',
        courseId: 'course-6',
        title: {
          key: 'learn.course-6.6.5.title',
          ko: '매개변수 continuation',
          en: 'Parameter continuation'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '6.6',
        courseId: 'course-6',
        title: {
          key: 'learn.course-6.6.6.title',
          ko: 'pseudo-arclength와 fold 통과',
          en: 'Pseudo-arclength and passage through folds'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '6.7',
        courseId: 'course-6',
        title: {
          key: 'learn.course-6.6.7.title',
          ko: 'branch switching과 대칭 깨짐',
          en: 'Branch switching and symmetry breaking'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '6.8',
        courseId: 'course-6',
        title: {
          key: 'learn.course-6.6.8.title',
          ko: 'period-doubling cascade',
          en: 'Period-doubling cascades'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '6.9',
        courseId: 'course-6',
        title: {
          key: 'learn.course-6.6.9.title',
          ko: 'Neimark–Sacker 분기와 invariant circle',
          en: 'Neimark–Sacker bifurcations and invariant circles'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '6.10',
        courseId: 'course-6',
        title: {
          key: 'learn.course-6.6.10.title',
          ko: 'torus·주파수 잠김·Arnold tongue',
          en: 'Tori, frequency locking and Arnold tongues'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '6.11',
        courseId: 'course-6',
        title: {
          key: 'learn.course-6.6.11.title',
          ko: 'codimension-2 분기 지도',
          en: 'Codimension-two bifurcation maps'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '6.12',
        courseId: 'course-6',
        title: {
          key: 'learn.course-6.6.12.title',
          ko: 'basin boundary·불확실성·Wada',
          en: 'Basin boundaries, uncertainty and Wada'
        },
        availability: 'planned',
        contentVersion: null
      }
    ]
  },
  {
    schema: 'pendulum-learn-course/v1',
    id: 'course-7',
    order: 7,
    title: {
      key: 'learn.course-7.title',
      ko: '결합계·확률계·격자·장·양자 확장',
      en: 'Coupled, stochastic, lattice, field and quantum systems'
    },
    description: {
      key: 'learn.course-7.description',
      ko: '교육과정 지도에 예약된 과정입니다. 공개된 샘플과 앞으로 제작할 단원을 함께 탐색합니다.',
      en: 'A course reserved in the curriculum map. Explore available samples and planned units.'
    },
    units: [
      {
        id: '7.1',
        courseId: 'course-7',
        title: {
          key: 'learn.course-7.7.1.title',
          ko: '자기 진자의 다중 basin',
          en: 'Multiple basins of the magnetic pendulum'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '7.2',
        courseId: 'course-7',
        title: {
          key: 'learn.course-7.7.2.title',
          ko: '진자 네트워크의 정상모드와 graph spectrum',
          en: 'Pendulum network normal modes and graph spectra'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '7.3',
        courseId: 'course-7',
        title: {
          key: 'learn.course-7.7.3.title',
          ko: 'Huygens 동기화',
          en: 'Huygens synchronization'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '7.4',
        courseId: 'course-7',
        title: {
          key: 'learn.course-7.7.4.title',
          ko: 'Kuramoto 질서매개변수',
          en: 'The Kuramoto order parameter'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '7.5',
        courseId: 'course-7',
        title: {
          key: 'learn.course-7.7.5.title',
          ko: 'chimera 상태와 국소 coherence',
          en: 'Chimera states and local coherence'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '7.6',
        courseId: 'course-7',
        title: {
          key: 'learn.course-7.7.6.title',
          ko: '확률 진자와 Langevin 동역학',
          en: 'Stochastic pendulums and Langevin dynamics'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '7.7',
        courseId: 'course-7',
        title: {
          key: 'learn.course-7.7.7.title',
          ko: 'Fokker–Planck 기술과 ensemble',
          en: 'Fokker–Planck descriptions and ensembles'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '7.8',
        courseId: 'course-7',
        title: {
          key: 'learn.course-7.7.8.title',
          ko: 'FPUT 사슬과 에너지 재귀',
          en: 'FPUT chains and energy recurrence'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '7.9',
        courseId: 'course-7',
        title: {
          key: 'learn.course-7.7.9.title',
          ko: '비선형 격자의 breather와 수송',
          en: 'Breathers and transport in nonlinear lattices'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '7.10',
        courseId: 'course-7',
        title: {
          key: 'learn.course-7.7.10.title',
          ko: 'sine-Gordon 장의 kink·breather',
          en: 'Kinks and breathers in sine-Gordon fields'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '7.11',
        courseId: 'course-7',
        title: {
          key: 'learn.course-7.7.11.title',
          ko: 'Frenkel–Kontorova와 pinning',
          en: 'Frenkel–Kontorova systems and pinning'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '7.12',
        courseId: 'course-7',
        title: {
          key: 'learn.course-7.7.12.title',
          ko: 'standard map의 KAM 섬과 확산',
          en: 'KAM islands and diffusion in the standard map'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '7.13',
        courseId: 'course-7',
        title: {
          key: 'learn.course-7.7.13.title',
          ko: 'quantum kicked rotor와 unitary Floquet',
          en: 'Quantum kicked rotors and unitary Floquet dynamics'
        },
        availability: 'planned',
        contentVersion: null
      }
    ]
  },
  {
    schema: 'pendulum-learn-course/v1',
    id: 'course-8',
    order: 8,
    title: {
      key: 'learn.course-8.title',
      ko: '계산 실험과 재현 가능한 연구',
      en: 'Computational experiments and reproducible research'
    },
    description: {
      key: 'learn.course-8.description',
      ko: '교육과정 지도에 예약된 과정입니다. 공개된 샘플과 앞으로 제작할 단원을 함께 탐색합니다.',
      en: 'A course reserved in the curriculum map. Explore available samples and planned units.'
    },
    units: [
      {
        id: '8.1',
        courseId: 'course-8',
        title: {
          key: 'learn.course-8.8.1.title',
          ko: '비교 실험과 대조군 설계',
          en: 'Comparative experiments and controls'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '8.2',
        courseId: 'course-8',
        title: {
          key: 'learn.course-8.8.2.title',
          ko: 'parameter sweep과 ensemble 설계',
          en: 'Designing parameter sweeps and ensembles'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '8.3',
        courseId: 'course-8',
        title: {
          key: 'learn.course-8.8.3.title',
          ko: '매개변수 추정과 식별 가능성',
          en: 'Parameter estimation and identifiability'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '8.4',
        courseId: 'course-8',
        title: {
          key: 'learn.course-8.8.4.title',
          ko: '영상·센서·CSV 데이터 가져오기',
          en: 'Importing video, sensor and CSV data'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '8.5',
        courseId: 'course-8',
        title: {
          key: 'learn.course-8.8.5.title',
          ko: '민감도·Sobol 지수',
          en: 'Sensitivity and Sobol indices'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '8.6',
        courseId: 'course-8',
        title: {
          key: 'learn.course-8.8.6.title',
          ko: 'polynomial chaos와 surrogate',
          en: 'Polynomial chaos and surrogates'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '8.7',
        courseId: 'course-8',
        title: {
          key: 'learn.course-8.8.7.title',
          ko: 'SINDy로 지배방정식 발견',
          en: 'Discovering governing equations with SINDy'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '8.8',
        courseId: 'course-8',
        title: {
          key: 'learn.course-8.8.8.title',
          ko: 'DMD·HAVOK와 Koopman 관점',
          en: 'DMD, HAVOK and the Koopman perspective'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '8.9',
        courseId: 'course-8',
        title: {
          key: 'learn.course-8.8.9.title',
          ko: 'reservoir·Hamiltonian 학습',
          en: 'Reservoir and Hamiltonian learning'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '8.10',
        courseId: 'course-8',
        title: {
          key: 'learn.course-8.8.10.title',
          ko: 'Arnoldi·Lanczos 대규모 고유해석',
          en: 'Large-scale eigenanalysis with Arnoldi and Lanczos'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '8.11',
        courseId: 'course-8',
        title: {
          key: 'learn.course-8.8.11.title',
          ko: 'run·artifact·provenance와 재현성',
          en: 'Runs, artifacts, provenance and reproducibility'
        },
        availability: 'planned',
        contentVersion: null
      },
      {
        id: '8.12',
        courseId: 'course-8',
        title: {
          key: 'learn.course-8.8.12.title',
          ko: 'notebook·figure·report·검토 패키지',
          en: 'Notebooks, figures, reports and review packages'
        },
        availability: 'planned',
        contentVersion: null
      }
    ]
  }
] satisfies readonly LearnCourse[];

export function findCourse(courseId: string): LearnCourse | undefined {
  return courses.find((course) => course.id === courseId);
}
export function findUnitSummary(courseId: string, unitId: string) {
  return findCourse(courseId)?.units.find((unit) => unit.id === unitId);
}
