import { OGY_ALGORITHM_VERSION, type OgyArtifact } from './contracts';
import { validateOgyRequest } from './request';

export function serializeOgyArtifact(artifact: OgyArtifact): string {
  if (artifact.schema !== 'pendulum-ogy-artifact/v1' || artifact.algorithmVersion !== OGY_ALGORITHM_VERSION)
    throw new Error('지원하지 않는 OGY artifact입니다.');
  const request = validateOgyRequest(artifact.request);
  for (const rows of [artifact.controlledRows, artifact.uncontrolledRows]) {
    if (
      !rows.length ||
      rows.length > request.settings.steps + 1 ||
      rows.some((row) => row.length !== 5 || !row.every(Number.isFinite))
    )
      throw new Error('OGY 기록이 유한한 반복 예산을 벗어났습니다.');
  }
  return JSON.stringify(artifact, null, 2);
}

export function ogyArtifactCsv(artifact: OgyArtifact): string {
  serializeOgyArtifact(artifact);
  return (
    [
      'group,iteration,x_dimensionless,y_dimensionless,delta_a_dimensionless,deviation_dimensionless',
      ...artifact.controlledRows.map((row) => `controlled,${row.join(',')}`),
      ...artifact.uncontrolledRows.map((row) => `uncontrolled,${row.join(',')}`)
    ].join('\r\n') + '\r\n'
  );
}
