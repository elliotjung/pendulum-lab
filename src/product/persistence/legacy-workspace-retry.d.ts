/** Same implementation, with a distinct statically bundled URL for the one
 * bounded retry after an ES module fetch failure. */
declare module '*?workspace-retry' {
  export const createLegacyWorkspacePanel: typeof import('./legacy-workspace-panel').createLegacyWorkspacePanel;
}
