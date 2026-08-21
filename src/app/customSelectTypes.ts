export interface CustomSelectInstallation {
  /** Enhance newly-created eligible selects and resynchronise existing ones. */
  refresh(root?: ParentNode): void;
  /** Remove the enhancement and restore the original selects. */
  destroy(): void;
}

export interface CustomSelectManagerHost {
  activate(control: CustomSelectController): void;
  deactivate(control: CustomSelectController): void;
  reconcile(control: CustomSelectController): void;
  schedulePosition(): void;
  scheduleSync(): void;
}

/** The manager operations used by a generated select control. */
export interface CustomSelectController {
  readonly select: HTMLSelectElement;
  readonly host: HTMLDivElement;
  readonly button: HTMLButtonElement;
  readonly listbox: HTMLDivElement;
  isOpen(): boolean;
  isIntact(): boolean;
  contains(target: Node | null): boolean;
  refresh(): void;
  position(): void;
  close(): void;
  destroy(restoreDom: boolean): void;
}
