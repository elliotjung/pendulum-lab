/**
 * Accessible, progressively-enhanced presentation for native single-selects.
 *
 * The original select remains in the DOM (and remains the form/value source of
 * truth) so automation, form submission, validation and existing listeners keep
 * working. The control and manager live in focused modules; this entry point
 * keeps the public installation API stable for the application.
 */

import { CustomSelectManager } from './customSelectManager';
import type { CustomSelectInstallation } from './customSelectTypes';
import { documentFor } from './customSelectUtils';

export type { CustomSelectInstallation } from './customSelectTypes';

const installations = new WeakMap<Document, CustomSelectManager>();

/**
 * Enhance every present and future native single-select under `root`.
 * Repeated installation for the same document is idempotent.
 */
export function installCustomSelects(root: ParentNode = document): CustomSelectInstallation {
  const ownerDocument = documentFor(root);
  if (!ownerDocument?.body) throw new Error('installCustomSelects requires document.body to exist.');
  const existing = installations.get(ownerDocument);
  if (existing) {
    existing.refresh(root);
    return existing;
  }
  const observedRoot = root instanceof Document ? root.documentElement : root;
  const manager = new CustomSelectManager(ownerDocument, observedRoot, () => installations.delete(ownerDocument));
  installations.set(ownerDocument, manager);
  manager.refresh(root);
  return manager;
}
