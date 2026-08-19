import { downloadJson } from '../../export/manifest';
import type { ResearchDb } from '../../research/researchDb';

export interface ResearchDbRecoveryUiOptions {
  host: HTMLElement;
  db: ResearchDb;
  onRecovered(): void;
  notify(message: string): void;
}

function control(label: string, action: () => Promise<void>): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', () => {
    button.disabled = true;
    void action().finally(() => {
      button.disabled = false;
    });
  });
  return button;
}

/**
 * Present a fail-closed recovery choice. Merely rendering this surface never
 * deletes or upgrades the damaged database.
 */
export function renderResearchDbRecovery(options: ResearchDbRecoveryUiOptions): void {
  const { host, db, notify, onRecovered } = options;
  const korean = document.documentElement.lang.toLowerCase().startsWith('ko');
  host.replaceChildren();
  host.setAttribute('role', 'alert');
  host.setAttribute('aria-live', 'assertive');
  host.setAttribute('aria-atomic', 'true');
  const heading = document.createElement('h3');
  heading.id = 'researchDbRecoveryTitle';
  heading.tabIndex = -1;
  heading.textContent = korean ? '연구 저장소 복구 필요' : 'Research storage recovery required';
  host.setAttribute('aria-labelledby', heading.id);
  const message = document.createElement('p');
  message.textContent = korean
    ? '연구 저장소에 복구가 필요합니다. 데이터는 삭제되지 않았습니다. 먼저 가능한 레코드를 내보내거나, 확인 후 빈 저장소로 다시 만들 수 있습니다.'
    : 'Research storage needs recovery. No data was deleted. Export recoverable records first, or explicitly rebuild an empty store.';
  const actions = document.createElement('div');
  actions.className = 'research-actions';
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', korean ? '저장소 복구 작업' : 'Storage recovery actions');
  actions.append(
    control(korean ? '복구 가능한 데이터 내보내기' : 'Export recoverable data', async () => {
      try {
        const archive = await db.exportRecoverableArchive();
        downloadJson('pendulum_research_db_recovery.json', archive);
        notify(
          archive.recovery.complete
            ? korean
              ? '복구 보관 파일을 내보냈습니다.'
              : 'Recovery archive exported.'
            : korean
              ? `부분 복구 파일을 내보냈습니다. 누락 저장소: ${archive.recovery.missingStores.join(', ')}`
              : `Partial recovery archive exported. Missing: ${archive.recovery.missingStores.join(', ')}`
        );
      } catch (error) {
        notify(
          `${korean ? '복구 내보내기 실패' : 'Recovery export failed'}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }),
    control(korean ? '확인 후 저장소 다시 만들기' : 'Rebuild after confirmation', async () => {
      const confirmed = window.confirm(
        korean
          ? '내보내지 않은 연구 데이터는 복구할 수 없습니다. 손상된 저장소를 삭제하고 빈 저장소를 만들까요?'
          : 'Unexported research data may be unrecoverable. Delete the damaged database and create an empty one?'
      );
      if (!confirmed) return;
      try {
        await db.rebuildAfterCorruption();
        notify(korean ? '연구 저장소를 다시 만들었습니다.' : 'Research storage rebuilt.');
        host.removeAttribute('role');
        host.removeAttribute('aria-live');
        host.removeAttribute('aria-atomic');
        host.removeAttribute('aria-labelledby');
        onRecovered();
      } catch (error) {
        notify(
          `${korean ? '저장소 복구 실패' : 'Storage recovery failed'}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );
  host.append(heading, message, actions);
  heading.focus({ preventScroll: true });
}
