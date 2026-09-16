import { element, link } from '../../app/dom';
import { createButton, createSection } from '../../design-system/primitives';
import { toCanonicalChain, type ChainConfig } from '../../adapters/physics/chain';
import { createExperimentRoute } from '../../persistence';
import { exportChainFigure } from './chain-plots';
import {
  CHAIN_IMPORT_MAX_BYTES,
  parseChainConfig,
  saveChainConfig,
  serializeChainConfig,
  chainTrajectoryCsv
} from './chain-storage';
import type { ChainModel } from './chain-model';

const trays = new WeakMap<ChainModel, ChainConfig[]>();

export function createChainFiles(
  document: Document,
  model: ChainModel,
  restore: (config: ChainConfig) => void,
  canUse: () => boolean
) {
  const tray = createSection(document, {
    id: 'chain-tray',
    title: '실험 보관함',
    description:
      '현재 설정 저장은 이 브라우저에서 새로고침 후 복원됩니다. 보관함 비교 설정은 페이지를 닫으면 사라집니다 (최대 12개).'
  });
  const notice = element(document, 'p', 'lab-muted');
  notice.setAttribute('role', 'status');
  const entries = trays.get(model) ?? [];
  trays.set(model, entries);
  const list = element(document, 'div', 'lab-tray-list');
  const save = createButton(document, {
    label: '현재 설정 저장',
    onClick() {
      try {
        saveChainConfig(document.defaultView!.localStorage, model.state.config);
        notice.textContent = '초기조건과 분석 설정을 저장했습니다. 새로고침하면 처음부터 다시 실행할 수 있습니다.';
      } catch {
        notice.textContent = '저장하지 못했습니다. 브라우저 저장 공간을 확인하거나 상태 JSON을 내려받으세요.';
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
      notice.textContent = '비교할 설정을 보관했습니다.';
    }
  });
  const actions = element(document, 'div', 'lab-inline-actions');
  actions.append(save, keep);
  tray.body.append(actions, notice, list);
  function renderList() {
    list.replaceChildren();
    if (!entries.length) list.append(element(document, 'p', 'lab-empty', '보관한 설정이 없습니다.'));
    entries.forEach((config, index) => {
      const entry = element(document, 'article', 'lab-tray-entry');
      entry.append(element(document, 'h3', '', `설정 ${index + 1}`));
      const actions = element(document, 'div', 'lab-inline-actions');
      actions.append(
        createButton(document, {
          label: `설정 ${index + 1} 설정 복원`,
          variant: 'secondary',
          onClick() {
            if (!canUse()) return;
            restore(structuredClone(config));
            notice.textContent = '초기조건을 복원했습니다. 실행은 처음부터 시작합니다.';
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
      entry.append(
        element(
          document,
          'p',
          'lab-muted',
          `${config.integratorId.slice(11)} · ${config.duration} s · θ₁ ${config.initialState[0]} rad`
        ),
        actions
      );
      list.append(entry);
    });
    update();
  }
  const exports = createSection(document, {
    id: 'chain-export',
    title: '내보내기와 복원',
    description:
      '상태 JSON은 SI 초기조건·적분기·분석 설정입니다. CSV는 모든 링크의 기록된 표본, SVG는 첫 번째 링크의 상태/시간 그래프입니다. 저장된 결과에서 계산을 이어가는 파일은 아닙니다.'
  });
  const message = element(document, 'p', 'lab-muted');
  message.setAttribute('role', 'status');
  const importError = element(document, 'p', 'ds-field__error');
  importError.setAttribute('role', 'alert');
  importError.hidden = true;
  const urls = new Set<string>(),
    timers = new Set<ReturnType<typeof setTimeout>>();
  let disposed = false;
  let importGeneration = 0;
  function download(content: string, type: string, suffix: string) {
    try {
      const url = URL.createObjectURL(new Blob([content], { type }));
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
    } catch {
      message.textContent = '다운로드를 시작하지 못했습니다. 브라우저 설정을 확인하세요.';
    }
  }
  const json = createButton(document, {
    label: '상태 JSON 다운로드',
    onClick() {
      download(serializeChainConfig(model.state.config), 'application/json', 'json');
    }
  });
  const csv = createButton(document, {
    label: '궤적 CSV 다운로드',
    variant: 'secondary',
    onClick() {
      download(chainTrajectoryCsv(model.state.samples), 'text/csv;charset=utf-8', 'csv');
    }
  });
  const figure = createButton(document, {
    label: '그림 SVG 다운로드',
    variant: 'secondary',
    onClick() {
      download(exportChainFigure(document, model.state.config, model.state.samples), 'image/svg+xml', 'svg');
    }
  });
  const buttons = element(document, 'div', 'lab-inline-actions');
  buttons.append(json, csv, figure);
  const label = element(document, 'label', 'ds-field__label', '상태 JSON 가져오기');
  label.htmlFor = 'chain-import';
  const input = element(document, 'input', 'ds-field__control');
  input.id = 'chain-import';
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    const generation = ++importGeneration;
    const file = input.files?.[0];
    if (!file) return;
    importError.hidden = true;
    importError.textContent = '';
    try {
      if (file.size > CHAIN_IMPORT_MAX_BYTES) throw new Error('상태 파일은 200 KB 이하여야 합니다.');
      const text = await file.text();
      if (disposed || generation !== importGeneration) return;
      if (!canUse()) throw new Error('실행과 분석을 멈춘 뒤 다시 가져오세요.');
      const config = parseChainConfig(text, model.state.config.systemId);
      restore(config);
      message.textContent = '상태 파일을 복원했습니다. 초기조건에서 다시 실행하세요.';
    } catch (cause) {
      if (disposed || generation !== importGeneration) return;
      importError.hidden = false;
      importError.textContent = `가져오기 실패: ${cause instanceof Error ? cause.message : '파일을 읽지 못했습니다.'} 현재 설정과 원본 파일을 보존했습니다.`;
    } finally {
      input.value = '';
    }
  });
  const share = link(document, '공유 설정 열기', '#');
  share.hidden = true;
  const makeShare = createButton(document, {
    label: '공유 링크 만들기',
    variant: 'secondary',
    onClick() {
      const state = toCanonicalChain(model.state.config);
      const route = state.ok ? createExperimentRoute(state.value) : state;
      if (!route.ok) {
        message.textContent = '공유 링크를 만들 수 없습니다. 상태 JSON을 내려받으세요.';
        return;
      }
      share.href = route.value;
      share.hidden = false;
      message.textContent = '공유 설정 링크를 만들었습니다. 링크 주소를 복사해 사용할 수 있습니다.';
    }
  });
  exports.body.append(
    buttons,
    label,
    input,
    makeShare,
    share,
    message,
    importError,
    element(
      document,
      'p',
      'lab-muted',
      '그림은 선당 최대 약 600점으로 축약합니다. CSV는 메모리 제한에 따라 기록한 표본이며 모든 적분 단계를 포함하지 않습니다. 실제 기록 간격은 실행 진행에 표시하며 마지막 수신 상태를 포함합니다. 새 저장 키만 사용하고 기존 앱 자료는 변경하지 않습니다.'
    )
  );
  function update() {
    const disabled = !canUse();
    save.disabled = disabled;
    keep.disabled = disabled || entries.length >= 12;
    json.disabled = disabled;
    csv.disabled = disabled || model.state.samples.length < 2;
    figure.disabled = csv.disabled;
    makeShare.disabled = disabled;
    input.disabled = disabled;
    for (const button of list.querySelectorAll('button')) button.disabled = disabled;
    share.hidden = true;
  }
  renderList();
  return {
    tray: tray.element,
    exports: exports.element,
    update,
    dispose() {
      disposed = true;
      for (const timer of timers) clearTimeout(timer);
      for (const url of urls) URL.revokeObjectURL(url);
      timers.clear();
      urls.clear();
    }
  };
}
