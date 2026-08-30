const RAW_CONTENT = /<(script|style|pre|textarea|svg|math|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const TOKEN_PREFIX = '@@PENDULUM_STANDALONE_RAW_';
const SAFE_QUOTED_ATTRIBUTE = /(\s[\w:-]+)="([^\s"'`=<>]+)"/gu;
const GLOBAL_ROOT_BLOCK = /:root\s*\{([^}]*)\}/giu;
const ROOT_PROPERTY = /--[\w-]+(?=\s*:)/giu;
const SAFE_GLOBAL_PROPERTIES = new Set([
  '--workbench-bg',
  '--workbench-raised',
  '--workbench-panel',
  '--workbench-elevated',
  '--workbench-control',
  '--workbench-hover',
  '--workbench-selected',
  '--workbench-text',
  '--workbench-text-secondary',
  '--workbench-text-muted',
  '--workbench-border',
  '--workbench-border-strong',
  '--workbench-border-selected',
  '--workbench-primary',
  '--workbench-live',
  '--workbench-green',
  '--workbench-amber',
  '--workbench-red',
  '--workbench-info',
  '--font-sans',
  '--font-mono',
  '--focus',
  '--red',
  '--green',
  '--rail-w',
  '--compact-rail-offset',
  '--ui-viewport-height',
  '--ui-viewport-width',
  '--ui-viewport-offset-left',
  '--ui-viewport-offset-top'
]);
function braceDepth(source, end) {
  let depth = 0;
  let quote = '';
  for (let index = 0; index < end; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = '';
    } else if (character === '"' || character === "'") quote = character;
    else if (character === '/' && source[index + 1] === '*') {
      const close = source.indexOf('*/', index + 2);
      index = close < 0 ? end : close + 1;
    } else if (character === '{') depth += 1;
    else if (character === '}') depth -= 1;
  }
  return depth;
}

function guaranteedRootProperties(rawBlocks) {
  const guaranteed = new Set();
  for (const raw of rawBlocks) {
    if (raw.tag !== 'style') continue;
    for (const root of raw.content.matchAll(GLOBAL_ROOT_BLOCK)) {
      if (braceDepth(raw.content, root.index ?? 0) !== 0) continue;
      for (const property of root[1]?.matchAll(ROOT_PROPERTY) ?? []) {
        const name = property[0].toLowerCase();
        if (SAFE_GLOBAL_PROPERTIES.has(name)) guaranteed.add(name);
      }
    }
  }
  return guaranteed;
}

/** Remove any fallback only for tokens guaranteed by the artifact's unconditional :root contract. */
function stripGuaranteedVarFallbacks(source, guaranteed) {
  let output = '';
  let cursor = 0;
  let searchFrom = 0;
  while (true) {
    const start = source.indexOf('var(', searchFrom);
    if (start < 0) break;
    let depth = 1;
    let comma = -1;
    let quote = '';
    let end = -1;
    for (let index = start + 4; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (character === '\\') index += 1;
        else if (character === quote) quote = '';
      } else if (character === '"' || character === "'") quote = character;
      else if (character === '(') depth += 1;
      else if (character === ')') {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      } else if (character === ',' && depth === 1 && comma < 0) comma = index;
    }
    if (end < 0) break;
    if (comma >= 0) {
      const property = source.slice(start + 4, comma).trim();
      if (guaranteed.has(property.toLowerCase())) {
        output += `${source.slice(cursor, start)}var(${property})`;
        cursor = end + 1;
      }
    }
    searchFrom = end + 1;
  }
  return output + source.slice(cursor);
}

/**
 * Collapse only ordinary HTML text-node whitespace in the generated portable
 * shell and tag whitespace outside quoted attributes. Raw blocks are restored
 * byte-for-byte except for CSS fallbacks made redundant by explicit
 * unconditional root tokens. A single space is retained for text-node runs.
 */
export function minifyStandaloneHtml(source) {
  const rawBlocks = [];
  const protectedHtml = source.replace(RAW_CONTENT, (content, tag) => {
    const index = rawBlocks.push({ content, tag: String(tag).toLowerCase() }) - 1;
    return `${TOKEN_PREFIX}${index}@@`;
  });
  const guaranteed = guaranteedRootProperties(rawBlocks);
  const withoutComments = protectedHtml.replace(/<!--[\s\S]*?-->/g, '');
  let output = '';
  let inTag = false;
  let quote = '';
  let pendingWhitespace = false;
  let pendingTagWhitespace = false;

  for (let index = 0; index < withoutComments.length; index += 1) {
    const character = withoutComments[index];
    if (inTag) {
      if (quote) {
        output += character;
        if (character === quote) quote = '';
      } else if (/\s/u.test(character)) pendingTagWhitespace = true;
      else {
        if (pendingTagWhitespace && character !== '>' && !(character === '/' && withoutComments[index + 1] === '>'))
          output += ' ';
        pendingTagWhitespace = false;
        output += character;
        if (character === '"' || character === "'") quote = character;
        else if (character === '>') inTag = false;
      }
      continue;
    }
    if (character === '<') {
      if (pendingWhitespace) output += ' ';
      pendingWhitespace = false;
      output += character;
      inTag = true;
      pendingTagWhitespace = false;
    } else if (/\s/u.test(character)) pendingWhitespace = true;
    else {
      if (pendingWhitespace) output += ' ';
      pendingWhitespace = false;
      output += character;
    }
  }
  if (pendingWhitespace) output += ' ';
  return stripGuaranteedVarFallbacks(
    output
      .replace(SAFE_QUOTED_ATTRIBUTE, '$1=$2')
      .replace(new RegExp(`${TOKEN_PREFIX}(\\d+)@@`, 'g'), (_, index) => rawBlocks[Number(index)]?.content ?? ''),
    guaranteed
  );
}
