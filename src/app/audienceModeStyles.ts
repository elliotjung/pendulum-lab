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
body.audience-beginner .dev-hub,
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
body.audience-research .rb-badge{box-shadow:0 0 0 1px rgba(255,255,255,.025),0 6px 18px rgba(0,0,0,.14)}
body.audience-research #tab-research .research-card:first-child{border-color:rgba(231,200,135,.42)}
.tab-icon{color:var(--lux-ice,#9fdcff)}.rail-menu-icon{color:var(--subtle,#94a4c2)}.rail-menu-button:hover .rail-menu-icon,.rail-menu-button[aria-expanded="true"] .rail-menu-icon{color:var(--lux-ice,#9fdcff)}
.rail-icon-svg{width:20px;height:20px;display:block;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.rail-menu-icon .rail-icon-svg{width:19px;height:19px}
.tab-icon .rail-icon-svg{width:18px;height:18px}
.rail-submenu-hint{grid-column:1/-1;margin:0 0 5px;padding:7px 9px;border:0;border-radius:9px;background:rgba(255,255,255,.035);box-shadow:inset 0 0 0 1px rgba(255,255,255,.085);color:var(--subtle,#94a4c2);font-size:10.5px;line-height:1.45}
.audience-select{margin-top:8px;padding:7px;display:grid;grid-template-columns:1fr;gap:6px;border:1px solid rgba(255,255,255,.085);border-radius:12px;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.01));box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}
.audience-select label{font:800 7.5px/1 var(--font-mono,monospace);letter-spacing:1.1px;color:var(--subtle,#6b7894);text-transform:uppercase;text-align:left}
.audience-select select{width:100%;height:26px;font-size:9.5px;padding:4px 6px;border-radius:7px;background-color:rgba(4,8,18,.92)}
.audience-chooser-open{overflow:hidden}
.audience-chooser{position:fixed;inset:0;z-index:12000;display:grid;place-items:center;padding:24px;background:linear-gradient(rgba(159,220,255,.028) 1px,transparent 1px) 0 0/100% 52px,linear-gradient(90deg,rgba(159,220,255,.028) 1px,transparent 1px) 0 0/52px 100%,radial-gradient(130% 130% at 50% 0%,rgba(10,15,28,.9),rgba(3,5,11,.97));backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);animation:audienceChooserIn .26s ease both}
.audience-chooser[hidden]{display:none!important}
@keyframes audienceChooserIn{from{opacity:0}to{opacity:1}}
.audience-chooser-card{position:relative;width:min(840px,calc(100vw - 40px));max-height:calc(100vh - 40px);overflow:auto;border:1px solid transparent;border-radius:18px;background:linear-gradient(174deg,rgba(11,16,30,.985),rgba(7,10,20,.99)) padding-box,linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,.05) 36%,rgba(255,255,255,.04) 72%,rgba(231,200,135,.16)) border-box;box-shadow:0 34px 90px -34px rgba(0,0,0,.92),0 0 80px -40px rgba(120,200,255,.5),inset 0 1px 0 rgba(255,255,255,.08);padding:26px;animation:audienceCardIn .34s cubic-bezier(.2,.7,.2,1) both}
.audience-chooser-card::before,.audience-chooser-card::after{content:"";position:absolute;top:-1px;width:16px;height:16px;border:1px solid rgba(190,225,250,.8);pointer-events:none;filter:drop-shadow(0 0 4px rgba(159,220,255,.55))}
.audience-chooser-card::before{left:-1px;border-right:0;border-bottom:0;border-top-left-radius:16px}
.audience-chooser-card::after{right:-1px;border-left:0;border-bottom:0;border-top-right-radius:16px}
@keyframes audienceCardIn{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.audience-chooser,.audience-chooser-card{animation:none}}
.audience-chooser-eyebrow{font:700 9.5px/1 var(--font-mono,monospace);letter-spacing:.34em;text-transform:uppercase;color:var(--lux-gold,#e7c887);margin-bottom:8px;text-shadow:0 0 12px rgba(231,200,135,.4)}
.audience-chooser-eyebrow::before{content:"— ";opacity:.7}
.audience-chooser-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:16px}
.audience-chooser-title{font:750 21px/1.2 var(--font-display);color:var(--fg-bright);letter-spacing:.1em;text-transform:uppercase;background:linear-gradient(96deg,#f7fbff 0%,#cfeeff 52%,#e9d9ae 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.audience-chooser-copy{margin-top:6px;color:var(--text);font-size:12px;line-height:1.6;max-width:560px}
.audience-chooser-close{width:32px;height:32px;border-radius:8px;padding:0;font-size:16px;color:var(--text)}
.audience-choice-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.audience-choice{display:grid;grid-template-columns:36px minmax(0,1fr);gap:11px;align-items:start;text-align:left;padding:14px 13px;border-radius:12px;background:linear-gradient(168deg,rgba(255,255,255,.045),rgba(255,255,255,.015));border:1px solid var(--glass-stroke);color:var(--text);min-height:118px;transition:border-color .2s var(--ease,ease),background .2s var(--ease,ease),box-shadow .25s var(--ease,ease),transform .18s var(--ease-spring,ease)}
.audience-choice:hover,.audience-choice:focus-visible{border-color:rgba(159,220,255,.42);background:linear-gradient(172deg,rgba(159,220,255,.085),rgba(231,200,135,.035));color:var(--fg-bright);transform:translateY(-2px);box-shadow:0 16px 36px -16px rgba(0,0,0,.75),0 0 28px -12px rgba(120,200,255,.55)}
.audience-choice:focus-visible{outline:2px solid var(--lux-ice,#9fdcff);outline-offset:3px}
.audience-choice:active{transform:translateY(-1px) scale(.99)}
.audience-choice-icon{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;color:var(--lux-ice,#9fdcff);background:linear-gradient(180deg,rgba(159,220,255,.11),rgba(159,220,255,.03));border:1px solid rgba(159,220,255,.26);box-shadow:inset 0 1px 0 rgba(255,255,255,.12);transition:box-shadow .25s var(--ease,ease),transform .2s var(--ease-spring,ease)}
.audience-choice:hover .audience-choice-icon,.audience-choice:focus-visible .audience-choice-icon{box-shadow:inset 0 1px 0 rgba(255,255,255,.16),0 0 16px -5px rgba(120,200,255,.7);transform:scale(1.05)}
.audience-choice-icon .rail-icon-svg{width:22px;height:22px}
.audience-choice strong{display:block;color:var(--fg-bright);font-size:13px;margin-bottom:4px;letter-spacing:.8px;text-transform:uppercase}
.audience-choice span{display:block;color:var(--text);font-size:11px;line-height:1.5}
.audience-choice small{display:block;margin-top:8px;color:var(--muted);font:10px/1.4 var(--font-mono)}
.audience-choice{position:relative}
.audience-choice-current{border-color:rgba(231,200,135,.44);box-shadow:0 0 24px -12px rgba(231,200,135,.6)}
.audience-choice-current::after{content:attr(data-current-label);position:absolute;top:9px;right:9px;font:700 7.5px/1 var(--font-mono,monospace);letter-spacing:.18em;color:var(--lux-gold,#e7c887);border:1px solid rgba(231,200,135,.4);border-radius:999px;padding:3px 7px;background:rgba(231,200,135,.08);pointer-events:none}
@media(prefers-reduced-motion:reduce){.audience-choice,.audience-choice-icon{transition:none}.audience-choice:hover,.audience-choice:focus-visible{transform:none}.audience-choice:hover .audience-choice-icon,.audience-choice:focus-visible .audience-choice-icon{transform:none}}
@media(max-width:1100px){
  body.audience-beginner #tab-lab .layout{grid-template-columns:1fr}
}
@media(max-width:560px){
  /* Bottom-bar rail: Mode + Guide compress to one label-less row so the rail
     keeps its compact height (pinned <95px by the mobile rail e2e). */
  .audience-select{grid-template-columns:repeat(2,minmax(0,1fr));align-items:center;gap:4px;padding:4px 6px;margin-top:0;border:0;background:transparent;box-shadow:none}
  .audience-select label{display:none}
  .audience-select select{height:36px;min-height:36px;font-size:10px;padding:3px 26px 3px 8px}
  body.audience-beginner #tab-lab .main-wrap{min-height:54vh}
  body.audience-beginner #tab-lab #main{min-height:52vh}
  body.audience-beginner #tab-lab .layout{gap:8px}
  body.audience-beginner #tab-lab .controls{max-height:32vh;overflow:auto}
  body.audience-beginner .presets{top:0}
  .audience-chooser{padding:12px}
  .audience-chooser-card{padding:16px}
  .audience-chooser-head{gap:8px}
  .audience-choice-grid{grid-template-columns:1fr}
  .audience-choice{min-height:auto}
}
`;
}
