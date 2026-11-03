import {
  figureSourceCsv,
  renderStudyFigureSvg,
  svgToDataUrl,
  type StudyFigureSpec
} from '../../research/figurePipeline';
import { textToBytes, type ZipEntryInput } from '../../research/zipBundle';
import type { ResearchFigure, ResearchProjectBundle } from './contracts';
import { readResearchArtifact } from './project';
import { validateResearchProject, validateResearchSeriesDocument } from './validation';

/** Exported narratives are plain text, including when opened in a Markdown renderer. */
function markdown(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([\\`*_{}[\]()#+!|~])/g, '\\$1');
}
function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const oneLine = (value: string) => value.replace(/[\r\n\u2028\u2029]/g, ' ');

/** A generated figure always points to one preserved run and its exact recorded data. */
export function renderResearchFigure(
  bundle: ResearchProjectBundle,
  figure: ResearchFigure
): { svg: string; csv: string; description: string } {
  const project = validateResearchProject(bundle.project);
  const saved = project.figures.find((item) => item.id === figure.id);
  if (!saved || JSON.stringify(saved) !== JSON.stringify(figure))
    throw new Error('프로젝트에 등록된 그림 설정이 필요합니다.');
  const artifact = project.artifacts.find((item) => item.id === figure.sourceArtifactId);
  if (!artifact || artifact.status !== 'present' || artifact.kind !== 'series' || artifact.runId !== figure.runId)
    throw new Error('그림의 원 run 또는 기록 artifact가 누락되었습니다. 원본을 복구하세요.');
  const document = validateResearchSeriesDocument(readResearchArtifact(bundle, artifact.id));
  const { series } = document;
  if (series.times.length < 2) throw new Error('그림을 만들려면 실제 기록 표본이 2개 이상 필요합니다.');
  if (figure.yColumn >= series.labels.length || figure.xColumn >= series.labels.length)
    throw new Error('선택한 축이 기록 데이터의 열 범위를 벗어났습니다.');
  const xLabel =
    figure.xColumn === -1
      ? `축 [${series.axisUnit}]`
      : `${series.labels[figure.xColumn]} [${series.units[figure.xColumn]}]`;
  const yLabel = `${series.labels[figure.yColumn]} [${series.units[figure.yColumn]}]`;
  const points = series.times.map((time, index) => ({
    x: figure.xColumn === -1 ? time : series.states[index]![figure.xColumn]!,
    y: series.states[index]![figure.yColumn]!,
    err: 0
  }));
  // Avoid a silently non-finite scale in the preserved SVG renderer for extreme input.
  if (points.some((point) => Math.abs(point.x) > 1e100 || Math.abs(point.y) > 1e100))
    throw new Error('그림 축의 값이 표시 한도를 넘었습니다. 원 데이터는 보존됩니다.');
  const spec: StudyFigureSpec = {
    title: figure.title,
    caption: `${oneLine(figure.caption)} · ${figure.xColumn === -1 ? '기록 시계열' : '기록 산점도'} · run ${figure.runId}`,
    xLabel,
    yLabel,
    points,
    theme: figure.theme,
    width: 800,
    height: 480
  };
  let svg = renderStudyFigureSvg(spec);
  const description = `${figure.title}. ${figure.caption} 가로축 ${xLabel}, 세로축 ${yLabel}. 실제 기록 ${points.length}표본, 보간 없음. 원 run ${figure.runId}, artifact ${artifact.id}.`;
  svg = svg.replace(/aria-label="[^"]*"/, `aria-label="${xml(description)}"`);
  // The legacy study renderer sorts x for parameter curves. Phase projections are
  // explicitly scatter plots so no sorted curve is mistaken for a trajectory.
  if (figure.xColumn !== -1) svg = svg.replace(/<path\s+d="[^"]*"[^>]*\/>/g, '');
  svg = svg.replace(
    '</svg>',
    `<metadata>${xml(
      JSON.stringify({
        schema: 'pendulum-research-figure/v1',
        projectId: project.id,
        figureId: figure.id,
        runId: figure.runId,
        sourceArtifactId: artifact.id,
        sourceSha256: artifact.sha256,
        sourcePath: artifact.path,
        xColumn: figure.xColumn,
        yColumn: figure.yColumn,
        xLabel,
        yLabel,
        sampleCount: points.length,
        reduction: 'none',
        uncertainty: 'not-estimated'
      })
    )}</metadata>\n</svg>`
  );
  const csv = figureSourceCsv(
    { ...spec, title: oneLine(spec.title) },
    {
      project: project.id,
      run: figure.runId,
      artifact: artifact.id,
      source_sha256: artifact.sha256,
      x_axis: oneLine(xLabel),
      y_axis: oneLine(yLabel),
      sample_count: String(points.length),
      reduction: 'none',
      uncertainty: 'not-estimated; err=0 is not measured zero uncertainty'
    }
  );
  return { svg, csv, description };
}

export function researchReportMarkdown(bundle: ResearchProjectBundle): string {
  const project = validateResearchProject(bundle.project);
  const lines = [
    `# ${markdown(project.title)}`,
    '',
    markdown(project.description),
    '',
    `Project: ${project.id}`,
    `Schema: ${project.schema}`,
    `Software: ${project.software.name} ${project.software.version}`,
    `Created: ${project.createdAt}`,
    `Updated: ${project.updatedAt}`,
    '',
    '## 검증과 재현 범위',
    '',
    'SHA-256은 패키지 내부 바이트의 무결성을 확인합니다. 외부 출처·과학적 정확성·사람 검토를 인증하지 않습니다.',
    '원 run 설정·기록과 native 결과 파일을 보존합니다. 기록 캡처는 계산 checkpoint 재개 또는 모든 외부 환경의 bitwise 재현을 보장하지 않습니다.',
    '원본 결과 JSON은 해당 Lab 도구에서 다시 열어 재계산·재평가할 수 있습니다. legacy 파일은 기존 앱에서 열며 opaque 첨부는 실행하지 않습니다.',
    '',
    '## 세션과 run',
    ''
  ];
  for (const session of project.sessions) {
    lines.push(`### ${markdown(session.title)} · ${session.id}`, '');
    for (const run of project.runs.filter((item) => item.sessionId === session.id)) {
      lines.push(`- ${markdown(run.label)} · ${run.id} · ${run.status} · ${run.createdAt}`, `  ${markdown(run.note)}`);
      if (run.experiment)
        lines.push(
          `  System ${run.experiment.systemId} · model ${run.experiment.modelVersion} · seed ${markdown(run.experiment.seed ? JSON.stringify(run.experiment.seed) : '(없음)')}`
        );
    }
  }
  lines.push('', '## Artifact와 누락 목록', '');
  if (!project.artifacts.length) lines.push('아직 artifact가 없습니다.');
  for (const artifact of project.artifacts) {
    lines.push(
      `- ${artifact.status === 'missing' ? '누락' : '보존됨'}: ${markdown(artifact.filename)} · ${artifact.id} · run ${artifact.runId}`,
      `  schema ${markdown(artifact.schema)} · ${artifact.bytes} bytes · SHA-256 ${artifact.sha256 || '(누락)'}`,
      `  path ${artifact.path} · parents ${artifact.parentIds.join(', ') || '(없음)'}`,
      `  ${markdown(artifact.note)}`
    );
    if (artifact.nativeInputRunId)
      lines.push(`  Native input ${markdown(artifact.nativeInputRunId)} · 프로젝트 run과 독립된 원본 식별자`);
  }
  lines.push('', '## Notebook', '');
  for (const block of project.notebook)
    lines.push(
      `### ${markdown(block.title)}`,
      '',
      markdown(block.text),
      '',
      `Artifact references: ${block.artifactIds.join(', ') || '(없음)'}`,
      ''
    );
  lines.push('## Figures', '');
  for (const figure of project.figures) {
    lines.push(
      `### ${markdown(figure.title)}`,
      '',
      markdown(figure.caption),
      '',
      `Run ${figure.runId} → artifact ${figure.sourceArtifactId} → figure ${figure.id}. 축 ${figure.xColumn}, ${figure.yColumn}.`
    );
    const source = project.artifacts.find((artifact) => artifact.id === figure.sourceArtifactId);
    if (source?.status === 'present' && bundle.files.some((file) => file.path === source.path)) {
      lines.push(`출력: figures/${figure.id}.svg · figures/${figure.id}.csv`);
      lines.push('그림 생성 시 축·표본·표시 한도를 다시 확인하며 실패 사유는 unavailable.txt에 기록합니다.');
    } else lines.push('그림 생성 불가: 원본 artifact가 누락되었습니다.');
    lines.push('');
  }
  lines.push('## Citations', '');
  for (const citation of project.citations) lines.push(`- ${markdown(citation.text)} ${markdown(citation.url)}`);
  lines.push('', '## Warnings', '');
  for (const warning of project.warnings) lines.push(`- ${markdown(warning)}`);
  for (const artifact of project.artifacts.filter((item) => item.status === 'missing'))
    lines.push(`- 누락 artifact ${artifact.id}: ${markdown(artifact.note)}`);
  return lines.join('\n') + '\n';
}

/** Standalone file:// reviewer: no scripts, external fonts, fetch, or executable attachments. */
export function renderOfflineReviewer(bundle: ResearchProjectBundle): string {
  const project = validateResearchProject(bundle.project);
  const figures = project.figures
    .map((figure) => {
      try {
        const image = renderResearchFigure(bundle, figure);
        return `<figure><img src="${xml(svgToDataUrl(image.svg))}" alt="${xml(image.description)}"><figcaption>${xml(image.description)}</figcaption></figure>`;
      } catch (cause) {
        return `<p role="alert">그림 ${xml(figure.title)}: ${xml(cause instanceof Error ? cause.message : String(cause))}</p>`;
      }
    })
    .join('\n');
  const manifest = xml(JSON.stringify(project, null, 2));
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${xml(project.title)} · Offline Research Reviewer</title>
<style>body{max-width:1000px;margin:0 auto;padding:24px;font:16px/1.6 system-ui,sans-serif;color:#14242c;background:#fff}h1{overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f5f6;padding:16px;border:1px solid #cad5db}img{max-width:100%;height:auto}figure{margin:24px 0}summary{cursor:pointer}a{color:#155979}:focus-visible{outline:3px solid #b86212;outline-offset:4px}@media print{body{padding:0}details{display:block}}</style></head>
<body><main><h1>${xml(project.title)}</h1><p>오프라인 연구 검토 · ${xml(project.schema)}</p>
<p>이 정적 보기는 export 시점의 보고서입니다. 파일을 실행하거나 체크섬을 다시 검증하지 않습니다. ZIP 전체의 SHA-256 검증은 Pendulum Lab reviewer.html#/project에서 수행하세요. 사람의 과학 검토는 별도로 필요합니다.</p>
${figures}<h2>연구 보고서</h2><pre>${xml(researchReportMarkdown(bundle))}</pre>
<details><summary>프로젝트 manifest · session/run/artifact/계보 전체 보기</summary><pre>${manifest}</pre></details>
<p>패키지를 풀면 manifest/checksums.json과 원본 artifacts/ 파일, notebook.json, report.md, figures/가 함께 있습니다. 원본 첨부의 HTML/SVG/script는 이 화면에서 실행하지 않습니다.</p>
</main></body></html>\n`;
}

export function researchExportEntries(bundle: ResearchProjectBundle): ZipEntryInput[] {
  const project = validateResearchProject(bundle.project);
  const entries: ZipEntryInput[] = [
    { path: 'report.md', data: textToBytes(researchReportMarkdown(bundle)) },
    {
      path: 'notebook.json',
      data: textToBytes(researchNotebookJson(bundle))
    },
    { path: 'reviewer.html', data: textToBytes(renderOfflineReviewer(bundle)) }
  ];
  for (const figure of project.figures) {
    try {
      const rendered = renderResearchFigure(bundle, figure);
      entries.push(
        { path: `figures/${figure.id}.svg`, data: textToBytes(rendered.svg) },
        { path: `figures/${figure.id}.csv`, data: textToBytes(rendered.csv) }
      );
    } catch (cause) {
      entries.push({
        path: `figures/${figure.id}-unavailable.txt`,
        data: textToBytes(cause instanceof Error ? cause.message : String(cause))
      });
    }
  }
  return entries;
}

export function researchNotebookJson(bundle: ResearchProjectBundle): string {
  const project = validateResearchProject(bundle.project);
  return (
    JSON.stringify(
      {
        schema: 'pendulum-research-notebook/v1',
        projectId: project.id,
        blocks: project.notebook,
        citations: project.citations
      },
      null,
      2
    ) + '\n'
  );
}
