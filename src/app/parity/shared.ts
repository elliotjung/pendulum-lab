/**
 * Public compatibility barrel for the decomposed parity shared layer.
 *
 * Data contracts, state, DOM construction, runtime readers, and browser
 * behavior deliberately live in focused modules; imports from this legacy
 * path remain stable for the rest of the application and integrations.
 */
import { installStyle } from './shared-behavior';

export { downloadText } from './parityDownload';
export * from './shared-types';
export { state } from './shared-state';
export * from './shared-dom';
export * from './shared-runtime';
export {
  ensureCompatAnchors,
  installStyle,
  record,
  researchUid,
  setActiveTab,
  setAuditRenderHook,
  toast
} from './shared-behavior';

export function installStyles(): void {
  installStyle(
    'rg-style',
    `
.rg-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.rg-card{background:var(--workbench-panel,#10141f);border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:8px;padding:12px;box-shadow:none}
.rg-card.rg-wide{grid-column:1/-1}.rg-title{font:650 10px/1.2 var(--font-sans,system-ui);color:var(--workbench-text,#f1f3f8);margin-bottom:8px}
.rg-table{width:100%;border-collapse:collapse;font-size:10.5px}.rg-table td,.rg-table th{border:1px solid var(--workbench-border,rgba(205,214,245,.08));padding:6px;vertical-align:top}.rg-table th{color:var(--workbench-text-muted,#737e92);text-align:left;background:var(--workbench-raised,#0b0e17);font-weight:600}
.rg-log{white-space:pre-wrap;max-height:240px;overflow:auto;background:var(--workbench-raised,#0b0e17);border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:5px;padding:8px;font:10px/1.45 var(--font-mono);color:var(--workbench-text-secondary,#a8b0c2)}
.research-workbench{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:10px}
.research-workbench.research-compact{gap:6px}
.research-workbench.research-compact .research-card{padding:8px}
.research-workbench.research-compact .research-actions{margin:5px 0}
.research-workbench.research-compact .research-table-wrap{max-height:180px}
.research-card{background:var(--workbench-panel,#10141f);border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:8px;padding:12px;box-shadow:none}
.research-card.research-wide{grid-column:1/-1}
.research-title{font:650 10px/1.2 var(--font-sans,system-ui);color:var(--workbench-text,#f1f3f8);margin-bottom:8px;display:flex;justify-content:space-between;gap:8px;align-items:center}
.research-form-row{display:grid;grid-template-columns:88px minmax(0,1fr);gap:8px;align-items:center;margin:6px 0}
.research-form-row label{color:var(--muted);font-size:10px}
.research-card input,.research-card select,.research-card textarea{width:100%;min-width:0}
.research-card textarea{min-height:54px;resize:vertical;background:var(--workbench-control,#181d2b);color:var(--workbench-text,#f1f3f8);border:1px solid var(--workbench-border-strong,rgba(205,214,245,.14));border-radius:5px;padding:7px 9px;font:11px/1.45 var(--font-sans)}
.research-actions{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.research-summary{font:10.5px/1.5 var(--font-mono);color:var(--workbench-text-secondary,#a8b0c2);background:var(--workbench-raised,#0b0e17);border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:5px;padding:7px;min-height:36px}
.research-table-wrap{max-height:220px;overflow:auto;border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:5px;background:var(--workbench-raised,#0b0e17)}
.research-table{width:100%;border-collapse:collapse;font-size:10px}.research-table th,.research-table td{border-bottom:1px solid var(--workbench-border,rgba(205,214,245,.08));padding:6px;text-align:left;vertical-align:top}.research-table th{color:var(--workbench-text-muted,#737e92);position:sticky;top:0;background:var(--workbench-raised,#0b0e17);z-index:1;font-weight:600}
.research-badge{display:inline-flex;align-items:center;border:1px solid var(--workbench-border-strong,rgba(205,214,245,.14));border-radius:5px;padding:2px 7px;font:9px var(--font-mono);color:var(--workbench-text-secondary,#a8b0c2);background:var(--workbench-raised,#0b0e17)}
.research-badge.good{color:var(--workbench-green,#58c99b);border-color:color-mix(in srgb,var(--workbench-green,#58c99b) 42%,transparent)}.research-badge.warn{color:var(--workbench-amber,#e0ae68);border-color:color-mix(in srgb,var(--workbench-amber,#e0ae68) 42%,transparent)}.research-badge.info{color:var(--workbench-info,#7ca8f6);border-color:color-mix(in srgb,var(--workbench-info,#7ca8f6) 42%,transparent)}
@media(max-width:980px){.research-workbench{grid-template-columns:1fr}.research-card.research-wide{grid-column:auto}.research-form-row{grid-template-columns:1fr}}
.ri-panel,.rgv8-card,.sfv9-card{margin:8px 0 10px;padding:10px 12px;border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:8px;background:var(--workbench-panel,#10141f);box-shadow:none}
.ri-title,.rgv8-card h3,.sfv9-card h3{font:650 10px/1.2 var(--font-sans,system-ui);color:var(--workbench-text,#f1f3f8);margin:0 0 8px}
.ri-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.ri-row{display:flex;gap:8px;align-items:center;margin:5px 0}.ri-row label{flex:0 0 90px;color:var(--muted);font-size:10px}.ri-row select{min-width:0;flex:1}
.ue-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ue-card{background:var(--workbench-panel,#10141f);border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:8px;padding:10px}.ue-title{font:650 10px var(--font-sans,system-ui);color:var(--workbench-text,#f1f3f8);margin-bottom:6px}
.ue-archmap{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}.ue-node{border:1px solid var(--workbench-border-strong,rgba(205,214,245,.14));border-radius:5px;padding:4px 8px;font:10px var(--font-mono);color:var(--workbench-text-secondary,#a8b0c2);background:var(--workbench-raised,#0b0e17)}.ue-node.core{color:var(--workbench-green,#58c99b);border-color:color-mix(in srgb,var(--workbench-green,#58c99b) 42%,transparent)}.ue-node.warn{color:var(--workbench-amber,#e0ae68);border-color:color-mix(in srgb,var(--workbench-amber,#e0ae68) 42%,transparent)}
.ue-toolbar{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.fig-badge{position:fixed;right:14px;top:14px;z-index:9000;max-width:320px;background:var(--workbench-elevated,#151a28);border:1px solid var(--workbench-border-strong,rgba(205,214,245,.14));border-radius:8px;padding:9px 10px;font:10px/1.45 var(--font-mono);color:var(--workbench-text-secondary,#a8b0c2);box-shadow:0 14px 34px rgba(0,0,0,.32)}.fig-badge.good{border-color:color-mix(in srgb,var(--workbench-green,#58c99b) 45%,transparent)}.fig-badge.warn{border-color:color-mix(in srgb,var(--workbench-amber,#e0ae68) 45%,transparent)}.fig-badge.bad{border-color:color-mix(in srgb,var(--workbench-red,#ef6f7d) 45%,transparent)}.fig-actions{display:flex;gap:5px;margin-top:7px;flex-wrap:wrap}
.fig-panel{position:fixed;inset:6vh 5vw;z-index:10020;overflow:auto;background:var(--workbench-elevated,#151a28);border:1px solid var(--workbench-border-strong,rgba(205,214,245,.14));border-radius:12px;padding:16px;color:var(--workbench-text-secondary,#a8b0c2);box-shadow:0 24px 56px rgba(0,0,0,.36)}.fig-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}.fig-card{border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:8px;padding:8px;background:var(--workbench-panel,#10141f)}.fig-list{white-space:pre-wrap;font:10px/1.5 var(--font-mono);background:var(--workbench-raised,#0b0e17);border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:5px;padding:8px;margin-top:6px}
.rgv8-overlay{display:none;position:fixed;inset:0;background:rgba(4,6,10,.78);z-index:10000;align-items:flex-start;justify-content:center;padding:12vh 16px}.rgv8-overlay.show{display:flex}.rgv8-modal{width:min(660px,96vw);background:var(--workbench-elevated,#151a28);border:1px solid var(--workbench-border-strong,rgba(205,214,245,.14));border-radius:12px;box-shadow:0 24px 56px rgba(0,0,0,.36);padding:12px}
#rgv8Cmd{position:fixed;inset:0;z-index:13000;display:none;place-items:start center;padding:clamp(54px,10vh,96px) 16px 18px;background:rgba(4,6,10,.78)}#rgv8Cmd.show{display:grid}#rgv8Cmd[hidden]{display:none!important}body.command-palette-open{overflow:hidden}.rgv8-cmd-panel{width:min(720px,calc(100vw - 28px));max-height:min(620px,calc(100dvh - 84px));display:grid;grid-template-rows:auto auto auto minmax(0,1fr) auto;gap:9px;padding:14px;border:1px solid var(--workbench-border-strong,rgba(205,214,245,.14));border-radius:12px;background:var(--workbench-elevated,#151a28);box-shadow:0 24px 56px rgba(0,0,0,.36)}.rgv8-cmd-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.rgv8-cmd-title{display:grid;gap:3px}.rgv8-cmd-title span{font:650 13px/1.1 var(--font-sans,system-ui);color:var(--workbench-text,#f1f3f8)}.rgv8-cmd-title small{font:10px/1.4 var(--font-mono);color:var(--workbench-text-muted,#737e92)}.rgv8-cmd-close{flex:0 0 auto;min-width:44px;min-height:36px;padding:6px 9px;border-radius:5px;font:600 10px/1 var(--font-mono);color:var(--workbench-text-secondary,#a8b0c2);background:var(--workbench-control,#181d2b);border:1px solid var(--workbench-border-strong,rgba(205,214,245,.14))}#rgv8Cmd input{width:100%;margin:0;height:44px;border-radius:8px;border:1px solid var(--workbench-border-strong,rgba(205,214,245,.14));background:var(--workbench-control,#181d2b);color:var(--workbench-text,#f1f3f8);font:12px var(--font-mono);box-shadow:none}#rgv8Cmd input::placeholder{color:var(--workbench-text-muted,#737e92)}.rgv8-cmd-status{min-height:14px;color:var(--workbench-text-muted,#737e92);font:9px/1.4 var(--font-mono)}.rgv8-cmd-list{min-height:0;max-height:none;overflow:auto;overscroll-behavior:contain;margin:0;display:grid;gap:4px;padding-right:2px}.rgv8-cmd-row{width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;text-align:left;padding:10px 11px;border-radius:5px;margin:0;border:1px solid transparent;background:transparent;color:var(--workbench-text-secondary,#a8b0c2)}.rgv8-cmd-row:hover,.rgv8-cmd-row:focus-visible,.rgv8-cmd-row.is-active{border-color:var(--workbench-border-selected,rgba(139,124,246,.55));background:var(--workbench-selected,#242a3d);color:var(--workbench-text,#f1f3f8)}.rgv8-cmd-copy{min-width:0;display:grid;gap:3px}.rgv8-cmd-copy strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 11px/1.25 var(--font-sans,system-ui)}.rgv8-cmd-copy em{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--workbench-text-muted,#737e92);font:normal 9px/1.35 var(--font-mono)}.rgv8-cmd-row small{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--workbench-text-muted,#737e92);font-family:var(--font-mono);font-size:9px}.rgv8-cmd-empty{padding:16px;border:1px dashed var(--workbench-border-strong,rgba(205,214,245,.14));border-radius:8px;color:var(--workbench-text-muted,#737e92);text-align:center;font:11px var(--font-mono)}.rgv8-cmd-hint{color:var(--workbench-text-muted,#737e92);font:10px/1.4 var(--font-mono);text-align:right}
#ueFloatingDiag{position:fixed;right:12px;bottom:12px;z-index:900;width:min(300px,90vw);background:var(--workbench-elevated,#151a28);border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:8px;padding:8px;font-size:10px;box-shadow:0 14px 34px rgba(0,0,0,.32)}#ueFloatingDiag.collapsed{width:auto}#ueFloatingDiag.collapsed .ue-fbody{display:none}
@media(max-width:780px){.rg-grid,.ue-grid,.ri-grid{grid-template-columns:1fr}.fig-badge{display:none}}
@media(max-width:560px){#rgv8Cmd{padding:10px;place-items:center}.rgv8-cmd-panel{width:100%;max-height:calc(100dvh - 20px);padding:12px;border-radius:12px}.rgv8-cmd-title small{max-width:240px}.rgv8-cmd-row{min-height:52px}.rgv8-cmd-row small{max-width:110px}.rgv8-cmd-hint{text-align:center}#ueFloatingDiag{right:10px;bottom:78px;z-index:80;max-width:calc(100vw - 20px);max-height:34vh;overflow:auto}#ueFloatingDiag.collapsed{max-height:38px}.rail{z-index:960}.rail-submenu{z-index:980}}
`
  );
  installStyle(
    'riV4Style',
    '.ri-chip{display:inline-flex;border:1px solid var(--border-strong);border-radius:999px;padding:2px 7px;font:9px var(--font-mono);color:var(--text)}.ri-chip.info{color:var(--cyan)}.ri-chip.good{color:var(--green)}.ri-chip.warn{color:var(--orange)}.ri-chip.bad{color:var(--red)}'
  );
  installStyle('rgv8-style', '');
  installStyle('sfv9-style', '');
  installStyle('finalPreservationStyle', '');
  installStyle('figStyle', '');
}
