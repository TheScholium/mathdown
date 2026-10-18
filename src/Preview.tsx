/**
 * Rendered view of a Markdown document with TeX math and Obsidian syntax,
 * typeset in the Istari style (https://github.com/TheScholium/istari).
 *
 * Math images come from the JS engine (MathJax -> rasterizer -> PNG data
 * URI). They are made a few at a time after the text is on screen, so long
 * notes stay responsive; the cache makes re-renders after an edit cheap.
 * A black formula is an alpha mask, drawn in the color of its text with
 * tintColor, as Istari does with MathJax (section 4).
 *
 * Inline math sits on the text baseline: a paragraph with inline math (or
 * tags, which need a border) is laid out as a wrapping row of words, all
 * bottom-aligned, and each image is moved down by (its depth - the text
 * descent).
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Image, PixelRatio, Pressable, ScrollView, Text, TextStyle, View} from 'react-native';
import type {Block, LinkTarget, MathSession, PreviewImage, Run} from '../engine';
import {collectEmbeds, collectMath, findHeading, normAnchor} from '../engine';
import {DATA_FIGURES, PROSE_FIGURES, SMALL_CAPS, Theme, rgba, track, useTheme} from './theme';
import {Icon} from './ui';
import type {IconName} from './icons';
import {EmbedResult, fileUri, loadEmbed, resolve, useVaultVersion} from './vault';

export type PreviewActions = {
  onLink?: (target: LinkTarget, fromPath: string | null) => void;
  onExternal?: (href: string) => void;
  onTag?: (tag: string) => void;
  onToggleTask?: (line: number, ch: string) => void;
};

type FootItem = {n: number; label: string; children: Block[]};

type Ctx = {
  t: Theme;
  images: Map<string, PreviewImage>;
  embeds: Map<string, EmbedResult>;
  fontSize: number; // body size: math images are made for it
  size: number; // current text size (smaller in quotes, sidenotes, footnotes)
  lf: number; // current line-height factor
  base: TextStyle; // inherited text style: family, color, italics, figures
  ratio: number;
  descentRatio: number; // (baseline to line bottom) / fontSize at the body line height
  width: number;
  notePath: string | null;
  embedDepth: number;
  readOnly: boolean; // inside an embedded note: no task toggles
  actions: PreviewActions;
  vaultVersion: number;
  notes: Map<number, FootItem>; // footnotes of the note being drawn
  sidenotes: boolean;
  openNotes: Set<string>;
  toggleNote: (k: string) => void;
  onFootnote: (n: number) => void;
};

/** Istari mobile: 1.6 line height (section 11c). */
const LINE = 1.6;
const MAX_EMBED_DEPTH = 2;
const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

function key(tex: string, display: boolean): string {
  return (display ? 'D|' : 'I|') + tex;
}

function embedKey(fromPath: string | null, t: LinkTarget): string {
  return (fromPath || '') + '|' + t.page + '|' + (t.sub || '');
}

function sup(n: number): string {
  return String(n)
    .split('')
    .map(d => SUP[+d] || d)
    .join('');
}

/** Baseline to the bottom of a line box, for text of this size and line height. */
function descentOf(ctx: Ctx, size: number, lf: number): number {
  return size * (ctx.descentRatio + (lf - LINE) / 2);
}

function noteKey(ctx: Ctx, n: number): string {
  return (ctx.notePath || '') + '#' + n;
}

/** A footnote that begins with "? " is a query (Istari section 10e). */
function isQuery(item: FootItem | undefined): boolean {
  const b = item && item.children[0];
  if (!b || b.type !== 'paragraph') return false;
  const r = b.runs[0];
  return !!r && r.type === 'text' && /^\?\s/.test(r.text);
}

function withoutQueryMark(blocks: Block[]): Block[] {
  const b = blocks[0];
  if (!b || b.type !== 'paragraph') return blocks;
  const r = b.runs[0];
  if (!r || r.type !== 'text') return blocks;
  const first = {...r, text: r.text.replace(/^\?\s+/, '')};
  return [{...b, runs: [first, ...b.runs.slice(1)]}, ...blocks.slice(1)];
}

/* ------------------------------------------------------------------ */
/* Inline content                                                      */
/* ------------------------------------------------------------------ */

type Seg = {text: string; style: TextStyle; onPress?: () => void; tag?: boolean};

/** Text, link, tag and footnote runs as styled text segments. */
function segOf(r: Run, ctx: Ctx, size: number, base: TextStyle): Seg | null {
  const {p, f} = ctx.t;
  const caps = Array.isArray(base.fontVariant) && base.fontVariant.includes('small-caps');
  if (r.type === 'tag') {
    const ts = Math.round(size * 0.9 * 10) / 10;
    return {
      text: '#' + r.tag,
      tag: true,
      style: {
        fontSize: ts,
        fontVariant: SMALL_CAPS,
        letterSpacing: track(ts, 0.05),
        color: p.gold,
        fontStyle: 'normal',
        fontWeight: 'normal',
        textTransform: 'none',
      },
      onPress: ctx.actions.onTag ? () => ctx.actions.onTag!(r.tag) : undefined,
    };
  }
  if (r.type === 'fnref') {
    const query = isQuery(ctx.notes.get(r.n));
    const k = noteKey(ctx, r.n);
    return {
      text: ' ' + sup(r.n) + ' ',
      style: {
        color: query ? p.verdigris : p.gold,
        fontStyle: 'normal',
        fontWeight: 'normal',
        fontVariant: ['lining-nums'],
        letterSpacing: 0,
        textTransform: 'none',
        textDecorationLine: 'none',
        backgroundColor: undefined,
      },
      onPress: ctx.sidenotes && ctx.notes.has(r.n) ? () => ctx.toggleNote(k) : () => ctx.onFootnote(r.n),
    };
  }
  if (r.type !== 'text') return null;
  const s: TextStyle = {};
  if (r.bold) {
    // Istari: bold is small caps in gold-dim, modest weight, capitalized.
    s.fontWeight = '700';
    s.fontVariant = ['small-caps', ...((base.fontVariant as any[]) || []).filter(v => v !== 'small-caps')] as any;
    if (!caps) s.letterSpacing = track(size, 0.055);
    s.textTransform = 'capitalize';
    s.color = p.goldDim;
  }
  if (r.italic) s.fontStyle = 'italic';
  if (r.strike) s.textDecorationLine = 'line-through';
  if (r.mark) {
    s.color = p.goldDim;
    s.backgroundColor = p.highlight;
  }
  if (r.code) {
    s.fontFamily = f.mono;
    s.fontSize = Math.round(size * 0.82 * 10) / 10;
    s.backgroundColor = p.bg3;
    s.color = p.code;
    s.fontWeight = 'normal';
    s.fontStyle = 'normal';
    s.fontVariant = [];
    s.letterSpacing = 0;
    s.textTransform = 'none';
  }
  let onPress: (() => void) | undefined;
  const linkStyle = (found: boolean) => {
    s.textDecorationLine = r.strike ? 'underline line-through' : 'underline';
    s.fontVariant = ['small-caps', ...((base.fontVariant as any[]) || []).filter(v => v !== 'small-caps')] as any;
    if (!caps) s.letterSpacing = track(size, 0.04);
    s.textTransform = r.bold ? 'capitalize' : 'none';
    s.color = found ? p.link : p.muted;
    if (!found) s.textDecorationStyle = 'dashed';
  };
  if (r.link) {
    const link = r.link;
    linkStyle(!link.page || !!resolve(link, ctx.notePath));
    if (ctx.actions.onLink) onPress = () => ctx.actions.onLink!(link, ctx.notePath);
  } else if (r.href) {
    const href = r.href;
    linkStyle(true);
    if (ctx.actions.onExternal) onPress = () => ctx.actions.onExternal!(href);
  }
  return {text: r.text, style: s, onPress};
}

