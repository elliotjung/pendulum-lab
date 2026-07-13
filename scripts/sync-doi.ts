import { readFile, writeFile } from 'node:fs/promises';

const report = JSON.parse(await readFile('reports/zenodo-deposition.json', 'utf8')) as {
  doi?: string | null;
  status?: string;
  recordId?: number | null;
};
const doi = String(report.doi ?? '').trim();
if (!/^10\.\d{4,9}\/zenodo\.\d+$/i.test(doi)) {
  throw new Error(
    'No valid production Zenodo DOI is present in reports/zenodo-deposition.json; citation files were not changed.'
  );
}

const badge = `[![DOI](https://zenodo.org/badge/DOI/${encodeURIComponent(doi)}.svg)](https://doi.org/${doi})`;
let readme = await readFile('README.md', 'utf8');
readme = readme.replace(/^\[!\[DOI\].*\n?/m, '');
const firstBreak = readme.indexOf('\n');
readme = `${readme.slice(0, firstBreak + 1)}\n${badge}\n${readme.slice(firstBreak + 1).replace(/^\n+/, '')}`;
await writeFile('README.md', readme, 'utf8');

let citation = await readFile('CITATION.cff', 'utf8');
citation = citation.replace(/\nidentifiers:\n(?:  -.*\n(?:    .*\n)*)+/g, '\n');
const identifierBlock = `identifiers:\n  - type: doi\n    value: "${doi}"\n    description: "Archived software release"\n`;
if (/^license:/m.test(citation))
  citation = citation.replace(/^license:.*$/m, (line) => `${line}\n${identifierBlock.trimEnd()}`);
else citation += `\n${identifierBlock}`;
await writeFile('CITATION.cff', citation, 'utf8');

let releaseDoc = await readFile('docs/release-packaging.md', 'utf8');
const doiLine = `Archived release DOI: [${doi}](https://doi.org/${doi})`;
releaseDoc = releaseDoc.replace(/^Archived release DOI:.*$/m, doiLine);
if (!releaseDoc.includes(doiLine)) releaseDoc = `${releaseDoc.trimEnd()}\n\n${doiLine}\n`;
await writeFile('docs/release-packaging.md', releaseDoc, 'utf8');

const sync = {
  schemaVersion: 'pendulum-doi-sync/v1',
  generatedAt: new Date().toISOString(),
  doi,
  recordId: report.recordId ?? null,
  files: ['README.md', 'CITATION.cff', 'docs/release-packaging.md'],
  status: 'synced'
};
await writeFile('reports/doi-sync.json', `${JSON.stringify(sync, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(sync, null, 2));
