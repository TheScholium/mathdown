'use strict';
/**
 * Obsidian-flavored Markdown for markdown-it:
 *   [[wikilinks]]   ![[embeds]]   #tags   ==highlights==   %%comments%%
 * plus YAML front matter (properties) and helpers for subpaths.
 *
 * Callouts, block IDs and footnotes are handled in the tree builder
 * (markdown.js), because they change the shape of blocks, not inline text.
 */

/* ------------------------------------------------------------------ */
/* Front matter                                                        */
/* ------------------------------------------------------------------ */

/**
 * Splits YAML front matter from the body. The front matter lines are
 * replaced with empty lines, so line numbers in the body stay correct.
 * @returns {{yaml: string|null, body: string, lines: number}}
 */
function splitFrontMatter(src) {
  let text = String(src || '');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (!/^---[ \t]*(\r?\n|$)/.test(text)) return {yaml: null, body: text, lines: 0};
  const lines = text.split('\n');
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i].replace(/\r$/, '').trimEnd();
    if (l === '---' || l === '...') {
      end = i;
      break;
    }
  }
  if (end < 0) return {yaml: null, body: text, lines: 0};
  const yaml = lines.slice(1, end).join('\n');
  const blank = new Array(end + 1).fill('');
  return {yaml, body: blank.concat(lines.slice(end + 1)).join('\n'), lines: end + 1};
}

function unquote(v) {
  const s = v.trim();
  if (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/''/g, "'");
  }
  return s;
}