type Item =
  | {kind: 'word'; pieces: Seg[]; spaceAfter: boolean}
  | {kind: 'tag'; seg: Seg; spaceAfter: boolean}
  | {kind: 'math'; tex: string; spaceAfter: boolean}
  | {kind: 'break'};

/** Splits runs into words, tags and formulas for the wrapping-row layout. */
function toItems(runs: Run[], ctx: Ctx, size: number, base: TextStyle): Item[] {
  const items: Item[] = [];
  let word: Seg[] = [];
  const endWord = (space: boolean) => {
    if (word.length) {
      items.push({kind: 'word', pieces: word, spaceAfter: space});
      word = [];
    } else if (space && items.length) {
      const last = items[items.length - 1];
      if (last.kind !== 'break') last.spaceAfter = true;
    }
  };
  for (const r of runs) {
    if (r.type === 'break') {
      endWord(false);
      items.push({kind: 'break'});
    } else if (r.type === 'math') {
      endWord(false);
      items.push({kind: 'math', tex: r.tex, spaceAfter: false});
    } else {
      const seg = segOf(r, ctx, size, base);
      if (!seg) continue;
      if (seg.tag) {
        endWord(false);
        items.push({kind: 'tag', seg, spaceAfter: false});
        continue;
      }
      const parts = seg.text.split(/(\s+)/);
      for (const part of parts) {
        if (!part) continue;
        if (/^\s+$/.test(part) && !/^ $/.test(part)) endWord(true);
        else word.push({...seg, text: part});
      }
    }
  }
  endWord(false);
  return items;
}

function MathImage(props: {img: PreviewImage; w: number; h: number; color: string}) {
  const {img} = props;
  return (
    <Image
      source={{uri: img.uri}}
      style={[{width: props.w, height: props.h}, img.tint ? {tintColor: props.color} : {borderRadius: 2}]}
      fadeDuration={0}
      resizeMode="stretch"
    />
  );
}

function InlineMath(props: {tex: string; ctx: Ctx; base: TextStyle; scale: number; q: number}) {
  const {ctx, tex} = props;
  const {p, f} = ctx.t;
  const img = ctx.images.get(key(tex, false));
  if (!img) {
    return <Text style={[props.base, {color: p.faint, fontFamily: f.mono, fontSize: (props.base.fontSize || 16) * 0.82}]}>{'$' + tex + '$'}</Text>;
  }
  if (!img.ok || !img.uri) {
    return (
      <Text style={[props.base, {fontFamily: f.mono, color: p.warn, textDecorationLine: 'underline', textDecorationStyle: 'dotted'}]}>
        {'$' + tex + '$ (!)'}
      </Text>
    );
  }
  const w = (img.width / ctx.ratio) * props.scale;
  const h = (img.height / ctx.ratio) * props.scale;
  const depth = ((img.height - img.ascent) / ctx.ratio) * props.scale;
  return (
    <View style={{marginBottom: props.q - depth}}>
      <MathImage img={img} w={w} h={h} color={(props.base.color as string) || p.text} />
    </View>
  );
}

