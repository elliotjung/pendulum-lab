import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import { PROJECT_LIMITS, type ResearchFigure, type ResearchSeriesDocument } from '../../provenance/contracts';
import { readResearchArtifact } from '../../provenance/project';
import { renderResearchFigure } from '../../provenance/render';
import { projectArea, projectGroup, projectSelect, projectText, requiredText, selectEntries } from './controls';
import { projectItemId, type ProjectEditorContext } from './context';

export function createProjectFigures(document: Document, context: ProjectEditorContext) {
  const root = element(document, 'div', 'project-figures');
  const composer = projectGroup(document, root, 'Figure composer · 기록 좌표와 출처');
  const source = projectSelect(document, composer.fields, 'figure-source', '그림의 원본 series artifact');
  const title = projectText(document, composer.fields, 'figure-title', '그림 제목', '기록 궤적');
  const caption = projectArea(document, composer.fields, 'figure-caption', '그림 설명');
  const x = projectSelect(document, composer.fields, 'figure-x', '그림 가로축');
  const y = projectSelect(document, composer.fields, 'figure-y', '그림 세로축');
  const theme = projectSelect(document, composer.fields, 'figure-theme', '그림 테마');
  selectEntries(
    document,
    theme,
    [
      ['light', '밝게'],
      ['dark', '어둡게'],
      ['print', '인쇄'],
      ['colorblind', '색각 접근성']
    ],
    '밝게'
  );
  const sourceNote = element(document, 'p', 'lab-muted');
  composer.element.append(sourceNote);
  function updateColumns() {
    const bundle = context.get();
    if (!bundle || !source.value) {
      selectEntries(document, x, [], 'series가 없습니다');
      selectEntries(document, y, [], 'series가 없습니다');
      sourceNote.textContent = '현재 기록을 연구 run으로 보존하면 실제 좌표와 단위로 그림을 만들 수 있습니다.';
      return;
    }
    try {
      const artifact = bundle.project.artifacts.find((item) => item.id === source.value)!;
      const documentData = readResearchArtifact(bundle, source.value) as ResearchSeriesDocument;
      const series = documentData.series;
      const columns = series.labels.map(
        (label, index) => [String(index), `${label} (${series.units[index]})`] as const
      );
      selectEntries(document, x, [['-1', `관측 축 (${series.axisUnit})`], ...columns], '관측 축');
      selectEntries(document, y, columns, '좌표가 없습니다');
      sourceNote.textContent = `원 run ${artifact.runId} · 원 artifact ${artifact.id} · 실제 기록 ${series.times.length}표본 · 보간하지 않습니다.`;
    } catch (cause) {
      sourceNote.textContent = cause instanceof Error ? cause.message : '그림 원본을 읽을 수 없습니다.';
    }
  }
  source.addEventListener('change', updateColumns);
  const save = createButton(document, {
    label: '출처를 연결해 그림 저장',
    variant: 'secondary',
    onClick() {
      try {
        const bundle = context.get();
        const artifact = bundle?.project.artifacts.find(
          (item) => item.id === source.value && item.status === 'present'
        );
        if (!bundle || !artifact) throw new Error('원본 series artifact가 필요합니다. 현재 기록을 먼저 보존하세요.');
        if (bundle.project.figures.length >= PROJECT_LIMITS.figures) throw new Error('그림은 최대 64개입니다.');
        const figure: ResearchFigure = {
          id: projectItemId('figure'),
          title: requiredText(title, 160),
          caption: caption.value,
          runId: artifact.runId,
          sourceArtifactId: artifact.id,
          xColumn: Number(x.value),
          yColumn: Number(y.value),
          theme: theme.value as ResearchFigure['theme']
        };
        const candidate = { ...bundle, project: { ...bundle.project, figures: [...bundle.project.figures, figure] } };
        renderResearchFigure(candidate, figure);
        context.change(() => candidate.project, '원 run과 artifact를 연결한 그림을 저장했습니다.');
      } catch (cause) {
        context.fail(cause);
      }
    }
  });
  composer.element.append(save);
  const list = element(document, 'div', 'project-figure-list');
  list.id = 'project-figure-list';
  root.append(list);
  let previousSource = '';
  let cachedProjectId = '';
  const renderedCache = new Map<string, ReturnType<typeof renderResearchFigure>>();
  function update() {
    const bundle = context.get();
    if (cachedProjectId !== bundle?.project.id) {
      renderedCache.clear();
      cachedProjectId = bundle?.project.id ?? '';
    }
    const sources =
      bundle?.project.artifacts.filter((artifact) => artifact.kind === 'series' && artifact.status === 'present') ?? [];
    selectEntries(
      document,
      source,
      sources.map(
        (artifact) =>
          [
            artifact.id,
            `${bundle!.project.runs.find((run) => run.id === artifact.runId)?.label ?? artifact.runId} · ${artifact.id}`
          ] as const
      ),
      '보존된 series가 없습니다'
    );
    const signature = `${bundle?.project.id ?? ''}:${source.value}:${sources.length}`;
    if (signature !== previousSource) {
      updateColumns();
      previousSource = signature;
    }
    list.replaceChildren();
    if (!bundle?.project.figures.length)
      list.append(element(document, 'p', 'lab-empty', '아직 저장한 그림이 없습니다. 실제 기록과 축을 선택하세요.'));
    for (const figure of bundle?.project.figures ?? []) {
      const article = element(document, 'figure', 'project-figure');
      const label = element(document, 'figcaption', '', `${figure.title} · ${figure.caption}`);
      const lineage = element(document, 'p', 'lab-muted', `원 run ${figure.runId} · source ${figure.sourceArtifactId}`);
      article.append(label, lineage);
      try {
        const sourceArtifact = bundle!.project.artifacts.find((artifact) => artifact.id === figure.sourceArtifactId);
        const key = JSON.stringify([figure, sourceArtifact?.sha256, sourceArtifact?.status]);
        let rendered = renderedCache.get(key);
        if (!rendered) {
          rendered = renderResearchFigure(bundle!, figure);
          renderedCache.set(key, rendered);
        }
        const image = element(document, 'img', 'project-figure-image');
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(rendered.svg)}`;
        image.alt = rendered.description;
        lineage.textContent = rendered.description;
        article.prepend(image);
        const actions = element(document, 'div', 'lab-inline-actions');
        for (const format of ['SVG', 'CSV'] as const) {
          const result = rendered;
          const button = createButton(document, {
            label: `${format} 다운로드`,
            variant: 'secondary',
            onClick() {
              context.download(
                format === 'SVG' ? result.svg : result.csv,
                `${figure.id}.${format.toLowerCase()}`,
                format === 'SVG' ? 'image/svg+xml' : 'text/csv;charset=utf-8'
              );
            }
          });
          button.setAttribute('aria-label', `${figure.title} ${format} 다운로드`);
          actions.append(button);
        }
        article.append(actions);
      } catch (cause) {
        article.append(
          element(
            document,
            'p',
            'lab-preview-note',
            `그림을 재생성할 수 없습니다. ${cause instanceof Error ? cause.message : '원본 artifact를 확인하세요.'}`
          )
        );
      }
      list.append(article);
    }
  }
  return { element: root, update };
}