function splitFlowList(inner) {
  const out = [];
  let cur = '';
  let q = null;
  for (const ch of inner) {
    if (q) {
      cur += ch;
      if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      cur += ch;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur);
  return out.map(unquote).filter(x => x !== '');
}

/**
 * A small YAML subset parser for Obsidian properties: scalars, quoted
 * strings, flow lists [a, b], block lists (- item) and block scalars (| >).
 * Anything else is kept as raw text, never thrown away.
 * @returns {{key: string, value: string|string[]}[]}
 */
function parseYaml(yaml) {
  const props = [];
  const lines = String(yaml || '').split('\n').map(l => l.replace(/\r$/, ''));
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) {
      i++;
      continue;
    }
    const m = /^([^\s:#][^:]*?)\s*:(?:\s+(.*)|\s*)$/.exec(line);
    if (!m || /^\s/.test(line)) {
      // Not a top-level key: attach to the previous property as text.
      if (props.length) {
        const p = props[props.length - 1];
        p.value = (Array.isArray(p.value) ? p.value.join(', ') : p.value) + ' ' + line.trim();
      }
      i++;
      continue;
    }
    const key = m[1].trim();
    const rest = (m[2] || '').trim();
    i++;
    if (rest === '' || rest === '|' || rest === '>' || rest === '|-' || rest === '>-') {
      const block = [];
      while (i < lines.length && (/^\s+/.test(lines[i]) || !lines[i].trim())) {
        block.push(lines[i]);
        i++;
      }
      const items = block.filter(l => /^\s*-\s+/.test(l) || /^\s*-$/.test(l));
      if (rest === '' && items.length && items.length === block.filter(l => l.trim()).length) {
        props.push({key, value: items.map(l => unquote(l.replace(/^\s*-\s*/, ''))).filter(x => x !== '')});
      } else {
        const joiner = rest.startsWith('>') ? ' ' : '\n';
        props.push({key, value: block.map(l => l.trim()).filter(Boolean).join(joiner)});
      }
    } else if (rest.startsWith('[') && rest.endsWith(']')) {
      props.push({key, value: splitFlowList(rest.slice(1, -1))});
    } else {
      props.push({key, value: unquote(rest)});
    }
  }
  return props;
}

/* ------------------------------------------------------------------ */
/* Link targets                                                        */
/* ------------------------------------------------------------------ */

/**
 * Parses the inside of [[...]] or ![[...]].
 * "Note#Heading|Alias" -> {page:'Note', sub:'Heading', alias:'Alias'}
 */
function parseLinkTarget(inner) {
  let s = String(inner || '');
  let alias = null;
  const bar = s.search(/\\?\|/);
  if (bar >= 0) {
    const width = s[bar] === '\\' ? 2 : 1;
    alias = s.slice(bar + width).trim();
    s = s.slice(0, bar);
  }
  let sub = null;
  const hash = s.indexOf('#');
  if (hash >= 0) {
    sub = s.slice(hash + 1).trim();
    s = s.slice(0, hash);
  }
  return {page: s.trim(), sub: sub || null, alias: alias || null};
}

/** The text Obsidian shows for a wikilink. */
function linkLabel(t) {
  if (t.alias) return t.alias;
  const sub = t.sub ? t.sub.replace(/#/g, ' > ').replace(/^\^/, '^') : '';
  if (!t.page) return sub;
  return sub ? t.page + ' > ' + sub : t.page;
}

/* ------------------------------------------------------------------ */
/* markdown-it rules                                                   */
/* ------------------------------------------------------------------ */

function findClose(src, from, close, max) {
  const i = src.indexOf(close, from);
  if (i < 0 || i >= max) return -1;
  const nl = src.indexOf('\n', from);
  if (nl >= 0 && nl < i) return -1; // links do not cross lines
  return i;
}

function wikiRule(state, silent) {
  const src = state.src;
  const start = state.pos;
  const embed = src.charCodeAt(start) === 0x21; /* ! */
  const open = embed ? start + 1 : start;
  if (src.charCodeAt(open) !== 0x5b || src.charCodeAt(open + 1) !== 0x5b) return false;
  const end = findClose(src, open + 2, ']]', state.posMax);
  if (end < 0) return false;
  const inner = src.slice(open + 2, end);
  if (!inner.trim() || inner.indexOf('[[') >= 0) return false;
  if (!silent) {
    const t = state.push(embed ? 'obs_embed' : 'obs_wikilink', '', 0);
    t.meta = parseLinkTarget(inner);
    t.content = inner;
  }
  state.pos = end + 2;
  return true;
}

const TAG_CHAR = /[A-Za-z0-9_\-/À-ɏͰ-ϿЀ-ӿ぀-ヿ一-鿿]/;

function tagRule(state, silent) {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x23 /* # */) return false;
  if (start > 0) {
    const prev = src[start - 1];
    if (!/[\s(\[{,;:"']/.test(prev)) return false;
  }
  let end = start + 1;
  while (end < state.posMax && TAG_CHAR.test(src[end])) end++;
  let tag = src.slice(start + 1, end);
  while (tag.endsWith('/')) tag = tag.slice(0, -1);
  if (!tag || /^[0-9]+$/.test(tag)) return false;
  if (!silent) {
    const t = state.push('obs_tag', '', 0);
    t.content = tag;
  }
  state.pos = start + 1 + tag.length;
  return true;
}

function highlightRule(state, silent) {
  const src = state.src;
  const start = state.pos;
  const max = state.posMax;
  if (src.charCodeAt(start) !== 0x3d || src.charCodeAt(start + 1) !== 0x3d) return false;
  if (src.charCodeAt(start + 2) === 0x3d) return false;
  const first = src.charCodeAt(start + 2);
  if (isNaN(first) || first === 0x20 || first === 0x0a) return false;
  let end = src.indexOf('==', start + 2);
  while (end >= 0 && end < max && src.charCodeAt(end + 2) === 0x3d) end = src.indexOf('==', end + 1);
  if (end < 0 || end >= max) return false;
  if (/\s/.test(src[end - 1])) return false;
  if (silent) {
    state.pos = end + 2;
    return true;
  }
  state.push('mark_open', 'mark', 1);
  const oldMax = state.posMax;
  state.pos = start + 2;
  state.posMax = end;
  state.md.inline.tokenize(state);
  state.posMax = oldMax;
  state.push('mark_close', 'mark', -1);
  state.pos = end + 2;
  return true;
}

function inlineCommentRule(state, silent) {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x25 || src.charCodeAt(start + 1) !== 0x25) return false;
  const end = src.indexOf('%%', start + 2);
  if (end < 0 || end + 2 > state.posMax) {
    // Unclosed in this paragraph: Obsidian hides the rest.
    state.pos = state.posMax;
    return true;
  }
  // Comments produce no token. Drop one of two spaces around the comment.
  let next = end + 2;
  if (start > 0 && src[start - 1] === ' ' && src[next] === ' ') next++;
  state.pos = next;
  return true;
}

function blockCommentRule(state, startLine, endLine, silent) {
  const pos = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (state.src.slice(pos, pos + 2) !== '%%') return false;
  const first = state.src.slice(pos + 2, max);
  let next = startLine;
  let found = false;
  if (first.indexOf('%%') >= 0) {
    // "%% x %%" with text after it is inline, not a block.
    if (!/%%\s*$/.test(first)) return false;
    found = true;
  } else {
    for (next = startLine + 1; next < endLine; next++) {
      const p = state.bMarks[next] + state.tShift[next];
      const e = state.eMarks[next];
      if (state.src.slice(p, e).indexOf('%%') >= 0) {
        found = true;
        break;
      }
    }
  }
  if (silent) return true;
  state.line = found ? next + 1 : endLine;
  return true;
}

function obsidianPlugin(md) {
  md.inline.ruler.before('link', 'obs_wiki', wikiRule);
  md.inline.ruler.before('emphasis', 'obs_highlight', highlightRule);
  md.inline.ruler.before('text', 'obs_comment', inlineCommentRule);
  md.inline.ruler.push('obs_tag', tagRule);
  md.block.ruler.before('paragraph', 'obs_comment_block', blockCommentRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  // '#', '=' and '%' are already text terminators in markdown-it, so the
  // inline rules above get a chance to run at those characters.
}

module.exports = {
  obsidianPlugin,
  splitFrontMatter,
  parseYaml,
  parseLinkTarget,
  linkLabel,
};
