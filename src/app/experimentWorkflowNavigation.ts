/** Open a workbench surface and reveal the exact diagnostic owned by a guided goal. */
export function openWorkflowTarget(tab: string, focus?: string): void {
  const shell = (window as Window & { __modernShell?: { openTarget(name: string, focus?: string): void } })
    .__modernShell;
  if (shell) shell.openTarget(tab, focus);
  else document.querySelector<HTMLElement>(`.tab[data-tab="${tab}"]`)?.click();
}
