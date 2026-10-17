'use strict';
/**
 * Markdown -> simple document tree, with TeX math and Obsidian syntax
 * (properties, wikilinks, embeds, callouts, tags, highlights, comments,
 * block IDs, footnotes).
 *
 * Math syntax (the same as Obsidian, plus common LaTeX forms):
 *   inline   $...$        \(...\)
 *   display  $$...$$      \[...\]      ```math fences
 *            \begin{equation} ... \end{equation} (and align, gather, ...)
 *
 * The output tree is plain data so that the React Native view stays simple
 * and the parser can be tested in Node.
 */
const MarkdownIt = require('markdown-it');
const footnotePlugin = require('markdown-it-footnote');
const {obsidianPlugin, splitFrontMatter, parseYaml, linkLabel} = require('./obsidian');

const MATH_ENVS = [
  'equation', 'equation*', 'align', 'align*', 'alignat', 'alignat*', 'aligned',
  'gather', 'gather*', 'multline', 'multline*', 'flalign', 'flalign*', 'split',
  'eqnarray', 'eqnarray*', 'CD', 'cases', 'matrix', 'pmatrix', 'bmatrix', 'vmatrix',
];

function isSpace(code) {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

/* ------------------------------------------------------------------ */
/* markdown-it rules                                                   */
/* ------------------------------------------------------------------ */

function blockDelimited(open, close, tokenName) {
  return function mathBlock(state, startLine, endLine, silent) {
    let pos = state.bMarks[startLine] + state.tShift[startLine];
    let max = state.eMarks[startLine];
    if (state.sCount[startLine] - state.blkIndent >= 4) return false;
    if (state.src.slice(pos, pos + open.length) !== open) return false;
    pos += open.length;
    let first = state.src.slice(pos, max);
    let last = '';
    let nextLine = startLine;
    let found = false;

    const trimmed = first.trim();
    if (trimmed.length >= close.length && trimmed.endsWith(close)) {
      // Single line: $$ x $$
      first = trimmed.slice(0, trimmed.length - close.length);
      if (first.indexOf(close) >= 0) return false;
      found = true;
    } else if (first.indexOf(close) >= 0) {
      // "$$x$$ and more text" is inline display math inside a paragraph.
      return false;
    }

    if (!found) {
      for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
        pos = state.bMarks[nextLine] + state.tShift[nextLine];
        max = state.eMarks[nextLine];
        if (pos < max && state.sCount[nextLine] < state.blkIndent) break;
        const line = state.src.slice(pos, max).trim();
        if (line.endsWith(close)) {
          last = line.slice(0, line.length - close.length);
          found = true;
          break;
        }
      }
    }
    if (!found) return false;
    if (silent) return true;

    let content;
    if (nextLine === startLine) {
      content = first;
    } else {
      const middle = state.getLines(startLine + 1, nextLine, state.blkIndent, false);
      content = first + '\n' + middle + last;
    }
    const token = state.push(tokenName, 'math', 0);
    token.block = true;
    token.content = content.trim();
    token.markup = open;
    token.map = [startLine, nextLine + 1];
    state.line = nextLine + 1;
    return true;
  };
}

function envBlock(state, startLine, endLine, silent) {
  const pos = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const line = state.src.slice(pos, max);
  const m = /^\\begin\{([A-Za-z]+\*?)\}/.exec(line);
  if (!m || MATH_ENVS.indexOf(m[1]) < 0) return false;
  const endTag = '\\end{' + m[1] + '}';
  let nextLine = startLine;
  let found = line.indexOf(endTag) >= 0;
  if (!found) {
    for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
      const p = state.bMarks[nextLine] + state.tShift[nextLine];
      const e = state.eMarks[nextLine];
      if (state.src.slice(p, e).indexOf(endTag) >= 0) {
        found = true;
        break;
      }
    }
  }
  if (!found) return false;
  if (silent) return true;
  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content = state.getLines(startLine, nextLine + 1, state.blkIndent, false).trim();
  token.markup = 'env';
  token.map = [startLine, nextLine + 1];
  state.line = nextLine + 1;
  return true;
}

