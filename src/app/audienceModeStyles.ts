import { visibleRailSections, type AudienceMode } from './audienceModePolicy';

const BEGINNER_HIDDEN_SURFACES = [
  '#stableIntuitivePanel',
  '#v10StatusCard',
  '#rgv7ControlCard',
  '#rgv8GovCard',
  '#rgv7ValidationCard',
  '#rgv8Honesty',
  '#rgv8Commercial',
  '#rgv8ValidateNote',
  '#canonicalDiag',
  '#riAnalysisControls',
  '#riScientificStatusPanel',
  '#sfv9Panel',
  '#plxModeCard'
];

const STUDENT_HIDDEN_SURFACES = [
  '#rgv7ControlCard',
  '#rgv8GovCard',
  '#rgv8Honesty',
  '#rgv8Commercial',
  '#canonicalDiag',
  '#sfv9Panel',
  '#plxModeCard'
];

function selectorsForModeHiddenSections(mode: AudienceMode): string {
  const visible = new Set(visibleRailSections(mode));
  return ['sim', 'analysis', 'chaos', 'check', 'govern']
    .filter((section) => !visible.has(section))
    .map((section) => `body.audience-${mode} .rail-section[data-rail-section="${section}"]`)
    .join(',');
}

function prefixBody(selectors: readonly string[], mode: AudienceMode): string {
  return selectors.map((selector) => `body.audience-${mode} ${selector}`).join(',');
}

