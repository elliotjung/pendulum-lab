import type { CanonicalUnit } from '../contracts/quantities';
import type { ResearchFields, ResearchFocusDeclaration, ResearchFocusField } from './research-focus-contracts';

const f = (
  id: string,
  label: string,
  unit: CanonicalUnit,
  value: number,
  min: number,
  max: number,
  integer = false
): ResearchFocusField => ({ id, label, unit, value, min, max, ...(integer ? { integer } : {}) });

/** Declarations only: shared native adapters own every equation of motion. */
export function frontierFocusDeclaration(id: string): ResearchFocusDeclaration {
  if (!/^7\.(?:[1-9]|1[0-3])$/.test(id)) throw new RangeError('과정 7의 단원을 선택하세요.');
  const fields: ResearchFocusField[] = [];
  let systemId = 'system:magnetic',
    integratorId = 'integrator:rk4',
    exposed: string[] = [];
  const time = (duration = 4, step = 0.01, max = 16) =>
    fields.push(
      f('duration', '관찰 기간 (모델의 시간 규약 확인)', 's', duration, 1, max),
      f('step', '계산 간격 (모델 시간)', 's', step, step, step)
    );
  switch (id) {
    case '7.1':
      time();
      fields.push(
        f('damping', '정규화 감쇠', '1', 0.4, 0.1, 1),
        f('grid', 'basin 한 변 표본 수', '1', 5, 4, 9, true),
        f('maxSteps', '격자점 정착 단계 한도', '1', 2000, 500, 4000, true)
      );
      exposed = ['damping', 'grid', 'maxSteps'];
      break;
    case '7.2':
      systemId = 'system:pendulum-network';
      time();
      fields.push(
        f('coupling', '비틀림 결합 κ (J/rad²)', 'J', 0.3, 0, 2),
        f('amplitude', '첫 모드 진폭', 'rad', 0.1, 0.01, 0.8)
      );
      exposed = ['coupling', 'amplitude'];
      break;
    case '7.3':
      systemId = 'system:huygens-phase-pair';
      time(8);
      fields.push(
        f('coupling', '위상 결합 K', 's^-1', 0.5, -1, 1),
        f('detuning', '두 고유 각주파수 차', 'rad/s', 0.2, 0, 1)
      );
      exposed = ['coupling', 'detuning', 'duration'];
      break;
    case '7.4':
      systemId = 'system:kuramoto';
      time(6);
      fields.push(
        f('coupling', '위상 결합 K', 's^-1', 1.5, 0, 4),
        f('spread', '고유 주파수 분포 배율', '1', 1, 0, 2),
        f('seed', '초기 위상 seed 번호', '1', 17, 1, 999, true)
      );
      exposed = ['coupling', 'spread', 'seed'];
      break;
    case '7.5':
      systemId = 'system:chimera-exploration';
      integratorId = 'internal';
      time(6, 0.02);
      fields.push(f('phaseLag', '위상 지연', 'rad', 1.45, 0, 1.55), f('radius', '양쪽 이웃 반경', '1', 4, 1, 8, true));
      exposed = ['phaseLag', 'radius', 'duration'];
      break;
    case '7.6':
    case '7.7':
      systemId = 'system:langevin';
      integratorId = 'internal';
      time(id === '7.6' ? 2 : 1, 0.01, 4);
      fields.push(
        f('noise', '정규화 가산 잡음 세기', '1', id === '7.6' ? 0.4 : 0.15, 0, id === '7.6' ? 1 : 0.4),
        f('damping', '정규화 감쇠', '1', 0.2, 0, 1),
        f('members', '앙상블 경로 수', '1', id === '7.6' ? 16 : 64, 8, 64, true),
        f('seed', '독립 경로 seed 번호', '1', 23, 1, 999, true)
      );
      exposed = id === '7.6' ? ['noise', 'seed', 'duration'] : ['noise', 'members', 'duration'];
      break;
    case '7.8':
      systemId = 'system:fput';
      integratorId = 'internal';
      time(16, 0.02, 20);
      fields.push(
        f('alpha', '정규화 삼차 비선형성', '1', 0.25, 0, 0.6),
        f('amplitude', '첫 모드 진폭', '1', 1, 0.1, 2)
      );
      exposed = ['alpha', 'amplitude', 'duration'];
      break;
    case '7.9':
      systemId = 'system:pendulum-network';
      time(12);
      fields.push(
        f('coupling', '비틀림 결합 κ (J/rad²)', 'J', 0.05, 0, 0.5),
        f('amplitude', '국소 초기 각도', 'rad', 1.5, 0.1, 2.5)
      );
      exposed = ['coupling', 'amplitude', 'duration'];
      break;
    case '7.10':
      systemId = 'system:sine-gordon';
      integratorId = 'internal';
      time(8, 0.02);
      fields.push(
        f('scenario', '초기 장 (0=kink, 1=breather, 2=충돌)', '1', 0, 0, 2, true),
        f('velocity', '정규화 kink 속도', '1', 0.3, 0.1, 0.6),
        f('frequency', '정규화 breather 주파수', '1', 0.7, 0.3, 0.9)
      );
      exposed = ['scenario', 'velocity', 'frequency'];
      break;
    case '7.11':
      systemId = 'system:frenkel-kontorova';
      integratorId = 'internal';
      time(8, 0.02);
      fields.push(
        f('coupling', '정규화 결합/기판 비 K', '1', 1, 0.1, 4),
        f('twist', '유한 chain 평균 비정합비 ρ', '1', 0.6180339887498949, 0.1, 1),
        f('velocity', '정규화 초기 각속도 impulse', '1', 1, 0, 3),
        f('maxIterations', '정적 Newton 최대 반복', '1', 80, 1, 80, true)
      );
      exposed = ['coupling', 'twist', 'velocity', 'maxIterations'];
      break;
    case '7.12':
      systemId = 'system:standard-map';
      integratorId = 'internal';
      fields.push(
        f('kick', '정규화 킥 K', '1', 1.2, 0, 8),
        f('theta', '시작 각도', 'rad', 1, 0, 6.28),
        f('iterations', '사상 반복 수', '1', 256, 64, 512, true)
      );
      exposed = ['kick', 'theta', 'iterations'];
      break;
    case '7.13':
      systemId = 'system:quantum-kicked-rotor';
      integratorId = 'internal';
      fields.push(
        f('kick', '정규화 킥 K', '1', 5, 0, 8),
        f('hbar', '정규화 유효 ℏ', '1', 1, 0.2, 3),
        f('iterations', 'Floquet 주기 수', '1', 64, 16, 128, true)
      );
      exposed = ['kick', 'hbar', 'iterations'];
      break;
  }
  return { systemId, integratorId, fields, exposed, analysisIds: [] };
}

export function validateFrontierFields(id: string, input: ResearchFields): ResearchFields {
  const d = frontierFocusDeclaration(id);
  if (
    !input ||
    Object.keys(input).sort().join(',') !==
      d.fields
        .map((x) => x.id)
        .sort()
        .join(',')
  )
    throw new Error('단원의 전체 설정을 입력하세요.');
  for (const f of d.fields) {
    const v = input[f.id];
    if (
      typeof v !== 'number' ||
      !Number.isFinite(v) ||
      v < f.min ||
      v > f.max ||
      (f.integer && !Number.isInteger(v)) ||
      (!d.exposed.includes(f.id) && v !== f.value)
    )
      throw new Error(`${f.label}의 범위·단위·고정 조건을 확인하세요.`);
  }
  return { ...input };
}