function inlineDollar(state, silent) {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x24 /* $ */) return false;

  // $$ ... $$ inside a paragraph: display math.
  if (src.charCodeAt(start + 1) === 0x24) {
    let end = start + 2;
    for (;;) {
      end = src.indexOf('$$', end);
      if (end < 0) return false;
      if (src.charCodeAt(end - 1) === 0x5c /* \ */) {
        end += 1;
        continue;
      }
      break;
    }
    const content = src.slice(start + 2, end);
    if (!content.trim()) return false;
    if (!silent) {
      const t = state.push('math_inline_display', 'math', 0);
      t.content = content.trim();
      t.markup = '$$';
    }
    state.pos = end + 2;
    return true;
  }

  const next = src.charCodeAt(start + 1);
  if (isNaN(next) || isSpace(next)) return false;
  let end = start + 1;
  for (;;) {
    end = src.indexOf('$', end);
    if (end < 0) return false;
    if (src.charCodeAt(end - 1) === 0x5c) {
      end += 1;
      continue;
    }
    break;
  }
  if (isSpace(src.charCodeAt(end - 1))) return false;
  const after = src.charCodeAt(end + 1);
  if (after >= 0x30 && after <= 0x39) return false; // "$5 and $10"
  const content = src.slice(start + 1, end);
  if (!content.trim()) return false;
  if (!silent) {
    const t = state.push('math_inline', 'math', 0);
    t.content = content;
    t.markup = '$';
  }
  state.pos = end + 1;
  return true;
}

function inlineParen(state, silent) {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x5c) return false;
  const kind = src.charCodeAt(start + 1);
  let close;
  let name;
  if (kind === 0x28 /* ( */) {
    close = '\\)';
    name = 'math_inline';
  } else if (kind === 0x5b /* [ */) {
    close = '\\]';
    name = 'math_inline_display';
  } else {
    return false;
  }
  const end = src.indexOf(close, start + 2);
  if (end < 0) return false;
  const content = src.slice(start + 2, end);
  if (!content.trim()) return false;
  if (!silent) {
    const t = state.push(name, 'math', 0);
    t.content = content.trim();
    t.markup = src.slice(start, start + 2);
  }
  state.pos = end + 2;
  return true;
}