/** CSS-only audience presentation policy, kept separate from mode state and DOM wiring. */
export function audienceModeCss(): string {
  const beginnerHidden = selectorsForModeHiddenSections('beginner');
  const studentHidden = selectorsForModeHiddenSections('student');
  const beginnerSurfaces = prefixBody(BEGINNER_HIDDEN_SURFACES, 'beginner');
  const studentSurfaces = prefixBody(STUDENT_HIDDEN_SURFACES, 'student');

  return `
${beginnerHidden}{display:none!important}
${studentHidden}{display:none!important}
body.audience-beginner #ueFloatingDiag,
body.audience-beginner .diag-row,
body.audience-beginner header .badge,
body.audience-beginner header #qualBadge,
body.audience-beginner header #fpsBadge,
body.audience-beginner .rb-badge,
body.audience-beginner .trust-inspector-backdrop,
body.audience-beginner #savePreset,
body.audience-beginner #tab-lab .scrub-row,
body.audience-beginner #tab-lab .plots-row,
body.audience-beginner [data-audience-min="student"],
body.audience-beginner [data-audience-min="research"],
body.audience-student [data-audience-min="research"]{display:none!important}
${beginnerSurfaces}{display:none!important}
${studentSurfaces}{display:none!important}
body.audience-beginner #tab-lab .layout{grid-template-columns:minmax(0,1fr) minmax(220px,280px)}
body.audience-beginner #tab-lab .controls{max-height:none}
body.audience-beginner #tab-lab .main-wrap{min-height:clamp(320px,58vh,680px)}
body.audience-beginner #tab-lab #main{height:100%;min-height:clamp(300px,55vh,640px)}
body.audience-beginner #tab-lab .ctrl-sticky{border-radius:var(--radius-lg) var(--radius-lg) 0 0}
body.audience-beginner #tab-lab .controls .acc[open]>.acc-body{padding-bottom:12px}
body.audience-beginner .presets{position:sticky;top:0;z-index:50}
body.audience-research .rb-badge{box-shadow:none}
body.audience-research #tab-research .research-card:first-child{border-color:var(--workbench-border-selected,rgba(139,124,246,.55))}

.tab-icon{color:var(--workbench-live,#72d6e5)}
.rail-menu-icon{color:var(--workbench-text-muted,#737e92)}
.rail-menu-button:hover .rail-menu-icon,.rail-menu-button[aria-expanded="true"] .rail-menu-icon{color:var(--workbench-text,#f1f3f8)}
.rail-icon-svg{width:20px;height:20px;display:block;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.rail-menu-icon .rail-icon-svg{width:19px;height:19px}
.tab-icon .rail-icon-svg{width:18px;height:18px}
.rail-submenu-hint{grid-column:1/-1;margin:0 0 5px;padding:7px 9px;border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:8px;background:var(--workbench-panel,#10141f);color:var(--workbench-text-muted,#737e92);font-size:10.5px;line-height:1.45}

.audience-select{margin-top:auto;padding:4px;display:grid;place-items:center;flex:0 0 auto;min-width:0;border:1px solid var(--workbench-border,rgba(205,214,245,.08));border-radius:8px;background:var(--workbench-raised,#0b0e17)}
.audience-preferences-toggle{display:grid;place-items:center;width:44px;height:44px;min-width:44px;min-height:44px;padding:0;border-radius:5px;border:1px solid var(--workbench-border-strong,rgba(205,214,245,.14));background:var(--workbench-control,#181d2b);color:var(--workbench-text-secondary,#a8b0c2);font:650 11px/1 var(--font-sans,system-ui);touch-action:manipulation}
.audience-preferences-toggle:hover,.audience-preferences-toggle:focus-visible,.audience-select.is-open .audience-preferences-toggle{border-color:var(--workbench-border-selected,rgba(139,124,246,.55));background:var(--workbench-selected,#242a3d);color:var(--workbench-text,#f1f3f8)}
.audience-preferences-toggle:focus-visible{outline:2px solid var(--focus,#b7afff);outline-offset:2px}
.audience-preference-fields{position:fixed;left:calc(var(--rail-w,80px) + 12px);bottom:max(12px,env(safe-area-inset-bottom));z-index:955;width:min(418px,calc(100vw - var(--rail-w,80px) - 24px));display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;padding:10px;border:1px solid var(--workbench-border-strong,rgba(205,214,245,.14));border-radius:12px;background:var(--workbench-elevated,#151a28);box-shadow:0 18px 44px rgba(0,0,0,.32);isolation:isolate}
.audience-preference-fields[hidden]{display:none!important}
.audience-field{position:relative;display:grid;grid-template-columns:minmax(0,1fr);gap:4px;min-width:0}
.audience-field::after{content:"⌄";position:absolute;right:7px;bottom:9px;color:var(--workbench-text-muted,#737e92);font:700 11px/1 var(--font-mono,monospace);pointer-events:none}
.audience-select label{min-width:0;font:600 9px/1.2 var(--font-sans,system-ui);color:var(--workbench-text-muted,#737e92);text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.audience-select select{appearance:none;-webkit-appearance:none;width:100%;height:44px;min-height:44px;min-width:0;font-size:11px;line-height:1.2;padding:6px 23px 6px 8px;border:1px solid var(--workbench-border-strong,rgba(205,214,245,.14));border-radius:5px;background-color:var(--workbench-control,#181d2b);color:var(--workbench-text,#f1f3f8);text-overflow:ellipsis;white-space:nowrap;color-scheme:inherit;touch-action:manipulation}
.audience-select select:focus-visible{outline:2px solid var(--focus,#b7afff);outline-offset:2px;border-color:var(--workbench-border-selected,rgba(139,124,246,.55))}

.audience-chooser-open{overflow:hidden}
.audience-chooser{position:fixed;inset:0;z-index:12000;display:grid;place-items:center;overflow:hidden;overscroll-behavior:contain;padding:max(24px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left));background:rgba(4,6,10,.78);animation:audienceChooserIn 180ms cubic-bezier(.2,.8,.2,1) both}
.audience-chooser[hidden]{display:none!important}
@keyframes audienceChooserIn{from{opacity:0}to{opacity:1}}
.audience-chooser-card{position:relative;width:min(840px,100%);max-height:min(calc(100dvh - 48px),var(--ui-viewport-height,100dvh));overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;border:1px solid var(--workbench-border-strong,rgba(205,214,245,.14));border-radius:12px;background:var(--workbench-elevated,#151a28);box-shadow:0 24px 56px rgba(0,0,0,.36);padding:26px;animation:audienceCardIn 180ms cubic-bezier(.2,.8,.2,1) both}
@keyframes audienceCardIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.audience-chooser,.audience-chooser-card{animation:none}}
.audience-chooser-eyebrow{font:600 10px/1 var(--font-mono,monospace);color:var(--workbench-live,#72d6e5);margin-bottom:8px}
.audience-chooser-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:16px}
.audience-chooser-title{font:650 21px/1.2 var(--font-sans,system-ui);color:var(--workbench-text,#f1f3f8)}
.audience-chooser-copy{margin-top:6px;color:var(--workbench-text-secondary,#a8b0c2);font-size:12px;line-height:1.6;max-width:560px}
.audience-chooser-close{width:44px;height:44px;min-width:44px;min-height:44px;border-radius:8px;padding:0;font-size:20px;color:var(--workbench-text-secondary,#a8b0c2);touch-action:manipulation}
.audience-choice-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.audience-choice{position:relative;display:grid;grid-template-columns:36px minmax(0,1fr);gap:11px;align-items:start;text-align:left;padding:14px 13px;border-radius:8px;background:var(--workbench-panel,#10141f);border:1px solid var(--workbench-border,rgba(205,214,245,.08));color:var(--workbench-text-secondary,#a8b0c2);min-height:118px;overflow-wrap:anywhere;touch-action:manipulation;transition:border-color 120ms cubic-bezier(.2,.8,.2,1),background 120ms cubic-bezier(.2,.8,.2,1),color 120ms cubic-bezier(.2,.8,.2,1)}
.audience-choice:hover,.audience-choice:focus-visible{border-color:var(--workbench-border-selected,rgba(139,124,246,.55));background:var(--workbench-selected,#242a3d);color:var(--workbench-text,#f1f3f8)}
.audience-choice:focus-visible{outline:2px solid var(--focus,#b7afff);outline-offset:3px}
.audience-choice:active{background:var(--workbench-control,#181d2b)}
.audience-choice-icon{width:36px;height:36px;border-radius:8px;display:grid;place-items:center;color:var(--workbench-live,#72d6e5);background:var(--workbench-raised,#0b0e17);border:1px solid var(--workbench-border-strong,rgba(205,214,245,.14))}
.audience-choice-icon .rail-icon-svg{width:22px;height:22px}
.audience-choice strong{display:block;color:var(--workbench-text,#f1f3f8);font-size:13px;margin-bottom:4px}
.audience-choice span{display:block;color:var(--workbench-text-secondary,#a8b0c2);font-size:11px;line-height:1.5}
.audience-choice small{display:block;margin-top:8px;color:var(--workbench-text-muted,#737e92);font:10px/1.4 var(--font-mono)}
.audience-choice-current{padding-top:34px;border-color:var(--workbench-border-selected,rgba(139,124,246,.55));background:var(--workbench-selected,#242a3d)}
.audience-choice-current::after{content:attr(data-current-label);position:absolute;top:9px;right:9px;font:600 8px/1 var(--font-mono,monospace);color:var(--workbench-primary,#8b7cf6);border:1px solid var(--workbench-border-selected,rgba(139,124,246,.55));border-radius:5px;padding:3px 7px;background:var(--workbench-raised,#0b0e17);pointer-events:none}
@media(prefers-reduced-motion:reduce){.audience-choice{transition:none}}

@media(max-width:1100px){
  body.audience-beginner #tab-lab .layout{grid-template-columns:1fr}
}
@media(max-width:560px){
  .rail .audience-select{position:fixed;left:auto;right:max(10px,env(safe-area-inset-right));bottom:var(--compact-rail-offset,calc(77px + env(safe-area-inset-bottom)));z-index:980;display:grid;width:52px;height:52px;padding:4px;margin-top:0;border:1px solid var(--workbench-border-strong,rgba(205,214,245,.14));border-radius:12px;background:var(--workbench-elevated,#151a28);box-shadow:0 12px 30px rgba(0,0,0,.3)}
  body .main-col{padding-bottom:calc(92px + env(safe-area-inset-bottom));scroll-padding-bottom:calc(92px + env(safe-area-inset-bottom))}
  .audience-preferences-toggle{display:grid;width:44px;height:44px}
  .audience-preference-fields{position:fixed;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));bottom:calc(var(--compact-rail-offset,77px) + 62px);z-index:981;width:auto;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;padding:12px;border:1px solid var(--workbench-border-strong,rgba(205,214,245,.14));border-radius:14px;background:var(--workbench-elevated,#151a28);box-shadow:0 20px 48px rgba(0,0,0,.42)}
  .audience-select label{position:static;width:auto;height:auto;padding:0;margin:0;overflow:visible;clip:auto;white-space:nowrap;border:0}
  .audience-field{gap:5px}
  .audience-field::after{right:8px;bottom:16px}
  .audience-select select{height:44px;min-height:44px;font-size:12px;padding:5px 25px 5px 8px}
  body.audience-beginner #tab-lab .main-wrap{min-height:54vh}
  body.audience-beginner #tab-lab #main{min-height:52vh}
  body.audience-beginner #tab-lab .layout{gap:8px}
  body.audience-beginner #tab-lab .controls{max-height:32vh;overflow:auto}
  body.audience-beginner .presets{top:0}
  .audience-chooser{padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left))}
  .audience-chooser-card{width:100%;max-height:min(calc(100dvh - 20px),var(--ui-viewport-height,100dvh));padding:16px}
  .audience-chooser-head{gap:8px}
  .audience-choice-grid{grid-template-columns:1fr}
  .audience-choice{min-height:auto}
}
@media(max-height:560px) and (min-width:561px){
  .audience-chooser{place-items:start center;padding-block:10px}
  .audience-chooser-card{max-height:min(calc(100dvh - 20px),var(--ui-viewport-height,100dvh));padding:16px}
  .audience-chooser-head{margin-bottom:10px}
  .audience-chooser-copy{font-size:11px;line-height:1.4}
  .audience-choice{min-height:96px;padding-block:10px}
  .audience-choice-current{padding-top:30px}
}
@media(forced-colors:active){
  .audience-field::after{display:block;color:ButtonText}
  .audience-select select{appearance:none;-webkit-appearance:none;border:2px solid ButtonText!important;outline:1px solid ButtonText;outline-offset:-3px;background:Canvas;color:CanvasText;forced-color-adjust:auto}
  .audience-select select:focus-visible{border-color:Highlight!important;outline:3px solid Highlight;outline-offset:1px}
  .audience-choice-current{outline:3px solid Highlight;outline-offset:-4px}
  .audience-choice-current::after{border:1px solid Highlight;color:Highlight;background:Canvas}
  .audience-chooser,.audience-chooser-card,.audience-choice{forced-color-adjust:auto;background:Canvas;color:CanvasText;border-color:CanvasText;box-shadow:none}
}
`;
}
