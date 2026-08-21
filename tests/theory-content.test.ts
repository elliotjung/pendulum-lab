import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  THEORY_OVERVIEW,
  THEORY_SECTIONS,
  THEORY_SECTION_IDS,
  normalizeTheoryLocale,
  theorySection,
  theoryText
} from '../src/app/theoryContent';
import { THEORY_LINK_IDS, THEORY_LINKS, isSafeTheoryHref } from '../src/app/theoryLinks';

describe('Theory content', () => {
  it('follows the complete model-to-evidence progression exactly once', () => {
    expect(THEORY_SECTIONS.map((section) => section.id)).toEqual(THEORY_SECTION_IDS);
    expect(THEORY_SECTIONS.map((section) => section.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(new Set(THEORY_SECTIONS.map((section) => section.id)).size).toBe(THEORY_SECTIONS.length);
  });

  it('keeps every visible content field complete in English and Korean', () => {
    const bilingual = [
      ...Object.values(THEORY_OVERVIEW),
      ...THEORY_SECTIONS.flatMap((section) => [
        section.title,
        section.summary,
        ...section.paragraphs,
        ...section.equations.flatMap((equation) => [equation.label, equation.explanation]),
        ...(section.caveat ? [section.caveat] : [])
      ]),
      ...THEORY_LINK_IDS.flatMap((id) => [THEORY_LINKS[id].label, THEORY_LINKS[id].description])
    ];
    expect(bilingual.every((entry) => entry.en.trim().length > 0 && entry.ko.trim().length > 0)).toBe(true);
    expect(normalizeTheoryLocale('ko')).toBe('ko');
    expect(normalizeTheoryLocale('unsupported')).toBe('en');
    expect(theoryText(THEORY_OVERVIEW.title, 'ko')).toBe('이중진자 이론');
  });

  it('connects the equations to both implementations and evidence surfaces', () => {
    const formulations = theorySection('formulations');
    const implementation = theorySection('implemented-in');
    const evidence = theorySection('validation-evidence');

    expect(formulations.equations.map((equation) => equation.id)).toEqual(['euler-lagrange', 'hamiltonian']);
    expect(implementation.links).toEqual(
      expect.arrayContaining([
        'double-source',
        'canonical-source',
        'derivations-document',
        'lab-workspace',
        'trust-provenance'
      ])
    );
    expect(evidence.links).toEqual(
      expect.arrayContaining(['validation-workspace', 'trust-validation', 'invariant-tests', 'reference-tests'])
    );
  });

  it('uses only curated in-app destinations and HTTPS repository links', () => {
    expect(Object.keys(THEORY_LINKS).sort()).toEqual([...THEORY_LINK_IDS].sort());
    expect(THEORY_LINK_IDS.every((id) => isSafeTheoryHref(THEORY_LINKS[id]))).toBe(true);
    expect(THEORY_SECTIONS.every((section) => section.links.every((id) => Object.hasOwn(THEORY_LINKS, id)))).toBe(true);
  });

  it('pins the implemented mass matrix, state conversion, and chaos caveat', () => {
    const massMatrix = theorySection('mass-matrix-eom')
      .equations.map((equation) => equation.expression)
      .join('\n');
    const representation = theorySection('numerical-representation').equations[0]?.expression ?? '';
    const evidence = theorySection('validation-evidence')
      .paragraphs.map((paragraph) => paragraph.en)
      .join(' ');

    expect(massMatrix).toContain('(m₁+m₂)l₁²');
    expect(massMatrix).toContain('M(θ)α');
    expect(representation).toContain('p = M(q)ω');
    expect(evidence).toContain('long trajectories separate exponentially');
  });
});

describe('Theory renderer contract', () => {
  it('constructs content through safe DOM APIs without HTML parsing sinks', async () => {
    const source = await readFile(new URL('../src/app/TheoryTab.ts', import.meta.url), 'utf8');
    expect(source).toContain('document.createElement(tag)');
    expect(source).toContain('element.textContent = text');
    expect(source).not.toMatch(
      /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(|\beval\s*\(/
    );
  });

  it('renders the complete bilingual-safe workspace into a minimal document host', async () => {
    class FakeElement {
      readonly children: unknown[] = [];
      readonly attributes = new Map<string, string>();
      readonly dataset: Record<string, string> = {};
      readonly classList = {
        add: (...tokens: string[]) => {
          this.className = [this.className, ...tokens].filter(Boolean).join(' ');
        }
      };
      className = '';
      id = '';
      textContent = '';
      open = false;
      hidden = false;

      constructor(readonly ownerDocument: FakeDocument) {}

      append(...nodes: unknown[]): void {
        this.children.push(...nodes);
      }

      replaceChildren(...nodes: unknown[]): void {
        this.children.splice(0, this.children.length, ...nodes);
      }

      setAttribute(name: string, value: string): void {
        this.attributes.set(name, value);
      }

      addEventListener(): void {}

      querySelector(): null {
        return null;
      }

      querySelectorAll(): [] {
        return [];
      }
    }

    class FakeDocument {
      readonly documentElement = { lang: 'en' };
      readonly created: FakeElement[] = [];
      readonly head = new FakeElement(this);
      readonly host = new FakeElement(this);

      getElementById(id: string): FakeElement | null {
        return id === 'theoryContent' ? this.host : null;
      }

      createElement(): FakeElement {
        const element = new FakeElement(this);
        this.created.push(element);
        return element;
      }

      createTextNode(text: string): { textContent: string } {
        return { textContent: text };
      }

      addEventListener(): void {}
    }

    const fakeDocument = new FakeDocument();
    vi.stubGlobal('Document', FakeDocument);
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('document', fakeDocument);
    vi.stubGlobal('CSS', { escape: (value: string) => value });
    try {
      const [{ DomBinder }, { TheoryTab }] = await Promise.all([
        import('../src/app/DomBinder'),
        import('../src/app/TheoryTab')
      ]);
      new TheoryTab(new DomBinder(fakeDocument as unknown as Document)).install();

      expect(fakeDocument.host.children).toHaveLength(5);
      expect(fakeDocument.host.className).toContain('theory-workspace');
      expect(fakeDocument.created.some((element) => element.textContent === 'Double-pendulum theory')).toBe(true);
      expect(fakeDocument.created.filter((element) => element.className === 'theory-section')).toHaveLength(9);
      expect(fakeDocument.head.children).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
