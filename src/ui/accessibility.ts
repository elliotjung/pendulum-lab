const canvasDescriptions: Record<string, string> = {
  main: 'Primary pendulum simulation canvas. It shows rod and bob positions over time.',
  energy: 'Energy history chart for kinetic, potential, and total energy.',
  phase: 'Phase portrait canvas for angular state trajectories.',
  poincare: 'Poincare section plot canvas.',
  lyap: 'Lyapunov estimate chart canvas.',
  fft: 'FFT spectrum chart canvas.',
  cmpCanvas: 'Integrator comparison canvas for overlaid pendulum motion.',
  cmpEnergy: 'Integrator energy drift comparison chart canvas.',
  cmpDiverge: 'Integrator divergence comparison chart canvas.',
  cmpBench: 'Integrator benchmark bar chart canvas.',
  lyapSpecCanvas: 'Full Lyapunov spectrum chart canvas.',
  sweepCanvas: 'Chaos sweep heatmap canvas.',
  bifCanvas: 'Bifurcation diagram canvas.',
  bifTorusCanvas: 'Invariant-circle preview canvas.',
  p3dCanvas: 'Interactive 3D phase-space projection canvas.',
  gpuCanvas: 'Phase-density visualization canvas.',
  zeroOneCanvas: 'Zero-one chaos test translation plot canvas.',
  clvCanvas: 'Covariant Lyapunov vector diagnostics canvas.',
  basinCanvas: 'Flip-basin classification canvas.',
  rqaCanvas: 'Recurrence plot diagnostics canvas.',
  ftleCanvas: 'Finite-time Lyapunov exponent field canvas.',
  rpSdeCanvas: 'Stochastic ensemble variance chart canvas.',
  rpCameraPreview: 'Camera colour-marker tracking preview canvas.',
  rpMagneticCanvas: 'Three-magnet pendulum attraction basin canvas.',
  rpQkrCanvas: 'Quantum kicked rotor Floquet quasi-energy spectrum canvas.',
  rpSyncCanvas: 'Kuramoto global order parameter over time canvas.',
  expReplayCanvas: 'Expansion lab replay snapshot canvas.',
  expHeatmapCanvas: 'Expansion lab phase heatmap canvas.',
  expGhostCanvas: 'Expansion lab ghost divergence canvas.',
  expBifCanvas: 'Expansion lab bifurcation preview canvas.',
  matrixSweepCanvas: 'Matrix sweep result canvas.',
  rwDesignPreview: 'Research workbench design-space sample preview canvas.',
  rwDesignHeatmap: 'Research workbench design-study heatmap canvas.',
  rwSuperpackCanvas: 'Research workbench superpack diagnostics canvas.',
  r3Canvas: 'Rope pendulum 3D projection canvas.',
  s3Canvas: 'Spherical pendulum 3D projection canvas.',
  s3Poincare: 'Spherical pendulum Poincare section canvas.',
  d3Canvas: 'Spherical chain 3D projection canvas.',
  d3ShellCanvas: 'Spherical chain shell-drift diagnostics canvas.',
  ds3Canvas: 'Double-string pendulum 3D projection canvas.',
  'modern-lab-probe': 'Modern lab probe canvas.'
};

const keyboardInteractiveCanvases = new Set(['main', 'p3dCanvas']);

function nearbyCaption(canvas: HTMLCanvasElement): string | null {
  const figureCaption = canvas.closest('figure')?.querySelector('figcaption')?.textContent?.trim();
  if (figureCaption) return figureCaption;
  const next = canvas.parentElement?.nextElementSibling;
  if (next?.classList.contains('canvas-label')) return next.textContent?.trim() || null;
  const local = canvas.parentElement?.querySelector('.canvas-label')?.textContent?.trim();
  return local || null;
}

function labelForCanvas(canvas: HTMLCanvasElement): string {
  const id = canvas.id || 'simulation-canvas';
  return canvasDescriptions[id] ?? nearbyCaption(canvas) ?? 'Pendulum Lab scientific visualization canvas.';
}

function enhanceCanvas(canvas: HTMLCanvasElement): void {
  if (canvas.getAttribute('aria-hidden') === 'true') {
    canvas.removeAttribute('role');
    canvas.removeAttribute('tabindex');
    return;
  }
  const label = labelForCanvas(canvas);
  canvas.setAttribute('role', 'img');
  if (keyboardInteractiveCanvases.has(canvas.id)) canvas.setAttribute('tabindex', '0');
  else canvas.removeAttribute('tabindex');
  canvas.setAttribute('aria-label', label);
  if (!canvas.textContent?.trim()) {
    canvas.textContent = `${label} Use export controls for data tables and reports.`;
  }
}

function railButtonLabel(button: HTMLButtonElement): string | null {
  const visible = button.querySelector('.rail-menu-label')?.textContent?.trim();
  if (visible) return `${visible} menu`;
  const section = button.dataset.railSectionButton;
  return section ? `${section} menu` : null;
}

function enhanceButton(button: HTMLButtonElement): void {
  button.querySelectorAll<HTMLElement>('.rail-menu-icon,.tab-icon').forEach((icon) => {
    icon.setAttribute('aria-hidden', 'true');
  });
  button.querySelectorAll<SVGElement>('svg').forEach((svg) => {
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
  });

  if (button.classList.contains('rail-menu-button')) {
    const label = railButtonLabel(button);
    if (label && !button.getAttribute('aria-label')) button.setAttribute('aria-label', label);
    return;
  }

  if (!button.getAttribute('aria-label') && !button.textContent?.trim()) {
    button.setAttribute('aria-label', button.title || button.dataset.tip || 'Pendulum Lab command');
  }
}

function enhanceTooltip(element: HTMLElement): void {
  if (element.getAttribute('aria-label') || element.getAttribute('aria-describedby')) return;
  const visible = element.textContent?.trim();
  const detail = element.dataset.tip?.trim();
  if (visible && detail) element.setAttribute('aria-label', `${visible}. ${detail}`);
}

function enhanceElement(root: ParentNode): void {
  if (root instanceof HTMLCanvasElement && root.dataset.a11yEnhanced !== 'true') {
    enhanceCanvas(root);
    root.dataset.a11yEnhanced = 'true';
  }
  if (root instanceof HTMLButtonElement) enhanceButton(root);
  if (root instanceof HTMLElement && root.matches('[data-tip]')) enhanceTooltip(root);
  root.querySelectorAll?.('canvas:not([data-a11y-enhanced="true"])').forEach((canvas) => {
    enhanceCanvas(canvas as HTMLCanvasElement);
    (canvas as HTMLCanvasElement).dataset.a11yEnhanced = 'true';
  });
  root.querySelectorAll?.('button').forEach((button) => enhanceButton(button as HTMLButtonElement));
  root.querySelectorAll<HTMLElement>('[data-tip]').forEach((element) => enhanceTooltip(element));
}

export function installAccessibilityEnhancements(): () => void {
  enhanceElement(document);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) enhanceElement(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  document.documentElement.classList.add('focus-visible-ready');
  return () => observer.disconnect();
}