/** Text with optional inline math, links, tags and footnote marks; open sidenotes follow. */
function Runs(props: {runs: Run[]; ctx: Ctx; size?: number; lf?: number; style?: TextStyle; lead?: Seg}) {
  const {runs, ctx} = props;
  const size = props.size || ctx.size;
  const lf = props.lf || ctx.lf;
  const base: TextStyle = {...ctx.base, fontSize: size, lineHeight: Math.round(size * lf), ...(props.style || {})};
  const needsRow = runs.some(r => r.type === 'math' || r.type === 'tag');
  let body: React.ReactNode;
  if (!needsRow) {
    body = (
      <Text style={base} selectable={false}>
        {props.lead ? <Text style={props.lead.style}>{props.lead.text}</Text> : null}
        {runs.map((r, i) => {
          if (r.type === 'break') return '\n';
          const seg = segOf(r, ctx, size, base);
          if (!seg) return null;
          return (
            <Text key={i} style={seg.style} onPress={seg.onPress} suppressHighlighting>
              {seg.text}
            </Text>
          );
        })}
      </Text>
    );
  } else {
    const scale = size / ctx.fontSize;
    const q = descentOf(ctx, size, lf);
    const space = size * 0.26;
    const items = toItems(runs, ctx, size, base);
    if (props.lead) items.unshift({kind: 'word', pieces: [props.lead], spaceAfter: false});
    // Extra row gap when formulas reach below the text line.
    let gap = 0;
    for (const it of items) {
      if (it.kind !== 'math') continue;
      const img = ctx.images.get(key(it.tex, false));
      if (img && img.ok) {
        const depth = ((img.height - img.ascent) / ctx.ratio) * scale;
        gap = Math.max(gap, depth - q);
      }
    }
    const rows: Item[][] = [[]];
    for (const it of items) {
      if (it.kind === 'break') rows.push([]);
      else rows[rows.length - 1].push(it);
    }
    const {p} = ctx.t;
    body = (
      <View>
        {rows.map((row, ri) => (
          <View key={ri} style={{flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', rowGap: Math.ceil(gap)}}>
            {row.map((it, i) => {
              // A highlight or link that spans words keeps its style across the space.
              const nextIt = row[i + 1];
              const last = it.kind === 'word' ? it.pieces[it.pieces.length - 1] : null;
              const first = nextIt && nextIt.kind === 'word' ? nextIt.pieces[0] : null;
              const joined =
                it.kind === 'word' &&
                it.spaceAfter &&
                !!last &&
                !!first &&
                ((!!last.onPress && last.onPress === first.onPress) ||
                  (!!last.style.backgroundColor && last.style.backgroundColor === first.style.backgroundColor));
              const mr = it.kind !== 'break' && it.spaceAfter && !joined ? space : 0;
              if (it.kind === 'math') {
                return (
                  <View key={i} style={{marginRight: mr}}>
                    <InlineMath tex={it.tex} ctx={ctx} base={base} scale={scale} q={q} />
                  </View>
                );
              }
              if (it.kind === 'tag') {
                // Istari: a quiet small-caps label in a hairline gold border.
                const ts = (it.seg.style.fontSize as number) || size;
                const lh = Math.round(ts * 1.3);
                const qt = (lh - ts * 1.305) / 2 + ts * 0.298;
                return (
                  <View
                    key={i}
                    style={{
                      marginRight: mr,
                      marginBottom: Math.max(0, q - qt - 1),
                      borderWidth: 1,
                      borderColor: rgba(p.goldRgb, p.dark ? 0.3 : 0.55),
                      borderRadius: 2,
                      paddingHorizontal: ts * 0.45,
                    }}>
                    <Text style={[base, it.seg.style, {lineHeight: lh}]} onPress={it.seg.onPress} suppressHighlighting>
                      {it.seg.text}
                    </Text>
                  </View>
                );
              }
              if (it.kind === 'word') {
                return (
                  <Text key={i} style={[base, {marginRight: mr}]}>
                    {it.pieces.map((pc, j) => (
                      <Text key={j} style={pc.style} onPress={pc.onPress} suppressHighlighting>
                        {pc.text}
                        {joined && j === it.pieces.length - 1 ? ' ' : ''}
                      </Text>
                    ))}
                  </Text>
                );
              }
              return null;
            })}
            {row.length === 0 ? <Text style={base}> </Text> : null}
          </View>
        ))}
      </View>
    );
  }
  // Sidenotes opened from this text sit beneath it (Istari in-place mode).
  const open = ctx.sidenotes
    ? runs.filter(r => r.type === 'fnref' && ctx.openNotes.has(noteKey(ctx, (r as {n: number}).n)))
    : [];
  if (!open.length) return <>{body}</>;
  const seen = new Set<number>();
  return (
    <View>
      {body}
      {open.map(r => {
        const n = (r as {n: number}).n;
        if (seen.has(n)) return null;
        seen.add(n);
        return <Sidenote key={n} n={n} ctx={ctx} />;
      })}
    </View>
  );
}

function Sidenote(props: {n: number; ctx: Ctx}) {
  const {ctx, n} = props;
  const {p, f} = ctx.t;
  const item = ctx.notes.get(n);
  if (!item) return null;
  const query = isQuery(item);
  const size = Math.round(ctx.fontSize * 0.8 * 10) / 10;
  // The note's type is reset: never the italics of a theorem or the caps of a heading.
  const inner: Ctx = {
    ...ctx,
    size,
    lf: 1.45,
    base: {fontFamily: f.serif, color: p.muted, fontVariant: PROSE_FIGURES},
  };
  const blocks = query ? withoutQueryMark(item.children) : item.children;
  const first = blocks[0] && blocks[0].type === 'paragraph' ? blocks[0] : null;
  const lead: Seg | undefined = query
    ? {text: 'Query.\u00A0', style: {color: p.verdigris, fontVariant: SMALL_CAPS, letterSpacing: track(size, 0.05)}}
    : undefined;
  return (
    <View
      style={{
        marginTop: size * 0.35,
        marginBottom: size * 0.6,
        marginLeft: ctx.fontSize * 1.2,
        paddingLeft: size * 0.8,
        borderLeftWidth: 1,
        borderColor: query ? p.verdigris : p.goldDim,
      }}>
      <View style={{flexDirection: 'row', alignItems: 'flex-start'}}>
        <Text
          style={{
            fontFamily: f.serif,
            fontSize: size * 0.85,
            lineHeight: Math.round(size * 1.45),
            color: query ? p.verdigris : p.gold,
            fontVariant: ['lining-nums'],
            marginRight: size * 0.4,
          }}>
          {n}
        </Text>
        <View style={{flex: 1}}>
          {first ? <Runs runs={first.runs} ctx={inner} lead={lead} /> : null}
          {blocks.slice(first ? 1 : 0).map((b, i) => (
            <BlockView key={i} block={b} ctx={inner} depth={1} tight />
          ))}
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Blocks                                                              */
/* ------------------------------------------------------------------ */

function DisplayMath(props: {tex: string; ctx: Ctx}) {
  const {ctx, tex} = props;
  const {p, f} = ctx.t;
  const img = ctx.images.get(key(tex, true));
  const F = ctx.size;
  if (!img) {
    return (
      <View style={{alignItems: 'center', paddingVertical: 8}}>
        <Text style={{fontFamily: f.mono, color: p.faint, fontSize: 14}}>{tex}</Text>
      </View>
    );
  }
  if (!img.ok || !img.uri) {
    return (
      <View style={{borderWidth: 1, borderStyle: 'dashed', borderColor: p.warn, padding: 8, marginVertical: 6}}>
        <Text style={{fontFamily: f.serif, fontSize: F * 0.85, color: p.warn, fontVariant: SMALL_CAPS, letterSpacing: track(F * 0.85, 0.05), marginBottom: 4}}>
          TeX error: {img.error}
        </Text>
        <Text style={{fontFamily: f.mono, color: p.muted, fontSize: 14}}>{tex}</Text>
      </View>
    );
  }
  const scale = ctx.size / ctx.fontSize;
  const w = (img.width / ctx.ratio) * scale;
  const h = (img.height / ctx.ratio) * scale;
  const inner = <MathImage img={img} w={w} h={h} color={(ctx.base.color as string) || p.text} />;
  return (
    <View style={{marginVertical: F * 0.5}}>
      {w > ctx.width ? (
        <ScrollView horizontal showsHorizontalScrollIndicator overScrollMode="never">
          {inner}
        </ScrollView>
      ) : (
        <View style={{alignItems: 'center'}}>{inner}</View>
      )}
      {img.unsupportedText ? (
        <Text style={{fontFamily: f.serif, fontStyle: 'italic', fontSize: 13, color: p.faint, textAlign: 'center'}}>
          Some characters have no glyph in the math font.
        </Text>
      ) : null}
    </View>
  );
}

/* ---------- callouts (Istari section 5) ---------- */

/** Istari's mathematical vocabulary: [type, label, icon, statement of a result]. */
const MATH_CALLOUTS: {[k: string]: [string, IconName, boolean]} = {
  theorem: ['Theorem', 'lucide-scroll-text', true],
  thm: ['Theorem', 'lucide-scroll-text', true],
  definition: ['Definition', 'lucide-book-open', false],
  def: ['Definition', 'lucide-book-open', false],
  lemma: ['Lemma', 'lucide-feather', true],
  proposition: ['Proposition', 'lucide-feather', true],
  corollary: ['Corollary', 'lucide-feather', true],
  proof: ['Proof', 'lucide-pen-tool', false],
  example: ['Example', 'lucide-flask-conical', false],
  remark: ['Remark', 'lucide-quote', false],
  axiom: ['Axiom', 'lucide-anchor', true],
  conjecture: ['Conjecture', 'lucide-sparkles', true],
  intuition: ['Intuition', 'lucide-eye', false],
  exercise: ['Exercise', 'lucide-target', false],
};

/** Obsidian's own callout types and aliases, with their Lucide icons. */
const OBSIDIAN_CALLOUTS: {[k: string]: [string, IconName]} = {
  note: ['Note', 'lucide-pencil'],
  abstract: ['Abstract', 'lucide-clipboard-list'],
  summary: ['Summary', 'lucide-clipboard-list'],
  tldr: ['TL;DR', 'lucide-clipboard-list'],
  info: ['Info', 'lucide-info'],
  todo: ['Todo', 'lucide-circle-check'],
  tip: ['Tip', 'lucide-flame'],
  hint: ['Hint', 'lucide-flame'],
  important: ['Important', 'lucide-flame'],
  success: ['Success', 'lucide-check'],
  check: ['Check', 'lucide-check'],
  done: ['Done', 'lucide-check'],
  question: ['Question', 'lucide-circle-help'],
  help: ['Help', 'lucide-circle-help'],
  faq: ['FAQ', 'lucide-circle-help'],
  warning: ['Warning', 'lucide-triangle-alert'],
  caution: ['Caution', 'lucide-triangle-alert'],
  attention: ['Attention', 'lucide-triangle-alert'],
  failure: ['Failure', 'lucide-x'],
  fail: ['Fail', 'lucide-x'],
  missing: ['Missing', 'lucide-x'],
  danger: ['Danger', 'lucide-zap'],
  error: ['Error', 'lucide-zap'],
  bug: ['Bug', 'lucide-bug'],
  quote: ['Quote', 'lucide-quote'],
  cite: ['Cite', 'lucide-quote'],
};

const WARN_FAMILY = new Set(['warning', 'caution', 'attention', 'danger', 'error', 'bug', 'failure', 'fail', 'missing']);

function typeName(kind: string): string {
  const k = kind.replace(/[-_]+/g, ' ');
  return k.charAt(0).toUpperCase() + k.slice(1);
}

/** What a callout looks like: exported for the tests. */
export function calloutLook(kind: string, meta: string, hasTitle: boolean) {
  const math = MATH_CALLOUTS[kind];
  const obs = OBSIDIAN_CALLOUTS[kind];
  const plain = /(^|\s|,)plain($|\s|,)/.test(meta);
  const label = math ? math[0] : obs ? obs[0] : typeName(kind);
  // Istari: "Type: Custom Title", or "Type:" when untitled; |plain drops the prefix.
  const prefix = math && !plain ? label + ':' + (hasTitle ? ' ' : '') : !hasTitle ? label : '';
  return {
    prefix,
    icon: (math ? math[1] : obs ? obs[1] : 'lucide-pencil') as IconName,
    italicBody: !!(math && math[2]),
    proof: kind === 'proof',
    warn: WARN_FAMILY.has(kind),
  };
}

function Tombstone(props: {size: number; color: string}) {
  // ∎, drawn as a block: the text face has no U+220E.
  return (
    <View
      accessibilityLabel="end of proof"
      style={{alignSelf: 'flex-end', width: props.size * 0.42, height: props.size * 0.56, backgroundColor: props.color, marginTop: 2, marginBottom: props.size * 0.15}}
    />
  );
}

function CalloutView(props: {block: Block & {type: 'callout'}; ctx: Ctx; depth: number}) {
  const {block, ctx} = props;
  const {p, f} = ctx.t;
  const F = ctx.size;
  const foldable = block.fold !== '';
  const [open, setOpen] = useState(block.fold !== '-');
  const look = calloutLook(block.kind, block.meta || '', !!block.title);
  const rgb = look.warn ? p.warnRgb : p.callout;
  const color = 'rgb(' + rgb + ')';
  const titleSize = Math.round(F * 1.02 * 10) / 10;
  const titleStyle: TextStyle = look.proof
    ? {fontFamily: f.serif, color, fontStyle: 'italic', fontVariant: PROSE_FIGURES, fontWeight: 'normal'}
    : {fontFamily: f.serif, color, fontStyle: 'normal', fontVariant: ['small-caps', 'oldstyle-nums'], letterSpacing: track(titleSize, 0.06), fontWeight: 'normal'};
  const titleRuns: Run[] = [
    ...(look.prefix ? [{type: 'text', text: look.prefix} as Run] : []),
    ...(block.title || []),
  ];
  const titleCtx: Ctx = {...ctx, base: titleStyle};
  const bodyCtx: Ctx = {
    ...ctx,
    base: {...ctx.base, fontStyle: look.italicBody ? 'italic' : 'normal', fontWeight: 'normal', color: ctx.base.color},
  };
  const lh = Math.round(titleSize * ctx.lf);
  const iconSize = Math.round(F * 0.85);

  const header = (
    <Pressable disabled={!foldable} onPress={() => setOpen(o => !o)} style={{flexDirection: 'row', alignItems: 'flex-start'}}>
      <Icon name={look.icon} size={iconSize} color={color} style={{marginTop: (lh - iconSize) / 2 + 1, marginRight: F * 0.5}} />
      <View style={{flex: 1}}>
        <Runs runs={titleRuns} ctx={titleCtx} size={titleSize} />
      </View>
      {foldable ? (
        <Icon
          name={open ? 'lucide-chevron-down' : 'lucide-chevron-right'}
          size={iconSize}
          color={color}
          style={{marginTop: (lh - iconSize) / 2 + 1, marginLeft: F * 0.4}}
        />
      ) : null}
    </Pressable>
  );

  return (
    <View
      style={{
        borderLeftWidth: 2,
        borderColor: color,
        backgroundColor: look.proof ? 'transparent' : rgba(rgb, p.dark ? 0.055 : 0.07),
        paddingVertical: F * 0.6,
        paddingHorizontal: F * 0.8,
        marginVertical: F * 0.5,
      }}>
      {header}
      {open && block.children.length ? (
        <View style={{paddingTop: F * 0.2}}>
          {block.children.map((b, i) => (
            <BlockView key={i} block={b} ctx={bodyCtx} depth={props.depth + 1} />
          ))}
          {look.proof ? <Tombstone size={F} color={p.muted} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/* ---------- properties (Istari section 6) ---------- */

function TagLabel(props: {tag: string; ctx: Ctx; size: number}) {
  const {p, f} = props.ctx.t;
  const ts = props.size * 0.9;
  const onTag = props.ctx.actions.onTag;
  return (
    <Pressable
      disabled={!onTag}
      onPress={() => onTag && onTag(props.tag)}
      style={{borderWidth: 1, borderColor: rgba(p.goldRgb, p.dark ? 0.3 : 0.55), borderRadius: 2, paddingHorizontal: ts * 0.45, marginRight: 6, marginBottom: 4}}>
      <Text style={{fontFamily: f.serif, fontSize: ts, lineHeight: Math.round(ts * 1.35), color: p.gold, fontVariant: SMALL_CAPS, letterSpacing: track(ts, 0.05)}}>
        {'#' + props.tag}
      </Text>
    </Pressable>
  );
}

function PropertiesView(props: {block: Block & {type: 'properties'}; ctx: Ctx}) {
  const {block, ctx} = props;
  const {p, f} = ctx.t;
  const F = ctx.fontSize;
  const [open, setOpen] = useState(true);
  const keySize = Math.round(F * 0.82);
  const valSize = Math.round(F * 0.95);
  const label = Math.round(F * 0.74 * 10) / 10;
  return (
    <View style={{paddingBottom: F * 0.7, marginBottom: F * 1.2, borderBottomWidth: 1, borderColor: p.rule}}>
      <Pressable onPress={() => setOpen(o => !o)} accessibilityRole="button" style={{paddingVertical: 2, marginBottom: F * 0.2}}>
        <Text style={{fontFamily: f.serif, fontSize: label, color: p.faint, fontVariant: SMALL_CAPS, letterSpacing: track(label, 0.14)}}>
          {'Properties' + (open ? '' : ' (' + block.props.length + ')')}
        </Text>
      </Pressable>
      {open
        ? block.props.map(pr => {
            const isTags = pr.key === 'tags' || pr.key === 'tag';
            const values = Array.isArray(pr.value) ? pr.value : [pr.value];
            return (
              <View key={pr.key} style={{flexDirection: 'row', alignItems: 'flex-start', minHeight: valSize * 1.9}}>
                <Text
                  numberOfLines={1}
                  style={{
                    width: keySize * 7.5,
                    fontFamily: f.serif,
                    fontSize: keySize,
                    lineHeight: Math.round(valSize * 1.6),
                    color: p.faint,
                    fontVariant: ['small-caps', 'lining-nums', 'tabular-nums'],
                    letterSpacing: track(keySize, 0.05),
                  }}>
                  {pr.key}
                </Text>
                {isTags ? (
                  <View style={{flex: 1, flexDirection: 'row', flexWrap: 'wrap', paddingTop: 3}}>
                    {values.map((v, i) => (
                      <TagLabel key={i} tag={String(v).replace(/^#/, '')} ctx={ctx} size={valSize} />
                    ))}
                  </View>
                ) : (
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: f.serif,
                      fontSize: valSize,
                      lineHeight: Math.round(valSize * 1.6),
                      color: p.muted,
                      fontStyle: 'italic',
                      fontVariant: DATA_FIGURES,
                    }}>
                    {values.map(String).join(', ')}
                  </Text>
                )}
              </View>
            );
          })
        : null}
    </View>
  );
}

/* ---------- embeds ---------- */

function EmbedImage(props: {uri: string; size: string | null; ctx: Ctx}) {
  const {ctx} = props;
  const {p, f} = ctx.t;
  const [aspect, setAspect] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const m = props.size ? /^(\d+)(?:x(\d+))?$/.exec(props.size) : null;
  useEffect(() => {
    let alive = true;
    Image.getSize(
      props.uri,
      (w, h) => alive && h > 0 && setAspect(w / h),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [props.uri]);
  if (failed) return <Text style={{fontFamily: f.serif, fontStyle: 'italic', color: p.faint}}>Cannot show this image.</Text>;
  const maxW = ctx.width - ctx.embedDepth * 16;
  let w = m ? Math.min(parseInt(m[1], 10), maxW) : maxW;
  let h = m && m[2] ? parseInt(m[2], 10) : aspect ? w / aspect : w * 0.6;
  if (m && m[2] && aspect) w = Math.min(maxW, h * aspect);
  return (
    <View style={{alignItems: 'center', marginVertical: ctx.size * 0.4}}>
      <Image source={{uri: props.uri}} style={{width: w, height: h}} resizeMode="contain" fadeDuration={0} />
    </View>
  );
}

function EmbedView(props: {block: Block & {type: 'embed'}; ctx: Ctx; depth: number}) {
  const {block, ctx} = props;
  const {p, f} = ctx.t;
  const F = ctx.size;
  const t = block.target;
  const res = ctx.embeds.get(embedKey(ctx.notePath, t));
  const label = t.page + (t.sub ? ' › ' + t.sub.replace(/#/g, ' › ') : '');
  const openLink = ctx.actions.onLink ? () => ctx.actions.onLink!(t, ctx.notePath) : undefined;
  const small = Math.round(F * 0.82);
  const capsLabel: TextStyle = {fontFamily: f.serif, fontSize: small, fontVariant: SMALL_CAPS, letterSpacing: track(small, 0.06)};
  const quietBox = {borderWidth: 1, borderStyle: 'dashed' as const, borderColor: p.rule, padding: 8, marginVertical: 6};
  if (!res) return <Text style={{fontFamily: f.serif, fontStyle: 'italic', color: p.faint, marginVertical: 4}}>Loading {label}…</Text>;
  switch (res.kind) {
    case 'image':
      return <EmbedImage uri={fileUri(res.entry.path)} size={t.alias} ctx={ctx} />;
    case 'note': {
      if (ctx.embedDepth >= MAX_EMBED_DEPTH) {
        return (
          <Text style={{...capsLabel, fontSize: F, color: p.link, textDecorationLine: 'underline'}} onPress={openLink}>
            {label}
          </Text>
        );
      }
      const notes = new Map<number, FootItem>();
      for (const b of res.blocks) if (b.type === 'footnotes') for (const it of b.items) notes.set(it.n, it);
      const inner: Ctx = {
        ...ctx,
        notePath: res.entry.path,
        embedDepth: ctx.embedDepth + 1,
        readOnly: true,
        notes,
        base: {...ctx.base, fontStyle: 'normal'},
      };
      return (
        <View style={{borderLeftWidth: 2, borderColor: p.goldDim, paddingLeft: F * 0.9, marginVertical: F * 0.5}}>
          <Pressable onPress={openLink} style={{flexDirection: 'row', alignItems: 'center', marginBottom: 2}}>
            <Text style={{...capsLabel, color: p.faint, flex: 1}} numberOfLines={1}>
              {res.entry.title + (t.sub ? ' › ' + t.sub.replace(/#/g, ' › ') : '')}
            </Text>
            <Text style={{...capsLabel, color: p.gold}}>open ›</Text>
          </Pressable>
          {res.blocks.map((b, i) =>
            ctx.sidenotes && b.type === 'footnotes' ? null : <BlockView key={i} block={b} ctx={inner} depth={props.depth + 1} />,
          )}
        </View>
      );
    }
    case 'file':
      return (
        <View style={quietBox}>
          <Text style={{fontFamily: f.serif, fontSize: F * 0.9, color: p.text}}>File: {res.entry.rel}</Text>
        </View>
      );
    case 'missing':
      return (
        <Pressable onPress={openLink} style={quietBox}>
          <Text style={{fontFamily: f.serif, fontSize: F * 0.9, color: p.muted, fontStyle: 'italic'}}>Not found: {label}</Text>
        </Pressable>
      );
    default:
      return (
        <View style={quietBox}>
          <Text style={{fontFamily: f.serif, fontSize: F * 0.9, color: p.muted}}>{res.kind === 'error' ? res.message : ''}</Text>
        </View>
      );
  }
}

/* ---------- headings (Istari section 3) ---------- */

function Heading(props: {block: Block & {type: 'heading'}; ctx: Ctx; first: boolean}) {
  const {block, ctx} = props;
  const {p, f} = ctx.t;
  const F = ctx.fontSize;
  const level = Math.min(6, block.level);
  // Istari mobile sizes: h1 2em, h2 1.5em; then 1.25, 1.05, 0.95, 0.9.
  const sizes = [2.0, 1.5, 1.25, 1.05, 0.95, 0.9];
  const lfs = [1.2, 1.25, 1.3, 1.4, 1.4, 1.4];
  const size = Math.round(F * sizes[level - 1] * 10) / 10;
  const lf = lfs[level - 1];
  const styles: TextStyle[] = [
    {fontFamily: f.title, color: p.bright, fontVariant: ['oldstyle-nums'], letterSpacing: track(size, 0.005)},
    {fontFamily: f.title, color: p.gold, fontStyle: 'italic', fontVariant: ['oldstyle-nums']},
    {fontFamily: f.serif, color: p.bright, fontVariant: ['small-caps', 'oldstyle-nums'], letterSpacing: track(size, 0.06)},
    {fontFamily: f.serif, color: p.verdigris, fontVariant: ['small-caps', 'oldstyle-nums'], letterSpacing: track(size, 0.06)},
    {fontFamily: f.serif, color: p.muted, fontVariant: ['small-caps', 'oldstyle-nums'], letterSpacing: track(size, 0.06)},
    {fontFamily: f.serif, color: p.faint, fontStyle: 'italic', fontVariant: ['oldstyle-nums']},
  ];
  const hctx: Ctx = {...ctx, base: {...styles[level - 1], fontWeight: 'normal'}};
  const top = props.first ? 0 : F * [1.2, 1.3, 1.0, 0.9, 0.8, 0.8][level - 1];
  const runs = <Runs runs={block.runs} ctx={hctx} size={size} lf={lf} />;
  if (level === 1) {
    return (
      <View style={{marginTop: top, marginBottom: F * 0.5, paddingBottom: size * 0.25, borderBottomWidth: 1, borderColor: p.rule}}>
        {runs}
        <View style={{width: F * 3.2, height: 1, backgroundColor: p.goldDim, marginTop: size * 0.25 - 1}} />
      </View>
    );
  }
  if (level === 2) {
    // A small four-pointed star before each h2 (Istari section 10c).
    const star = size * 0.5;
    const lh = Math.round(size * lf);
    const baseline = (lh - size * 1.211) / 2 + size * 0.924;
    return (
      <View style={{flexDirection: 'row', alignItems: 'flex-start', marginTop: top, marginBottom: F * 0.35}}>
        <Icon name="istari-star" size={star} color={p.goldDim} style={{marginTop: baseline - size * 0.08 - star, marginRight: size * 0.55}} />
        <View style={{flex: 1}}>{runs}</View>
      </View>
    );
  }
  return <View style={{marginTop: top, marginBottom: F * 0.3}}>{runs}</View>;
}

/* ---------- rules, lists, tables ---------- */

function Rule(props: {ctx: Ctx}) {
  const {p} = props.ctx.t;
  const F = props.ctx.fontSize;
  // A line that fades in at both ends, with a small diamond at its center.
  const steps = [0.15, 0.35, 0.6, 0.85];
  const seg = (o: number, i: number) => <View key={i} style={{flex: 1, height: 1, backgroundColor: p.goldDim, opacity: o}} />;
  return (
    <View style={{marginVertical: F * 1.6, height: 8, justifyContent: 'center'}}>
      <View style={{flexDirection: 'row', alignItems: 'center'}}>
        {steps.map(seg)}
        <View style={{flex: 4, height: 1, backgroundColor: p.goldDim}} />
        {steps.slice().reverse().map((o, i) => seg(o, i + 10))}
      </View>
      <View
        style={{
          position: 'absolute',
          alignSelf: 'center',
          width: 7,
          height: 7,
          backgroundColor: p.bg,
          borderWidth: 1,
          borderColor: p.goldDim,
          transform: [{rotate: '45deg'}],
        }}
      />
    </View>
  );
}

function TaskBox(props: {checked: boolean; size: number; onPress?: () => void}) {
  const {p} = useTheme();
  const s = props.size;
  return (
    <Pressable
      disabled={!props.onPress}
      hitSlop={10}
      onPress={props.onPress}
      accessibilityRole="checkbox"
      accessibilityState={{checked: props.checked}}
      style={{
        width: s,
        height: s,
        borderWidth: 1,
        borderColor: p.goldDim,
        borderRadius: 2,
        backgroundColor: props.checked ? p.goldDim : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {props.checked ? <Icon name="lucide-check" size={s * 0.8} color={p.onAccent} /> : null}
    </Pressable>
  );
}

function ListView(props: {block: Block & {type: 'list'}; ctx: Ctx; depth: number}) {
  const {block, ctx} = props;
  const {p, f} = ctx.t;
  const F = ctx.size;
  const lh = Math.round(F * ctx.lf);
  const indent = F * 1.4;
  return (
    <View style={{marginVertical: F * 0.2}}>
      {block.items.map((it, i) => {
        const canToggle = it.task !== undefined && !ctx.readOnly && it.line !== undefined && !!ctx.actions.onToggleTask;
        const done = !!it.task;
        const itemCtx: Ctx = done ? {...ctx, base: {...ctx.base, color: p.faint, textDecorationLine: 'line-through'}} : ctx;
        const box = F * 0.82;
        return (
          <View key={i} style={{flexDirection: 'row', alignItems: 'flex-start'}}>
            <View style={{width: indent + (it.task !== undefined ? F * 0.3 : 0), alignItems: 'flex-end', paddingRight: F * 0.45}}>
              {it.task !== undefined ? (
                <View style={{height: lh, justifyContent: 'center'}}>
                  <TaskBox
                    checked={done}
                    size={box}
                    onPress={canToggle ? () => ctx.actions.onToggleTask!(it.line as number, it.taskChar || ' ') : undefined}
                  />
                </View>
              ) : (
                <Text style={{fontFamily: f.serif, fontSize: F, lineHeight: lh, color: p.goldDim, fontVariant: ['lining-nums'], fontStyle: 'normal'}}>
                  {block.ordered ? block.start + i + '.' : props.depth % 2 ? '◦' : '•'}
                </Text>
              )}
            </View>
            <View style={{flex: 1}}>
              {it.children.map((b, j) => (
                <BlockView key={j} block={b} ctx={itemCtx} depth={props.depth + 1} tight />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function TableView(props: {block: Block & {type: 'table'}; ctx: Ctx}) {
  const {block, ctx} = props;
  const {p} = ctx.t;
  const F = ctx.size;
  const cols = Math.max(block.header.length, ...block.rows.map(r => r.length));
  const minCol = F * 3;
  // Rows are laid out separately, so each column takes the widest cell's width.
  const [colW, setColW] = useState<number[]>([]);
  const measured = useRef<number[]>([]);
  useEffect(() => {
    measured.current = [];
    setColW([]);
  }, [block]);
  const onCell = (c: number, w: number) => {
    if (w > (measured.current[c] || 0) + 0.5) {
      measured.current[c] = Math.ceil(w);
      const next = measured.current.slice();
      setColW(prev => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next));
    }
  };
  const align = (c: number) => (block.align[c] === 'center' ? 'center' : block.align[c] === 'right' ? 'flex-end' : 'flex-start');
  // Booktabs: rules above and below the table and under the header only.
  const cellCtx: Ctx = {...ctx, base: {...ctx.base, fontVariant: DATA_FIGURES}};
  const headCtx: Ctx = {...ctx, base: {...ctx.base, fontVariant: ['small-caps', 'lining-nums', 'tabular-nums'], color: p.bright, fontStyle: 'normal'}};
  const row = (cells: Run[][], head: boolean, ri: number) => (
    <View key={ri} style={head ? {flexDirection: 'row', borderBottomWidth: 1, borderColor: p.faint} : {flexDirection: 'row'}}>
      {Array.from({length: cols}).map((_, c) => (
        <View
          key={c}
          onLayout={e => onCell(c, e.nativeEvent.layout.width)}
          style={{
            minWidth: colW[c] || minCol,
            alignItems: align(c),
            paddingHorizontal: F * 0.6,
            paddingVertical: F * 0.3,
            justifyContent: 'flex-end',
          }}>
          <Runs runs={cells[c] || []} ctx={head ? headCtx : cellCtx} style={head ? {letterSpacing: track(F, 0.05)} : undefined} />
        </View>
      ))}
    </View>
  );
  return (
    <ScrollView horizontal overScrollMode="never" style={{marginVertical: F * 0.5}}>
      <View style={{borderTopWidth: 1.5, borderBottomWidth: 1.5, borderColor: p.muted}}>
        {row(block.header, true, -1)}
        {block.rows.map((r, i) => row(r, false, i))}
      </View>
    </ScrollView>
  );
}

/* ---------- all blocks ---------- */

const BlockView = React.memo(function BlockView(props: {block: Block; ctx: Ctx; depth: number; first?: boolean; tight?: boolean}) {
  const {block, ctx} = props;
  const {p, f} = ctx.t;
  const F = ctx.size;
  switch (block.type) {
    case 'heading':
      return <Heading block={block} ctx={ctx} first={!!props.first} />;
    case 'paragraph':
      return (
        <View style={{marginVertical: props.tight ? F * 0.1 : F * 0.42}}>
          <Runs runs={block.runs} ctx={ctx} />
        </View>
      );
    case 'math':
      return <DisplayMath tex={block.tex} ctx={ctx} />;
    case 'code':
      return (
        <ScrollView
          horizontal
          overScrollMode="never"
          style={{borderLeftWidth: 2, borderColor: p.goldDim, backgroundColor: p.codeBg, marginVertical: F * 0.5}}
          contentContainerStyle={{paddingVertical: F * 0.5, paddingHorizontal: F * 0.7}}>
          <Text style={{fontFamily: f.mono, fontSize: F * 0.82, lineHeight: Math.round(F * 0.82 * 1.5), color: p.code}}>{block.text}</Text>
        </ScrollView>
      );
    case 'hr':
      return <Rule ctx={ctx} />;
    case 'quote': {
      // Istari: blockquotes read as marginal notes.
      const qctx: Ctx = {...ctx, size: Math.round(F * 0.94 * 10) / 10, base: {...ctx.base, fontStyle: 'italic', color: p.muted}};
      return (
        <View style={{borderLeftWidth: 1, borderColor: p.goldDim, paddingLeft: F * 1.1, paddingVertical: F * 0.1, marginVertical: F * 0.42}}>
          {block.children.map((b, i) => (
            <BlockView key={i} block={b} ctx={qctx} depth={props.depth + 1} tight={block.children.length === 1} />
          ))}
        </View>
      );
    }
    case 'callout':
      return <CalloutView block={block} ctx={ctx} depth={props.depth} />;
    case 'properties':
      return ctx.embedDepth === 0 ? <PropertiesView block={block} ctx={ctx} /> : null;
    case 'embed':
      return <EmbedView block={block} ctx={ctx} depth={props.depth} />;
    case 'footnotes': {
      const size = Math.round(F * 0.85 * 10) / 10;
      const fctx: Ctx = {...ctx, size, base: {...ctx.base, color: p.muted, fontStyle: 'normal'}};
      return (
        <View style={{marginTop: F * 1.6, borderTopWidth: 1, borderColor: p.rule, paddingTop: F * 0.6}}>
          {block.items.map(it => (
            <View key={it.n} style={{flexDirection: 'row'}}>
              <Text style={{fontFamily: f.serif, fontSize: size, lineHeight: Math.round(size * ctx.lf), width: F * 1.6, color: p.goldDim, fontVariant: ['lining-nums']}}>
                {it.n}.
              </Text>
              <View style={{flex: 1}}>
                {it.children.map((b, j) => (
                  <BlockView key={j} block={b} ctx={fctx} depth={props.depth + 1} tight />
                ))}
              </View>
            </View>
          ))}
        </View>
      );
    }
    case 'list':
      return <ListView block={block} ctx={ctx} depth={props.depth} />;
    case 'table':
      return <TableView block={block} ctx={ctx} />;
    default:
      return null;
  }
});

/* ------------------------------------------------------------------ */
/* Embedded notes and images                                           */
/* ------------------------------------------------------------------ */

function useEmbeds(blocks: Block[], notePath: string | null, vaultVersion: number) {
  const [state, setState] = useState<{map: Map<string, EmbedResult>; version: number}>({map: new Map(), version: 0});
  useEffect(() => {
    let cancelled = false;
    const map = new Map<string, EmbedResult>();
    const firstLevel = collectEmbeds(blocks);
    if (!firstLevel.length) {
      setState(s => (s.map.size ? {map, version: s.version + 1} : s));
      return;
    }
    (async () => {
      let queue: {from: string | null; target: LinkTarget; depth: number}[] = firstLevel.map(e => ({from: notePath, target: e.target, depth: 0}));
      while (queue.length && !cancelled) {
        const next: typeof queue = [];
        for (const q of queue) {
          const k = embedKey(q.from, q.target);
          if (map.has(k)) continue;
          const res = await loadEmbed(q.target, q.from);
          map.set(k, res);
          if (res.kind === 'note' && q.depth + 1 < MAX_EMBED_DEPTH) {
            for (const e of collectEmbeds(res.blocks)) next.push({from: res.entry.path, target: e.target, depth: q.depth + 1});
          }
        }
        queue = next;
      }
      if (!cancelled) setState(s => ({map, version: s.version + 1}));
    })();
    return () => {
      cancelled = true;
    };
  }, [blocks, notePath, vaultVersion]);
  return state;
}

/* ------------------------------------------------------------------ */
/* Progressive math rendering                                          */
/* ------------------------------------------------------------------ */

function useMathImages(
  blocks: Block[],
  session: MathSession,
  emPx: number,
  preamble: string,
  onProgress?: (done: number, total: number) => void,
) {
  const [version, setVersion] = useState(0);
  const store = useRef(new Map<string, PreviewImage>());
  const emRef = useRef(emPx);

  useEffect(() => {
    let cancelled = false;
    if (emRef.current !== emPx) {
      store.current = new Map();
      emRef.current = emPx;
    }
    const changed = session.setContext(blocks, preamble);
    if (changed) store.current = new Map();
    const wanted = new Map<string, {tex: string; display: boolean}>();
    for (const m of collectMath(blocks)) wanted.set(key(m.tex, m.display), m);
    // Drop images that are no longer used.
    const next = new Map<string, PreviewImage>();
    for (const [k, v] of store.current) if (wanted.has(k)) next.set(k, v);
    store.current = next;
    const todo = [...wanted.entries()].filter(([k]) => !store.current.has(k));
    // Cached ones are instant.
    const slow: typeof todo = [];
    for (const e of todo) {
      if (session.hasPreview(e[1].tex, e[1].display, emPx)) store.current.set(e[0], session.preview(e[1].tex, e[1].display, emPx));
      else slow.push(e);
    }
    const total = slow.length;
    if (total === 0) {
      setVersion(v => v + 1);
      onProgress && onProgress(0, 0);
      return;
    }
    let i = 0;
    let lastFlush = Date.now();
    const step = () => {
      if (cancelled) return;
      const t0 = Date.now();
      while (i < slow.length && Date.now() - t0 < 150) {
        const [k, m] = slow[i++];
        store.current.set(k, session.preview(m.tex, m.display, emPx));
      }
      const done = i >= slow.length;
      // Few screen updates: e-ink refreshes are slow and visible.
      if (done || Date.now() - lastFlush > 900) {
        lastFlush = Date.now();
        setVersion(v => v + 1);
      }
      onProgress && onProgress(done ? 0 : i, done ? 0 : total);
      if (!done) setTimeout(step, 0);
    };
    setTimeout(step, 0);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, emPx, preamble, session]);

  return {images: store.current, version};
}

/* ------------------------------------------------------------------ */
/* Anchors                                                             */
/* ------------------------------------------------------------------ */

function containsId(b: Block, id: string): boolean {
  if (b.id === id) return true;
  const kids: Block[] = [];
  if ('children' in b && b.children) kids.push(...b.children);
  if (b.type === 'list') for (const it of b.items) kids.push(...it.children);
  return kids.some(k => containsId(k, id));
}

/** Index of the top-level block that a "#Heading" or "#^id" subpath points to. */
export function anchorIndex(blocks: Block[], sub: string): number {
  if (sub.startsWith('^')) return blocks.findIndex(b => containsId(b, sub.slice(1)));
  const parts = sub.split('#').filter(Boolean);
  const want = parts[parts.length - 1] || '';
  const idx = findHeading(blocks, want);
  if (idx >= 0) return idx;
  return blocks.findIndex(b => b.type === 'heading' && normAnchor(b.anchor).startsWith(normAnchor(want)));
}

/** True if the note's properties ask for Istari's vellum page (cssclasses: vellum). */
export function isVellum(blocks: Block[]): boolean {
  const b = blocks[0];
  if (!b || b.type !== 'properties') return false;
  const pr = b.props.find(x => x.key === 'cssclasses' || x.key === 'cssclass');
  if (!pr) return false;
  const v = Array.isArray(pr.value) ? pr.value : String(pr.value).split(/[\s,]+/);
  return v.some(x => String(x).trim() === 'vellum');
}

/* ------------------------------------------------------------------ */
/* Preview                                                             */
/* ------------------------------------------------------------------ */

function Preview(props: {
  blocks: Block[];
  session: MathSession;
  fontSize: number;
  mathScale: number;
  preamble: string;
  width: number;
  notePath?: string | null;
  /** Inline title (the file name), drawn above the note as in Obsidian. */
  title?: string | null;
  /** Footnotes open in place under their line (Istari sidenotes). */
  sidenotes?: boolean;
  actions?: PreviewActions;
  anchor?: {sub: string; nonce: number} | null;
  onJump?: (line: number) => void;
  onProgress?: (done: number, total: number) => void;
  header?: React.ReactNode;
}) {
  const t = useTheme();
  const {p, f} = t;
  const {blocks} = props;
  const vellum = useMemo(() => isVellum(blocks), [blocks]);
  // Istari mobile vellum: 18px against 17px, line height 1.75.
  const fontSize = vellum ? Math.round(props.fontSize * 1.06 * 10) / 10 : props.fontSize;
  const lf = vellum ? 1.75 : LINE;
  const notePath = props.notePath || null;
  const ratio = PixelRatio.get();
  // MathJax matches the x-height of the text face; EB Garamond's is small.
  const faceScale = f.loaded ? 0.9 : 1;
  const emPx = Math.round(props.fontSize * props.mathScale * faceScale * ratio * 10) / 10;
  const vaultVersion = useVaultVersion();
  const embeds = useEmbeds(blocks, notePath, vaultVersion);
  const sidenotes = props.sidenotes !== false;

  // Math from embedded notes is rendered together with the note's own math.
  const mathBlocks = useMemo(() => {
    const extra: Block[] = [];
    for (const r of embeds.map.values()) if (r.kind === 'note') extra.push(...r.blocks);
    return extra.length ? blocks.concat(extra) : blocks;
  }, [blocks, embeds]);

  const {images, version} = useMathImages(mathBlocks, props.session, emPx, props.preamble, props.onProgress);
  const [descentRatio, setDescentRatio] = useState(0.298 + (LINE - 1.305) / 2);
  const scroller = useRef<ScrollView>(null);
  const positions = useRef<number[]>([]);
  const [openNotes, setOpenNotes] = useState<Set<string>>(() => new Set());
  const toggleNote = useCallback((k: string) => {
    setOpenNotes(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const scrollToIndex = (i: number) => {
    const y = positions.current[i];
    if (i >= 0 && typeof y === 'number' && scroller.current) scroller.current.scrollTo({y: Math.max(0, y - 8), animated: false});
  };

  const footnotesIndex = blocks.findIndex(b => b.type === 'footnotes');
  const notes = useMemo(() => {
    const m = new Map<number, FootItem>();
    const fb = blocks[footnotesIndex];
    if (fb && fb.type === 'footnotes') for (const it of fb.items) m.set(it.n, it);
    return m;
  }, [blocks, footnotesIndex]);
  const actions = props.actions || {};
  // The scaled math in a vellum note is made at the body size and drawn larger.
  const mathBody = props.fontSize;

  const ctx: Ctx = useMemo(
    () => ({
      t,
      images,
      embeds: embeds.map,
      fontSize: mathBody,
      size: fontSize,
      lf,
      base: {fontFamily: f.serif, color: vellum ? p.vellum : p.text, fontVariant: PROSE_FIGURES},
      ratio,
      descentRatio,
      width: props.width - 32,
      notePath,
      embedDepth: 0,
      readOnly: false,
      actions,
      vaultVersion,
      notes,
      sidenotes,
      openNotes,
      toggleNote,
      onFootnote: () => scrollToIndex(footnotesIndex),
    }),
    // version forces a new context when images arrive
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, images, version, embeds, fontSize, lf, vellum, ratio, descentRatio, props.width, notePath, props.actions, vaultVersion, notes, sidenotes, openNotes, footnotesIndex],
  );

  // Scroll to "#Heading" / "#^id" after a link opens this note.
  useEffect(() => {
    const a = props.anchor;
    if (!a) return;
    const idx = anchorIndex(blocks, a.sub);
    if (idx < 0) return;
    let tries = 0;
    const tick = () => {
      if (typeof positions.current[idx] === 'number') scrollToIndex(idx);
      else if (tries++ < 20) setTimeout(tick, 100);
    };
    setTimeout(tick, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.anchor, blocks]);

  const firstContent = blocks.findIndex(b => b.type !== 'properties');
  const titleSize = Math.round(props.fontSize * 2.1);

  return (
    <ScrollView
      ref={scroller}
      style={{flex: 1, backgroundColor: p.bg}}
      contentContainerStyle={{paddingHorizontal: 16, paddingTop: 14, paddingBottom: 80}}
      overScrollMode="never">
      {/* Invisible probe: measures where the baseline sits in a text line. */}
      <Text
        style={{position: 'absolute', opacity: 0, fontFamily: f.serif, fontSize: mathBody, lineHeight: Math.round(mathBody * LINE)}}
        onTextLayout={e => {
          const l = e.nativeEvent.lines && e.nativeEvent.lines[0];
          if (l && typeof l.descender === 'number' && l.descender > 0) {
            const r = l.descender / mathBody;
            if (Math.abs(r - descentRatio) * mathBody > 0.5) setDescentRatio(r);
          }
        }}>
        Xg
      </Text>
      {props.header}
      {props.title ? (
        <Text
          accessibilityRole="header"
          style={{fontFamily: f.title, fontSize: titleSize, lineHeight: Math.round(titleSize * 1.15), color: p.bright, letterSpacing: track(titleSize, 0.005), marginBottom: props.fontSize * 0.5, fontVariant: ['oldstyle-nums']}}>
          {props.title}
        </Text>
      ) : null}
      {blocks.length === 0 ? (
        <Text style={{fontFamily: f.serif, fontSize: props.fontSize, color: p.faint, fontStyle: 'italic'}}>
          Nothing to show yet. Type Markdown and TeX in the editor.
        </Text>
      ) : null}
      {blocks.map((b, i) =>
        sidenotes && b.type === 'footnotes' ? null : (
          <Pressable
            key={i + ':' + (b.line === undefined ? '' : b.line)}
            onLayout={e => {
              positions.current[i] = e.nativeEvent.layout.y;
            }}
            onLongPress={props.onJump && b.line !== undefined ? () => props.onJump!(b.line as number) : undefined}
            delayLongPress={450}>
            <BlockView block={b} ctx={ctx} depth={0} first={i === firstContent && !props.title} />
          </Pressable>
        ),
      )}
    </ScrollView>
  );
}

export default React.memo(Preview);
