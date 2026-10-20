import { element, link } from '../../app/dom';
import { createButton, createSection } from '../../design-system/primitives';
import { toCanonicalDiscrete, type DiscreteConfig } from '../../adapters/physics/discrete';
import { createExperimentRoute } from '../../persistence';
import {
  DISCRETE_IMPORT_MAX_BYTES,
  parseDiscreteConfig,
  saveDiscreteConfig,
  serializeDiscreteConfig,
  discreteTrajectoryCsv,
  discreteStateJson
} from './discrete-storage';
import type { DiscreteModel } from './discrete-model';

export function createDiscreteFiles(
  document: Document,
  model: DiscreteModel,
  restore: (config: DiscreteConfig) => void,
  canUse: () => boolean,
  entries: DiscreteConfig[],
  currentFigure: () => string
) {
  const tray = createSection(document, {
    id: 'discrete-tray',
    title: '실험 보관함',
    description:
      '현재 설정 저장은 이 브라우저에서 새로고침 후 복원됩니다. 비교 보관함은 이 페이지에서 최대 12개 초기 설정을 유지하며 새로고침하면 사라집니다.'
  });
  const notice = element(document, 'p', 'lab-muted'),
    list = element(document, 'div', 'lab-tray-list');
  notice.setAttribute('role', 'status');
  const save = createButton(document, {
    label: '현재 설정 저장',
    onClick() {
      try {
        saveDiscreteConfig(document.defaultView!.localStorage, model.state.config);
        notice.textContent =
          '초기조건·복소 파동함수·행렬·반복 조건을 저장했습니다. 저장한 초기 iteration부터 실행합니다.';
      } catch (cause) {
        notice.textContent = `저장하지 못했습니다. ${cause instanceof Error ? cause.message : '저장 공간을 확인하세요.'} 기존 자료를 보존했습니다. 상태 JSON으로 내려받을 수 있습니다.`;
      }
    }
  });
  const keep = createButton(document, {
    label: '현재 설정 보관',
    variant: 'secondary',
    onClick() {
      if (entries.length >= 12) return;
      entries.push(structuredClone(model.state.config));
      renderList();
      notice.textContent = '비교할 초기 설정을 보관했습니다.';
    }
  });
  const actions = element(document, 'div', 'lab-inline-actions');
  actions.append(save, keep);
  tray.body.append(actions, notice, list);
  function renderList() {
    list.replaceChildren();
    if (!entries.length) list.append(element(document, 'p', 'lab-empty', '보관한 설정이 없습니다.'));
    entries.forEach((config, index) => {
      const card = element(document, 'article', 'lab-tray-entry'),
        actions = element(document, 'div', 'lab-inline-actions');
      card.append(
        element(document, 'h3', '', `설정 ${index + 1}`),
        element(
          document,
          'p',
          'lab-muted',
          `N=${config.gridSize} · 시작 iteration ${config.startIteration ?? 0} · ${config.iterations}반복`
        )
      );
      actions.append(
        createButton(document, {
          label: `설정 ${index + 1} 설정 복원`,
          variant: 'secondary',
          onClick() {
            if (!canUse()) return;
            restore(structuredClone(config));
            notice.textContent = '초기 설정을 복원했습니다.';
          }
        }),
        createButton(document, {
          label: `설정 ${index + 1} 보관 해제`,
          variant: 'secondary',
          onClick() {
            entries.splice(index, 1);
            renderList();
            keep.focus();
          }
        })
      );
      card.append(actions);
      list.append(card);
    });
    update();
  }
  const exports = createSection(document, {
    id: 'discrete-export',
    title: '내보내기와 복원',
    description:
      '상태 JSON은 재현할 초기 설정입니다. 복소 상태 JSON은 실제 마지막 복소 상태·iteration·raw 진단과 이어 실행할 설정을 담습니다. 기록 원본 CSV는 메모리에 보존한 모든 iteration 표본을, 축약 CSV는 그중 최대 121개를 담습니다. 미기록 반복은 포함하지 않으며 현재·마지막 상태는 예정 간격 밖일 수 있습니다.'
  });
  const message = element(document, 'p', 'lab-muted'),
    error = element(document, 'p', 'ds-field__error');
  message.setAttribute('role', 'status');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const urls = new Set<string>(),
    timers = new Set<ReturnType<typeof setTimeout>>();
  let disposed = false,
    importGeneration = 0;
  function download(content: () => string, type: string, suffix: string) {
    try {
      const url = URL.createObjectURL(new Blob([content()], { type }));
      urls.add(url);
      const anchor = element(document, 'a', '');
      anchor.href = url;
      anchor.download = `pendulum-${model.state.config.systemId.slice(7)}.${suffix}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.delete(url);
        timers.delete(timer);
      }, 1000);
      timers.add(timer);
      message.textContent = '파일을 만들었습니다. 다운로드 목록에서 확인하세요.';
    } catch (cause) {
      error.hidden = false;
      error.textContent = `다운로드 실패: ${cause instanceof Error ? cause.message : '브라우저 설정을 확인하세요.'}`;
    }
  }
  const json = createButton(document, {
      label: '상태 JSON 다운로드',
      onClick() {
        download(() => serializeDiscreteConfig(model.state.config), 'application/json', 'json');
      }
    }),
    raw = createButton(document, {
      label: '기록 원본 CSV 다운로드',
      variant: 'secondary',
      onClick() {
        download(
          () =>
            discreteTrajectoryCsv(model.state.samples, model.state.config, 'retained-raw', model.state.sampleStride),
          'text/csv;charset=utf-8',
          'retained-raw.csv'
        );
      }
    }),
    downsampled = createButton(document, {
      label: '축약 CSV 다운로드',
      variant: 'secondary',
      onClick() {
        download(
          () => discreteTrajectoryCsv(model.state.samples, model.state.config, 'downsampled', model.state.sampleStride),
          'text/csv;charset=utf-8',
          'downsampled.csv'
        );
      }
    }),
    provenance = createButton(document, {
      label: '복소 상태 JSON 다운로드',
      variant: 'secondary',
      onClick() {
        download(
          () => discreteStateJson(model.state.config, model.state.samples, model.state.sampleStride),
          'application/json',
          'complex-state.json'
        );
      }
    }),
    figure = createButton(document, {
      label: '그림 SVG 다운로드',
      variant: 'secondary',
      onClick() {
        download(currentFigure, 'image/svg+xml', 'svg');
      }
    });
  const buttons = element(document, 'div', 'lab-inline-actions');
  buttons.append(json, raw, downsampled, provenance, figure);
  const label = element(document, 'label', 'ds-field__label', '상태 JSON 가져오기'),
    input = element(document, 'input', 'ds-field__control');
  label.htmlFor = 'discrete-import';
  input.id = label.htmlFor;
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    const generation = ++importGeneration,
      file = input.files?.[0];
    if (!file) return;
    error.hidden = true;
    try {
      if (file.size > DISCRETE_IMPORT_MAX_BYTES) throw new Error('상태 파일은 256 KiB 이하여야 합니다.');
      const text = await file.text();
      if (disposed || generation !== importGeneration) return;
      if (model.state.status === 'running' || model.state.busy) throw new Error('실행을 멈춘 뒤 다시 가져오세요.');
      const config = parseDiscreteConfig(text, model.state.config.systemId);
      restore(config);
      message.textContent = '상태 파일을 복원했습니다. 설정에 보존된 초기 iteration과 상태에서 실행합니다.';
    } catch (cause) {
      if (disposed || generation !== importGeneration) return;
      error.hidden = false;
      error.textContent = `가져오기 실패: ${cause instanceof Error ? cause.message : '파일을 읽지 못했습니다.'} 현재 설정과 원본 파일을 보존했습니다.`;
    } finally {
      if (!disposed && generation === importGeneration) input.value = '';
    }
  });
  const share = link(document, '공유 설정 열기', '#');
  share.hidden = true;
  const makeShare = createButton(document, {
    label: '공유 링크 만들기',
    variant: 'secondary',
    onClick() {
      const state = toCanonicalDiscrete(model.state.config),
        route = state.ok ? createExperimentRoute(state.value) : state;
      if (!route.ok) {
        message.textContent = '공유 크기 제한을 넘거나 설정이 유효하지 않습니다. 상태 JSON을 내려받으세요.';
        return;
      }
      share.href = route.value;
      share.hidden = false;
      message.textContent = '공유 설정 링크를 만들었습니다. 링크 주소를 복사해 사용할 수 있습니다.';
    }
  });
  const sampling = element(document, 'p', 'lab-muted');
  sampling.id = 'discrete-export-sampling';
  exports.body.append(
    buttons,
    label,
    input,
    makeShare,
    share,
    message,
    error,
    sampling,
    element(
      document,
      'p',
      'lab-muted',
      '각도·위상은 rad, 반복·m·확률 norm은 무차원, p와 준에너지는 정규화 값입니다. 그림은 계열당 약 600점을 표시합니다. 새 discrete/v1 저장 키를 사용합니다. 자동 재정규화·단위원 투영을 하지 않습니다.'
    )
  );
  function update() {
    const disabled = !canUse();
    save.disabled = disabled;
    keep.disabled = disabled || entries.length >= 12;
    json.disabled = disabled;
    raw.disabled = disabled;
    downsampled.disabled = disabled;
    provenance.disabled = disabled;
    figure.disabled = disabled;
    makeShare.disabled = disabled;
    input.disabled = model.state.status === 'running' || model.state.busy;
    for (const button of list.querySelectorAll('button')) button.disabled = disabled;
    sampling.textContent = `기록 간격 ${model.state.sampleStride}반복 · 원본 기록 ${model.state.samples.length}개 · 축약 최대 121개. 현재·마지막 상태는 예정 간격 밖일 수 있습니다. raw는 기록 원본이며 모든 미기록 반복을 복구하지 않습니다.`;
    share.hidden = true;
  }
  renderList();
  return {
    tray: tray.element,
    exports: exports.element,
    update,
    dispose() {
      disposed = true;
      importGeneration++;
      for (const timer of timers) clearTimeout(timer);
      for (const url of urls) URL.revokeObjectURL(url);
      timers.clear();
      urls.clear();
    }
  };
}