function mathPlugin(md) {
  md.block.ruler.before('fence', 'math_block_dollar', blockDelimited('$$', '$$', 'math_block'), {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.block.ruler.before('fence', 'math_block_bracket', blockDelimited('\\[', '\\]', 'math_block'), {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.block.ruler.before('fence', 'math_block_env', envBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.inline.ruler.before('escape', 'math_inline_paren', inlineParen);
  md.inline.ruler.after('escape', 'math_inline_dollar', inlineDollar);
}

let mdSingleton = null;
function getMd() {
  if (!mdSingleton) {
    mdSingleton = new MarkdownIt('default', {html: false, linkify: true, typographer: false, breaks: false});
    mdSingleton.use(mathPlugin);
    mdSingleton.use(obsidianPlugin);
    mdSingleton.use(footnotePlugin);
  }
  return mdSingleton;
}

/* ------------------------------------------------------------------ */
/* Token stream -> tree                                                */
/* ------------------------------------------------------------------ */

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/** Turns a Markdown link or image href into an internal link target, or null. */
function internalTarget(href) {
  const h = String(href || '').trim();
  if (!h || SCHEME_RE.test(h) || h.startsWith('//')) return null;
  let decoded = h;
  try {
    decoded = decodeURI(h);
  } catch (e) {
    decoded = h;
  }
  const hash = decoded.indexOf('#');
  const page = (hash >= 0 ? decoded.slice(0, hash) : decoded).replace(/^\.\//, '');
  const sub = hash >= 0 ? decoded.slice(hash + 1) : null;
  return {page, sub: sub || null, alias: null};
}

/**
 * Inline runs:
 *   {type:'text', text, bold?, italic?, strike?, code?, mark?, href?, link?}
 *       href: external URL; link: internal target {page, sub, alias}
 *   {type:'math', tex, display?}
 *   {type:'tag', tag}
 *   {type:'fnref', n, label}
 *   {type:'embed', target, md?}      (split out into blocks by splitBlocks)
 *   {type:'break'}
 */
function inlineRuns(children) {
  const runs = [];
  const marks = {bold: 0, italic: 0, strike: 0, mark: 0};
  const links = [];
  const push = (text, extra) => {
    if (!text) return;
    const run = {type: 'text', text};
    if (marks.bold) run.bold = true;
    if (marks.italic) run.italic = true;
    if (marks.strike) run.strike = true;
    if (marks.mark) run.mark = true;
    const l = links[links.length - 1];
    if (l) {
      if (l.internal) run.link = l.internal;
      else if (l.href) run.href = l.href;
    }
    if (extra) Object.assign(run, extra);
    runs.push(run);
  };
  for (const t of children || []) {
    switch (t.type) {
      case 'text':
        push(t.content);
        break;
      case 'code_inline':
        push(t.content, {code: true});
        break;
      case 'softbreak':
        push(' ');
        break;
      case 'hardbreak':
        runs.push({type: 'break'});
        break;
      case 'strong_open':
        marks.bold++;
        break;
      case 'strong_close':
        marks.bold--;
        break;
      case 'em_open':
        marks.italic++;
        break;
      case 'em_close':
        marks.italic--;
        break;
      case 's_open':
        marks.strike++;
        break;
      case 's_close':
        marks.strike--;
        break;
      case 'mark_open':
        marks.mark++;
        break;
      case 'mark_close':
        marks.mark--;
        break;
      case 'link_open': {
        const href = t.attrGet('href') || '';
        links.push({href, internal: internalTarget(href)});
        break;
      }
      case 'link_close':
        links.pop();
        break;
      case 'obs_wikilink':
        push(linkLabel(t.meta), {link: t.meta});
        break;
      case 'obs_embed':
        runs.push({type: 'embed', target: t.meta});
        break;
      case 'obs_tag':
        runs.push({type: 'tag', tag: t.content});
        break;
      case 'footnote_ref':
        runs.push({type: 'fnref', n: t.meta.id + 1, label: t.meta.label || String(t.meta.id + 1)});
        break;
      case 'image': {
        const src = t.attrGet('src') || '';
        const alt = t.content || '';
        const target = internalTarget(src);
        if (target) {
          const bar = alt.lastIndexOf('|');
          const size = bar >= 0 ? alt.slice(bar + 1).trim() : '';
          runs.push({
            type: 'embed',
            md: true,
            target: {page: target.page, sub: null, alias: /^\d+(x\d+)?$/.test(size) ? size : alt || null},
          });
        } else {
          push('[image: ' + (alt || src) + ']', {italic: true, href: src});
        }
        break;
      }
      case 'math_inline':
        runs.push({type: 'math', tex: t.content});
        break;
      case 'math_inline_display':
        runs.push({type: 'math', tex: t.content, display: true});
        break;
      case 'html_inline':
        push(t.content, {code: true});
        break;
      default:
        if (t.content) push(t.content);
    }
  }
  // Merge adjacent text runs with the same marks and the same link.
  const merged = [];
  for (const r of runs) {
    const prev = merged[merged.length - 1];
    if (
      prev && prev.type === 'text' && r.type === 'text' &&
      !!prev.bold === !!r.bold && !!prev.italic === !!r.italic && !!prev.strike === !!r.strike &&
      !!prev.code === !!r.code && !!prev.mark === !!r.mark && prev.href === r.href && prev.link === r.link
    ) {
      prev.text += r.text;
    } else {
      merged.push(Object.assign({}, r));
    }
  }
  return merged;
}

/** Plain text of runs (for heading anchors and search). */
function plainText(runs) {
  return (runs || [])
    .map(r => (r.type === 'text' ? r.text : r.type === 'math' ? '$' + r.tex + '$' : r.type === 'tag' ? '#' + r.tag : ''))
    .join('')
    .trim();
}

const BLOCK_ID_RE = /(^|\s)\^([A-Za-z0-9-]+)\s*$/;

/** Removes a trailing Obsidian block ID ("text ^abc123") from runs. */
function takeBlockId(runs) {
  const last = runs[runs.length - 1];
  if (!last || last.type !== 'text' || last.code) return null;
  const m = BLOCK_ID_RE.exec(last.text);
  if (!m) return null;
  last.text = last.text.slice(0, m.index + m[1].length).replace(/\s+$/, '');
  if (!last.text) runs.pop();
  return m[2];
}

/** Splits a paragraph at display math and embeds, which are blocks of their own. */
function splitBlocks(runs, line) {
  const blocks = [];
  let cur = [];
  const flush = () => {
    if (hasContent(cur)) blocks.push({type: 'paragraph', runs: trimRuns(cur), line});
    cur = [];
  };
  for (const r of runs) {
    if (r.type === 'math' && r.display) {
      flush();
      blocks.push({type: 'math', tex: r.tex, line});
    } else if (r.type === 'embed') {
      flush();
      blocks.push({type: 'embed', target: r.target, md: !!r.md, line});
    } else {
      cur.push(r);
    }
  }
  flush();
  return blocks;
}

function hasContent(runs) {
  return runs.some(r => (r.type === 'text' ? !!r.text.trim() : r.type !== 'break'));
}

function trimRuns(runs) {
  const out = runs.map(r => Object.assign({}, r));
  while (out.length && out[0].type === 'text' && !out[0].text.trim()) out.shift();
  while (out.length && out[out.length - 1].type === 'break') out.pop();
  while (out.length && out[out.length - 1].type === 'text' && !out[out.length - 1].text.trim()) out.pop();
  if (out.length && out[0].type === 'text') out[0].text = out[0].text.replace(/^\s+/, '');
  const last = out[out.length - 1];
  if (last && last.type === 'text') last.text = last.text.replace(/\s+$/, '');
  return out;
}

const CALLOUT_RE = /^\[!([^\]\s]+)\]([+-]?)[ \t]*/;

/** Removes the first n characters of leading text tokens. */
function stripLeading(tokens, n) {
  let left = n;
  for (const tk of tokens) {
    if (left <= 0) break;
    if (tk.type !== 'text') break;
    if (tk.content.length <= left) {
      left -= tk.content.length;
      tk.content = '';
    } else {
      tk.content = tk.content.slice(left);
      left = 0;
    }
  }
}

function buildTree(tokens) {
  let i = 0;

  function parseBlocks(stopType) {
    const blocks = [];
    while (i < tokens.length) {
      const t = tokens[i];
      if (stopType && t.type === stopType) {
        i++;
        return blocks;
      }
      const line = t.map ? t.map[0] : undefined;
      switch (t.type) {
        case 'heading_open': {
          const level = parseInt(t.tag.slice(1), 10);
          const inline = tokens[i + 1];
          const runs = inlineRuns(inline.children);
          const id = takeBlockId(runs);
          const h = {type: 'heading', level, runs, anchor: plainText(runs), line};
          if (id) h.id = id;
          blocks.push(h);
          i += 3;
          break;
        }
        case 'paragraph_open': {
          const inline = tokens[i + 1];
          const runs = inlineRuns(inline.children);
          const id = takeBlockId(runs);
          const parts = splitBlocks(runs, line);
          if (id) {
            // "^id" alone on a line names the block before it.
            const target = parts.length ? parts[parts.length - 1] : blocks[blocks.length - 1];
            if (target) target.id = id;
          }
          for (const b of parts) blocks.push(b);
          i += 3;
          break;
        }
        case 'math_block':
          blocks.push({type: 'math', tex: t.content, line});
          i++;
          break;
        case 'fence': {
          const lang = (t.info || '').trim().split(/\s+/)[0].toLowerCase();
          if (lang === 'math' || lang === 'latex' || lang === 'tex') {
            blocks.push({type: 'math', tex: t.content.trim(), line});
          } else {
            blocks.push({type: 'code', lang, text: t.content.replace(/\n$/, ''), line});
          }
          i++;
          break;
        }
        case 'code_block':
          blocks.push({type: 'code', lang: '', text: t.content.replace(/\n$/, ''), line});
          i++;
          break;
        case 'hr':
          blocks.push({type: 'hr', line});
          i++;
          break;
        case 'html_block':
          blocks.push({type: 'code', lang: 'html', text: t.content.replace(/\n$/, ''), line});
          i++;
          break;
        case 'blockquote_open': {
          i++;
          let callout = null;
          const p = tokens[i];
          const inl = tokens[i + 1];
          if (p && p.type === 'paragraph_open' && inl && inl.type === 'inline') {
            const m = CALLOUT_RE.exec(inl.content);
            if (m) {
              const kids = inl.children || [];
              const br = kids.findIndex(k => k.type === 'softbreak' || k.type === 'hardbreak');
              const head = br < 0 ? kids : kids.slice(0, br);
              const body = br < 0 ? [] : kids.slice(br + 1);
              stripLeading(head, m[0].length);
              const titleRuns = trimRuns(inlineRuns(head));
              const bodyRuns = inlineRuns(body);
              const id = takeBlockId(bodyRuns.length ? bodyRuns : titleRuns);
              callout = {
                kind: m[1].toLowerCase(),
                fold: m[2] || '',
                title: hasContent(titleRuns) ? titleRuns : null,
                first: splitBlocks(bodyRuns, p.map ? p.map[0] : line),
                id,
              };
              i += 3; // paragraph_open, inline, paragraph_close
              while (tokens[i] && tokens[i].type === 'footnote_anchor') i++;
              if (tokens[i] && tokens[i].type === 'paragraph_close') i++;
            }
          }
          const children = parseBlocks('blockquote_close');
          if (callout) {
            const c = {type: 'callout', kind: callout.kind, fold: callout.fold, title: callout.title, children: callout.first.concat(children), line};
            if (callout.id) c.id = callout.id;
            blocks.push(c);
          } else {
            blocks.push({type: 'quote', children, line});
          }
          break;
        }
        case 'bullet_list_open':
        case 'ordered_list_open': {
          const ordered = t.type === 'ordered_list_open';
          const start = ordered ? parseInt(t.attrGet('start') || '1', 10) : 1;
          const close = ordered ? 'ordered_list_close' : 'bullet_list_close';
          i++;
          const items = [];
          while (i < tokens.length && tokens[i].type !== close) {
            if (tokens[i].type === 'list_item_open') {
              const itemLine = tokens[i].map ? tokens[i].map[0] : undefined;
              i++;
              const children = parseBlocks('list_item_close');
              items.push(taskItem({children, line: itemLine}));
            } else {
              i++;
            }
          }
          i++;
          blocks.push({type: 'list', ordered, start, items, line});
          break;
        }
        case 'table_open': {
          i++;
          const header = [];
          const rows = [];
          const align = [];
          let inHead = false;
          let row = null;
          while (i < tokens.length && tokens[i].type !== 'table_close') {
            const tt = tokens[i];
            if (tt.type === 'thead_open') inHead = true;
            else if (tt.type === 'thead_close') inHead = false;
            else if (tt.type === 'tr_open') row = [];
            else if (tt.type === 'tr_close') {
              if (inHead) header.push(...row);
              else rows.push(row);
              row = null;
            } else if (tt.type === 'th_open' || tt.type === 'td_open') {
              const style = tt.attrGet('style') || '';
              const m = /text-align:\s*(left|right|center)/.exec(style);
              if (inHead) align.push(m ? m[1] : 'left');
              const inline = tokens[i + 1];
              row.push(inlineRuns(inline && inline.type === 'inline' ? inline.children : []).filter(r => r.type !== 'embed'));
            }
            i++;
          }
          i++;
          blocks.push({type: 'table', header, rows, align, line});
          break;
        }
        case 'footnote_block_open': {
          i++;
          const items = [];
          while (i < tokens.length && tokens[i].type !== 'footnote_block_close') {
            const ft = tokens[i];
            if (ft.type === 'footnote_open') {
              const n = ft.meta.id + 1;
              const label = ft.meta.label || String(n);
              i++;
              const children = parseBlocks('footnote_close');
              items.push({n, label, children});
            } else {
              i++;
            }
          }
          i++;
          if (items.length) blocks.push({type: 'footnotes', items});
          break;
        }
        default:
          i++;
      }
    }
    return blocks;
  }

  return parseBlocks(null);
}

/** Detects "[ ] " / "[x] " (any one character) at the start of a list item. */
function taskItem(item) {
  const first = item.children[0];
  if (first && first.type === 'paragraph' && first.runs.length && first.runs[0].type === 'text') {
    const m = /^\[(.)\]\s+/.exec(first.runs[0].text);
    if (m) {
      item.task = m[1] !== ' ';
      item.taskChar = m[1];
      first.runs = first.runs.map(r => Object.assign({}, r));
      first.runs[0].text = first.runs[0].text.slice(m[0].length);
      if (!first.runs[0].text) first.runs.shift();
    }
  }
  return item;
}

/**
 * Parses Markdown source (with Obsidian extensions).
 * @param {string} src
 * @returns {object[]} blocks
 */
function parseMarkdown(src) {
  const md = getMd();
  const fm = splitFrontMatter(src);
  const tokens = md.parse(fm.body, {});
  const blocks = buildTree(tokens);
  if (fm.yaml !== null) {
    const props = parseYaml(fm.yaml);
    if (props.length) blocks.unshift({type: 'properties', props, line: 0});
  }
  return blocks;
}

/** Calls fn(runs) for every run list in a block tree. */
function eachRuns(blocks, fn) {
  for (const b of blocks || []) {
    if (b.runs) fn(b.runs);
    if (b.title) fn(b.title);
    if (b.children) eachRuns(b.children, fn);
    if (b.items) for (const it of b.items) eachRuns(it.children, fn);
    if (b.type === 'table') {
      for (const cell of b.header) fn(cell);
      for (const row of b.rows) for (const cell of row) fn(cell);
    }
  }
}

/** Collects every math expression in document order (for prefetch and \newcommand). */
function collectMath(blocks, out) {
  out = out || [];
  const walk = list => {
    for (const b of list || []) {
      if (b.type === 'math') out.push({tex: b.tex, display: true});
      if (b.title) for (const r of b.title) if (r.type === 'math') out.push({tex: r.tex, display: !!r.display});
      if (b.runs) for (const r of b.runs) if (r.type === 'math') out.push({tex: r.tex, display: !!r.display});
      if (b.children) walk(b.children);
      if (b.items) for (const it of b.items) walk(it.children);
      if (b.type === 'table') {
        for (const cell of b.header) for (const r of cell) if (r.type === 'math') out.push({tex: r.tex, display: false});
        for (const row of b.rows) for (const cell of row) for (const r of cell) if (r.type === 'math') out.push({tex: r.tex, display: false});
      }
    }
  };
  walk(blocks);
  return out;
}

/** All embed blocks in the tree (for loading embedded notes and images). */
function collectEmbeds(blocks, out) {
  out = out || [];
  for (const b of blocks || []) {
    if (b.type === 'embed') out.push(b);
    if (b.children) collectEmbeds(b.children, out);
    if (b.items) for (const it of b.items) collectEmbeds(it.children, out);
  }
  return out;
}

/** All internal links and tags (for backlinks and the tag list later). */
function collectLinks(blocks) {
  const links = [];
  const tags = [];
  eachRuns(blocks, runs => {
    for (const r of runs) {
      if (r.type === 'text' && r.link) links.push(r.link);
      if (r.type === 'tag') tags.push(r.tag);
    }
  });
  for (const e of collectEmbeds(blocks)) links.push(e.target);
  for (const b of blocks || []) {
    if (b.type === 'properties') {
      for (const p of b.props) {
        if (p.key === 'tags' || p.key === 'tag') {
          const v = Array.isArray(p.value) ? p.value : String(p.value).split(/[,\s]+/);
          for (const t of v) if (t) tags.push(t.replace(/^#/, ''));
        }
      }
    }
  }
  return {links, tags};
}

/** Normalizes heading text the way Obsidian compares link subpaths. */
function normAnchor(s) {
  return String(s || '')
    .replace(/[#^|[\]:\\*`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Finds the index of a top-level heading by its text. */
function findHeading(blocks, text) {
  const want = normAnchor(text);
  return (blocks || []).findIndex(b => b.type === 'heading' && normAnchor(b.anchor) === want);
}

function findBlockId(blocks, id) {
  for (const b of blocks || []) {
    if (b.id === id) return b;
    if (b.children) {
      const f = findBlockId(b.children, id);
      if (f) return f;
    }
    if (b.items) {
      for (const it of b.items) {
        if (it.children[0] && it.children[0].id === id) return {type: 'list', ordered: false, start: 1, items: [it]};
        const f = findBlockId(it.children, id);
        if (f) return f;
      }
    }
  }
  return null;
}

/**
 * The blocks a subpath points to: "Heading", "H1#H2" (the last part is
 * used) or "^blockid". Returns null if it does not exist.
 */
function extractSection(blocks, sub) {
  if (!sub) return blocks;
  if (sub.startsWith('^')) {
    const b = findBlockId(blocks, sub.slice(1));
    return b ? [b] : null;
  }
  const parts = sub.split('#').filter(Boolean);
  const idx = findHeading(blocks, parts[parts.length - 1]);
  if (idx < 0) return null;
  const level = blocks[idx].level;
  let end = idx + 1;
  while (end < blocks.length && !(blocks[end].type === 'heading' && blocks[end].level <= level)) end++;
  return blocks.slice(idx, end);
}

const DEF_RE = /\\(?:newcommand|renewcommand|providecommand|def|let|DeclareMathOperator|newenvironment|renewenvironment)\b/;

/** True when the TeX defines macros (these must be rendered in order). */
function definesMacros(tex) {
  return DEF_RE.test(tex);
}

/**
 * Finds the math expression at a character offset in the source. Used for
 * "insert the formula under the cursor into the note".
 * @returns {{tex:string, display:boolean, start:number, end:number}|null}
 */
function mathAtOffset(src, offset) {
  const patterns = [
    {re: /\$\$([\s\S]+?)\$\$/g, display: true},
    {re: /\\\[([\s\S]+?)\\\]/g, display: true},
    {re: /```(?:math|latex|tex)[^\n]*\n([\s\S]*?)```/g, display: true},
    {re: /\\begin\{([A-Za-z]+\*?)\}[\s\S]*?\\end\{\1\}/g, display: true, whole: true},
    {re: /\\\(([\s\S]+?)\\\)/g, display: false},
    {re: /(^|[^\\$])\$([^\s$](?:[^$\n]|\\\$)*?[^\s\\$]|[^\s$])\$(?!\d)/g, display: false, lead: true},
  ];
  for (const p of patterns) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(src)) !== null) {
      let start = m.index;
      const end = m.index + m[0].length;
      let tex;
      if (p.whole) tex = m[0];
      else if (p.lead) {
        start += m[1].length;
        tex = m[2];
      } else tex = m[1];
      if (offset >= start && offset <= end) {
        return {tex: tex.trim(), display: p.display, start, end};
      }
      if (m[0].length === 0) p.re.lastIndex++;
    }
  }
  return null;
}

/** Strips $ delimiters if the user selected a whole formula with them. */
function stripDelimiters(text) {
  let t = String(text || '').trim();
  const pairs = [['$$', '$$'], ['\\[', '\\]'], ['\\(', '\\)'], ['$', '$']];
  for (const [a, b] of pairs) {
    if (t.length > a.length + b.length && t.startsWith(a) && t.endsWith(b)) {
      return t.slice(a.length, t.length - b.length).trim();
    }
  }
  const fence = /^```(?:math|latex|tex)?[^\n]*\n([\s\S]*?)\n?```$/.exec(t);
  if (fence) return fence[1].trim();
  return t;
}

module.exports = {
  parseMarkdown,
  collectMath,
  collectEmbeds,
  collectLinks,
  extractSection,
  findHeading,
  normAnchor,
  plainText,
  definesMacros,
  mathAtOffset,
  stripDelimiters,
  MATH_ENVS,
};
