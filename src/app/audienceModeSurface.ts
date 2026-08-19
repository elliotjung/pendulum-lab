import { installAdoptedStyle } from '../ui/adoptedStyles';
import { installAudiencePreferenceControl } from './audiencePreferences';
import { audienceModeCss } from './audienceModeStyles';

const STYLE_ID = 'audience-mode-style';

interface AudienceOptionMeta {
  label: string;
  description: string;
}

/**
 * Mount presentation-only audience controls.  Policy, persistence, and the
 * chooser lifecycle remain in audienceMode so this surface can be reused by a
 * future embedded lab shell.
 */
export function installAudienceModeSurface(
  rail: Element,
  modes: Readonly<Record<string, AudienceOptionMeta>>,
  onModeChange: (value: string) => void
): HTMLSelectElement {
  installAdoptedStyle(STYLE_ID, audienceModeCss());
  return installAudiencePreferenceControl(rail, modes, onModeChange);
}
