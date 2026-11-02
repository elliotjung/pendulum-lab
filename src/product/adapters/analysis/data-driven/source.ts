import type { ExperimentStateV1 } from '../../../contracts/experiment';
import { createDiagnosticSeries } from '../core/source';
import { readDiagnosticConfiguration } from '../core/source-config';
import { validateObservationArtifact } from '../../../observations';
import type { LearningData } from './learning-contracts';
import { learningDefaults, validateLearning } from './learning';
import { freezeModelData, modelData, parseModelJson } from './safe';

/** Copies an explicitly recorded contiguous slice; no resampling, interpolation or angular unwrapping. */
export function datasetFromExperiment(
  experiment: ExperimentStateV1,
  samples: readonly unknown[],
  start = 0,
  end = Math.min(samples.length, 512)
): LearningData {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end > samples.length ||
    end <= start ||
    end - start > 512
  )
    throw new Error('기록 데이터에서 연속된 1–512개 표본 범위를 선택하세요.');
  const series = createDiagnosticSeries(experiment, samples.slice(start, end));
  const config = readDiagnosticConfiguration(experiment);
  let labels = [...series.labels],
    units = [...series.units],
    values = series.states.map((v) => [...v]);
  const canonical =
    config.family === 'nonlinear' &&
    config.config.systemId === 'system:duffing' &&
    config.config.parameters.damping === 0 &&
    config.config.parameters.driveAmplitude === 0;
  const provenance: Record<string, unknown> = {
    kind: 'lab-retained-series',
    experiment: structuredClone(experiment),
    retainedSlice: { start, end, total: samples.length },
    transformations: ['기록 표본의 연속 slice 복사. 보간·재표본화·각도 펼침 없음.'],
    warnings: [
      ...series.warnings,
      ...(end < samples.length ? [`전체 ${samples.length}개 중 [${start},${end}) 표본만 복사했습니다.`] : [])
    ]
  };
  if (canonical) {
    labels = ['q0', 'p0'];
    units = ['1', '1'];
    values = values.map((row) => row.slice(0, 2));
    Object.assign(provenance, {
      canonical: true,
      coordinateOrder: 'q,p',
      canonicalUnits: units,
      canonicalMapping:
        'Preserved normalized Duffing, damping=0, driveAmplitude=0, unit mass: q=x, p=v. Drive phase omitted.',
      transformations: [
        ...(provenance.transformations as string[]),
        '질량 1 무감쇠·무구동 Duffing의 x,v를 정준 q,p로 매핑하고 외력 위상을 제외.'
      ]
    });
  }
  const data: LearningData = { times: [...series.times], values, labels, units, axisUnit: series.axisUnit, provenance };
  validateLearning(data, learningDefaults(data, 'dmd'));
  return freezeModelData(modelData(data) as unknown as LearningData);
}

/** S22 observation originals and transformations remain embedded in the new model's source lineage. */
export async function parseLearningData(text: string): Promise<LearningData> {
  const parsed = parseModelJson(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('학습 데이터 객체가 필요합니다.');
  const source = parsed as Record<string, unknown>;
  let data: LearningData;
  if (source.schema === 'pendulum-observation/v1') {
    const observation = await validateObservationArtifact(source);
    data = {
      times: [...observation.data.times],
      values: observation.data.angles.map((v) => [...v]),
      labels: observation.data.angles[0]!.map((_, i) => `theta${i + 1}`),
      units: observation.data.angles[0]!.map(() => 'rad'),
      axisUnit: 's',
      provenance: {
        kind: 'observation',
        observation,
        warnings: [...observation.warnings],
        transformations: ['S22에서 확정한 SI 시간·각도 표본 복사. 추가 보간·재표본화 없음.']
      }
    };
  } else {
    const raw = source.schema === 'pendulum-learning-data/v1' ? source.data : source;
    if (
      source.schema === 'pendulum-learning-data/v1' &&
      Object.keys(source).some((key) => !['schema', 'data'].includes(key))
    )
      throw new Error('지원하지 않는 학습 데이터 envelope 필드입니다.');
    data = raw as LearningData;
  }
  validateLearning(data, learningDefaults(data, 'dmd'));
  return freezeModelData(modelData(data) as unknown as LearningData);
}
