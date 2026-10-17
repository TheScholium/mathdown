/**
 * Rendered view of a Markdown document with TeX math and Obsidian syntax.
 *
 * Math images come from the JS engine (MathJax -> rasterizer -> PNG data
 * URI). They are made a few at a time after the text is on screen, so long
 * notes stay responsive; the cache makes re-renders after an edit cheap.
 *
 * Inline math sits on the text baseline: a paragraph with inline math is laid
 * out as a wrapping row of words and formula images, all bottom-aligned, and
 * each image is moved down by (its depth - the text descent).
 */
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Image, PixelRatio, Pressable, ScrollView, StyleSheet, Text, TextStyle, View} from 'react-native';
import type {Block, LinkTarget, MathSession, PreviewImage, Run} from '../engine';
import {collectEmbeds, collectMath, findHeading, normAnchor} from '../engine';
import {FAINT, GRAY, INK, LIGHT, MONO, PAPER} from './theme';
import {EmbedResult, fileUri, loadEmbed, resolve, useVaultVersion} from './vault';

export type PreviewActions = {
  onLink?: (target: LinkTarget, fromPath: string | null) => void;
  onExternal?: (href: string) => void;
  onTag?: (tag: string) => void;
  onToggleTask?: (line: number, ch: string) => void;
};

type Ctx = {
  images: Map<string, PreviewImage>;
  embeds: Map<string, EmbedResult>;
  fontSize: number;
  ratio: number;
  descent: number; // baseline to bottom of a body text line (dp)
  width: number;
  emPx: number;
  notePath: string | null;
  embedDepth: number;
  readOnly: boolean; // inside an embedded note: no task toggles
  bodyStyle?: TextStyle;
  actions: PreviewActions;
  vaultVersion: number;
  onFootnote: (n: number) => void;
};

const LINE = 1.45;
const MAX_EMBED_DEPTH = 2;
const MARK_BG = '#CDCDCD';

function key(tex: string, display: boolean): string {
  return (display ? 'D|' : 'I|') + tex;
}

function embedKey(fromPath: string | null, t: LinkTarget): string {
  return (fromPath || '') + '|' + t.page + '|' + (t.sub || '');
}

/* ------------------------------------------------------------------ */
/* Inline content                                                      */
/* ------------------------------------------------------------------ */

type Seg = {text: string; style: TextStyle; onPress?: () => void};

/** Text, link, tag and footnote runs as styled text segments. */
function segOf(r: Run, ctx: Ctx, size: number): Seg | null {
  if (r.type === 'tag') {
    return {
      text: '#' + r.tag,
      style: {backgroundColor: FAINT, fontWeight: '600'},
      onPress: ctx.actions.onTag ? () => ctx.actions.onTag!(r.tag) : undefined,
    };
  }
  if (r.type === 'fnref') {
    return {text: '[' + r.n + ']', style: {fontSize: size * 0.72, fontWeight: '700'}, onPress: () => ctx.onFootnote(r.n)};
  }
  if (r.type !== 'text') return null;
  const s: TextStyle = {};
  if (r.bold) s.fontWeight = '700';
  if (r.italic) s.fontStyle = 'italic';
  if (r.strike) s.textDecorationLine = 'line-through';
  if (r.mark) s.backgroundColor = MARK_BG;
  if (r.code) {
    s.fontFamily = MONO;
    s.fontSize = size * 0.9;
    s.backgroundColor = FAINT;
  }
  let onPress: (() => void) | undefined;
  if (r.link) {
    const link = r.link;
    const found = !link.page || !!resolve(link, ctx.notePath);
    s.textDecorationLine = r.strike ? 'underline line-through' : 'underline';
    if (!found) {
      s.color = GRAY;
      s.textDecorationStyle = 'dashed';
    } else if (!r.bold) {
      s.fontWeight = '600';
    }
    if (ctx.actions.onLink) onPress = () => ctx.actions.onLink!(link, ctx.notePath);
  } else if (r.href) {
    const href = r.href;
    s.textDecorationLine = r.strike ? 'underline line-through' : 'underline';
    if (ctx.actions.onExternal) onPress = () => ctx.actions.onExternal!(href);
  }
  return {text: r.text, style: s, onPress};
}

type Item =
  | {kind: 'word'; pieces: Seg[]; spaceAfter: boolean}
  | {kind: 'math'; tex: string; spaceAfter: boolean}
  | {kind: 'break'};

/** Splits runs into words and formulas for the wrapping-row layout. */
function toItems(runs: Run[], ctx: Ctx, size: number): Item[] {
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
      const seg = segOf(r, ctx, size);
      if (!seg) continue;
      const parts = seg.text.split(/(\s+)/);
      for (const p of parts) {
        if (!p) continue;
        if (/^\s+$/.test(p)) endWord(true);
        else word.push({...seg, text: p});
      }
    }
  }
  endWord(false);
  return items;
}

function InlineMath(props: {tex: string; ctx: Ctx; base: TextStyle; scale: number}) {
  const {ctx, tex} = props;
  const img = ctx.images.get(key(tex, false));
  if (!img) {
    return <Text style={[props.base, {color: GRAY, fontFamily: MONO}]}>{'$' + tex + '$'}</Text>;
  }
  if (!img.ok || !img.uri) {
    return (
      <Text style={[props.base, {fontFamily: MONO, textDecorationLine: 'underline', textDecorationStyle: 'dotted'}]}>
        {'$' + tex + '$ (!)'}
      </Text>
    );
  }
  const w = (img.width / ctx.ratio) * props.scale;
  const h = (img.height / ctx.ratio) * props.scale;
  const depth = ((img.height - img.ascent) / ctx.ratio) * props.scale;
  const q = ctx.descent * props.scale;
  return (
    <View style={{marginBottom: q - depth}}>
      <Image source={{uri: img.uri}} style={{width: w, height: h}} fadeDuration={0} resizeMode="stretch" />
    </View>
  );
}

/** Text with optional inline math, links, tags and footnote marks. */
function Runs(props: {runs: Run[]; ctx: Ctx; size?: number; style?: TextStyle}) {
  const {runs, ctx} = props;
  const size = props.size || ctx.fontSize;
  const base: TextStyle = {fontSize: size, lineHeight: Math.round(size * LINE), color: INK, ...(ctx.bodyStyle || {}), ...(props.style || {})};
  const hasMath = runs.some(r => r.type === 'math');
  if (!hasMath) {
    return (
      <Text style={base} selectable={false}>
        {runs.map((r, i) => {
          if (r.type === 'break') return '\n';
          const seg = segOf(r, ctx, size);
          if (!seg) return null;
          return (
            <Text key={i} style={seg.style} onPress={seg.onPress} suppressHighlighting>
              {seg.text}
            </Text>
          );
        })}
      </Text>
    );
  }
  const scale = size / ctx.fontSize;
  const space = size * 0.28;
  const items = toItems(runs, ctx, size);
  // Extra row gap when formulas reach below the text line.
  let gap = 0;
  for (const it of items) {
    if (it.kind !== 'math') continue;
    const img = ctx.images.get(key(it.tex, false));
    if (img && img.ok) {
      const depth = ((img.height - img.ascent) / ctx.ratio) * scale;
      gap = Math.max(gap, depth - ctx.descent * scale);
    }
  }
  const rows: Item[][] = [[]];
  for (const it of items) {
    if (it.kind === 'break') rows.push([]);
    else rows[rows.length - 1].push(it);
  }
  return (
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
                  <InlineMath tex={it.tex} ctx={ctx} base={base} scale={scale} />
                </View>
              );
            }
            if (it.kind === 'word') {
              return (
                <Text key={i} style={[base, {marginRight: mr}]}>
                  {it.pieces.map((p, j) => (
                    <Text key={j} style={p.style} onPress={p.onPress} suppressHighlighting>
                      {p.text}
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

/* ------------------------------------------------------------------ */
/* Blocks                                                              */
/* ------------------------------------------------------------------ */

function DisplayMath(props: {tex: string; ctx: Ctx}) {
  const {ctx, tex} = props;
  const img = ctx.images.get(key(tex, true));
  if (!img) {
    return (
      <View style={styles.mathPending}>
        <Text style={styles.mathSource}>{tex}</Text>
      </View>
    );
  }
  if (!img.ok || !img.uri) {
    return (
      <View style={styles.mathError}>
        <Text style={[styles.mathErrorTitle, {fontSize: ctx.fontSize * 0.85}]}>TeX error: {img.error}</Text>
        <Text style={styles.mathSource}>{tex}</Text>
      </View>
    );
  }
  const w = img.width / ctx.ratio;
  const h = img.height / ctx.ratio;
  const inner = <Image source={{uri: img.uri}} style={{width: w, height: h}} fadeDuration={0} resizeMode="stretch" />;
  return (
    <View style={{marginVertical: ctx.fontSize * 0.35}}>
      {w > ctx.width ? (
        <ScrollView horizontal showsHorizontalScrollIndicator overScrollMode="never">
          {inner}
        </ScrollView>
      ) : (
        <View style={{alignItems: 'center'}}>{inner}</View>
      )}
      {img.unsupportedText ? <Text style={styles.note}>Some characters have no glyph in the math font.</Text> : null}
    </View>
  );
}

/* ---------- callouts ---------- */

type CalloutStyle = 'theorem' | 'definition' | 'proof' | 'alert' | 'plain';

const CALLOUT_GROUPS: {[k: string]: CalloutStyle} = {
  theorem: 'theorem', lemma: 'theorem', corollary: 'theorem', proposition: 'theorem', claim: 'theorem',
  conjecture: 'theorem', law: 'theorem', principle: 'theorem',
  definition: 'definition', def: 'definition', axiom: 'definition', postulate: 'definition', notation: 'definition',
  proof: 'proof', solution: 'proof', derivation: 'proof',
  warning: 'alert', caution: 'alert', attention: 'alert', danger: 'alert', error: 'alert', failure: 'alert',
  fail: 'alert', missing: 'alert', bug: 'alert', important: 'alert',
};

const CALLOUT_ALIASES: {[k: string]: string} = {
  tldr: 'Summary', faq: 'FAQ', def: 'Definition', cite: 'Quote', hint: 'Tip', check: 'Success', done: 'Success',
  help: 'Question', fail: 'Failure', missing: 'Failure', error: 'Error',
};

function calloutTitle(kind: string): string {
  if (CALLOUT_ALIASES[kind]) return CALLOUT_ALIASES[kind];
  const k = kind.replace(/[-_]+/g, ' ');
  return k.charAt(0).toUpperCase() + k.slice(1);
}

function CalloutView(props: {block: Block & {type: 'callout'}; ctx: Ctx; depth: number}) {
  const {block, ctx} = props;
  const F = ctx.fontSize;
  const foldable = block.fold !== '';
  const [open, setOpen] = useState(block.fold !== '-');
  const style: CalloutStyle = CALLOUT_GROUPS[block.kind] || 'plain';
  const defaultTitle = calloutTitle(block.kind);
  const childCtx: Ctx = style === 'theorem' ? {...ctx, bodyStyle: {fontStyle: 'italic'}} : {...ctx, bodyStyle: undefined};
  const titleCtx: Ctx = {...ctx, bodyStyle: undefined};

  const titleNode =
    style === 'proof' ? (
      <View style={{flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end'}}>
        <Text style={{fontSize: F, lineHeight: Math.round(F * LINE), fontStyle: 'italic', color: INK}}>
          {block.title ? defaultTitle + ' (' : defaultTitle + '.'}
        </Text>
        {block.title ? (
          <>
            <Runs runs={block.title} ctx={titleCtx} style={{fontStyle: 'italic'}} />
            <Text style={{fontSize: F, lineHeight: Math.round(F * LINE), fontStyle: 'italic', color: INK}}>).</Text>
          </>
        ) : null}
      </View>
    ) : (
      <View style={{flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap'}}>
        {style === 'theorem' || style === 'definition' ? (
          <Text style={{fontSize: F, lineHeight: Math.round(F * LINE), fontWeight: '700', color: INK}}>
            {defaultTitle}
            {block.title ? ' (' : '.'}
          </Text>
        ) : null}
        {style === 'theorem' || style === 'definition' ? (
          block.title ? (
            <>
              <Runs runs={block.title} ctx={titleCtx} style={{fontWeight: '700'}} />
              <Text style={{fontSize: F, lineHeight: Math.round(F * LINE), fontWeight: '700', color: INK}}>).</Text>
            </>
          ) : null
        ) : block.title ? (
          <Runs runs={block.title} ctx={titleCtx} style={{fontWeight: '700', color: style === 'alert' ? PAPER : INK}} />
        ) : (
          <Text style={{fontSize: F, lineHeight: Math.round(F * LINE), fontWeight: '700', color: style === 'alert' ? PAPER : INK}}>
            {defaultTitle}
          </Text>
        )}
      </View>
    );

  const header = (
    <Pressable
      disabled={!foldable}
      onPress={() => setOpen(o => !o)}
      style={[
        {flexDirection: 'row', alignItems: 'flex-start'},
        style === 'alert' ? {backgroundColor: INK, paddingHorizontal: 8, paddingVertical: 4} : null,
        style === 'plain' ? {paddingBottom: 2} : null,
      ]}>
      {foldable ? (
        <Text style={{fontSize: F, lineHeight: Math.round(F * LINE), width: F * 1.1, color: style === 'alert' ? PAPER : INK}}>
          {open ? '▾' : '▸'}
        </Text>
      ) : null}
      <View style={{flex: 1}}>{titleNode}</View>
    </Pressable>
  );

  const body =
    open && block.children.length ? (
      <View style={style === 'alert' ? {paddingHorizontal: 10, paddingVertical: 4} : null}>
        {block.children.map((b, i) => (
          <BlockView key={i} block={b} ctx={childCtx} depth={props.depth + 1} />
        ))}
        {style === 'proof' ? <Text style={{textAlign: 'right', fontSize: F, color: INK}}>∎</Text> : null}
      </View>
    ) : null;

  const box =
    style === 'theorem' || style === 'definition'
      ? {borderWidth: 2, borderColor: INK, borderRadius: 4, padding: 10}
      : style === 'alert'
      ? {borderWidth: 3, borderColor: INK, borderRadius: 4, overflow: 'hidden' as const}
      : style === 'proof'
      ? {paddingVertical: 2}
      : {borderLeftWidth: 4, borderColor: INK, backgroundColor: FAINT, paddingLeft: 12, paddingRight: 8, paddingVertical: 6};

  return (
    <View style={[box, {marginVertical: F * 0.45}]}>
      {header}
      {body}
    </View>
  );
}

/* ---------- properties ---------- */

function PropertiesView(props: {block: Block & {type: 'properties'}; ctx: Ctx}) {
  const {block, ctx} = props;
  const F = ctx.fontSize;
  const [open, setOpen] = useState(true);
  const small = Math.round(F * 0.82);
  return (
    <View style={{borderWidth: 1, borderColor: INK, borderRadius: 4, marginBottom: F * 0.6}}>
      <Pressable onPress={() => setOpen(o => !o)} style={{flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 4}}>
        <Text style={{fontSize: small, color: INK, fontWeight: '700'}}>
          {open ? '▾ ' : '▸ '}Properties
        </Text>
        {!open ? <Text style={{fontSize: small, color: GRAY}}> ({block.props.length})</Text> : null}
      </Pressable>
      {open
        ? block.props.map(p => {
            const isTags = p.key === 'tags' || p.key === 'tag';
            const values = Array.isArray(p.value) ? p.value : [p.value];
            return (
              <View key={p.key} style={{flexDirection: 'row', borderTopWidth: 1, borderColor: LIGHT, paddingHorizontal: 8, paddingVertical: 3}}>
                <Text style={{fontSize: small, color: GRAY, width: F * 6.5}} numberOfLines={1}>
                  {p.key}
                </Text>
                <Text style={{fontSize: small, color: INK, flex: 1}}>
                  {values.map((v, i) => (
                    <Text key={i}>
                      {i ? (isTags ? ' ' : ', ') : ''}
                      {isTags ? (
                        <Text
                          style={{backgroundColor: FAINT, fontWeight: '600'}}
                          onPress={ctx.actions.onTag ? () => ctx.actions.onTag!(String(v).replace(/^#/, '')) : undefined}>
                          {'#' + String(v).replace(/^#/, '')}
                        </Text>
                      ) : (
                        String(v)
                      )}
                    </Text>
                  ))}
                </Text>
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
  if (failed) return <Text style={styles.hint}>Cannot show this image.</Text>;
  const maxW = ctx.width - ctx.embedDepth * 16;
  let w = m ? Math.min(parseInt(m[1], 10), maxW) : maxW;
  let h = m && m[2] ? parseInt(m[2], 10) : aspect ? w / aspect : w * 0.6;
  if (m && m[2] && aspect) w = Math.min(maxW, h * aspect);
  return (
    <View style={{alignItems: 'center', marginVertical: ctx.fontSize * 0.35}}>
      <Image source={{uri: props.uri}} style={{width: w, height: h}} resizeMode="contain" fadeDuration={0} />
    </View>
  );
}

function EmbedView(props: {block: Block & {type: 'embed'}; ctx: Ctx; depth: number}) {
  const {block, ctx} = props;
  const F = ctx.fontSize;
  const t = block.target;
  const res = ctx.embeds.get(embedKey(ctx.notePath, t));
  const label = t.page + (t.sub ? ' > ' + t.sub.replace(/#/g, ' > ') : '');
  const openLink = ctx.actions.onLink ? () => ctx.actions.onLink!(t, ctx.notePath) : undefined;
  if (!res) return <Text style={[styles.hint, {marginVertical: 4}]}>Loading {label}…</Text>;
  switch (res.kind) {
    case 'image':
      return <EmbedImage uri={fileUri(res.entry.path)} size={t.alias} ctx={ctx} />;
    case 'note': {
      if (ctx.embedDepth >= MAX_EMBED_DEPTH) {
        return (
          <Text style={{fontSize: F, color: INK, textDecorationLine: 'underline'}} onPress={openLink}>
            {label}
          </Text>
        );
      }
      const inner: Ctx = {...ctx, notePath: res.entry.path, embedDepth: ctx.embedDepth + 1, readOnly: true, bodyStyle: undefined};
      return (
        <View style={styles.embedBox}>
          <Pressable onPress={openLink} style={{flexDirection: 'row', marginBottom: 2}}>
            <Text style={{fontSize: F * 0.8, color: GRAY, fontWeight: '700', flex: 1}} numberOfLines={1}>
              {res.entry.title + (t.sub ? ' > ' + t.sub.replace(/#/g, ' > ') : '')}
            </Text>
            <Text style={{fontSize: F * 0.8, color: GRAY}}>open ›</Text>
          </Pressable>
          {res.blocks.map((b, i) => (
            <BlockView key={i} block={b} ctx={inner} depth={props.depth + 1} />
          ))}
        </View>
      );
    }
    case 'file':
      return (
        <View style={[styles.embedBox, {borderStyle: 'dashed'}]}>
          <Text style={{fontSize: F * 0.9, color: INK}}>File: {res.entry.rel}</Text>
        </View>
      );
    case 'missing':
      return (
        <Pressable onPress={openLink} style={[styles.embedBox, {borderStyle: 'dashed'}]}>
          <Text style={{fontSize: F * 0.9, color: GRAY}}>Not found: {label}</Text>
        </Pressable>
      );
    default:
      return (
        <View style={[styles.embedBox, {borderStyle: 'dashed'}]}>
          <Text style={{fontSize: F * 0.9, color: GRAY}}>{res.kind === 'error' ? res.message : ''}</Text>
        </View>
      );
  }
}

/* ---------- all blocks ---------- */

const BlockView = React.memo(function BlockView(props: {block: Block; ctx: Ctx; depth: number}) {
  const {block, ctx} = props;
  const F = ctx.fontSize;
  switch (block.type) {
    case 'heading': {
      const sizes = [1.7, 1.45, 1.25, 1.1, 1.0, 0.95];
      const size = Math.round(F * sizes[Math.min(5, block.level - 1)]);
      return (
        <View style={{marginTop: F * (block.level <= 2 ? 0.9 : 0.6), marginBottom: F * 0.3}}>
          <Runs runs={block.runs} ctx={{...ctx, bodyStyle: undefined}} size={size} style={{fontWeight: '700'}} />
          {block.level <= 2 ? <View style={{height: block.level === 1 ? 2 : 1, backgroundColor: INK, marginTop: 4}} /> : null}
        </View>
      );
    }
    case 'paragraph':
      return (
        <View style={{marginVertical: F * 0.35}}>
          <Runs runs={block.runs} ctx={ctx} />
        </View>
      );
    case 'math':
      return <DisplayMath tex={block.tex} ctx={ctx} />;
    case 'code':
      return (
        <ScrollView horizontal overScrollMode="never" style={styles.code}>
          <Text style={{fontFamily: MONO, fontSize: F * 0.85, lineHeight: Math.round(F * 0.85 * 1.4), color: INK}}>
            {block.text}
          </Text>
        </ScrollView>
      );
    case 'hr':
      return <View style={{height: 2, backgroundColor: INK, marginVertical: F * 0.8}} />;
    case 'quote':
      return (
        <View style={styles.quote}>
          {block.children.map((b, i) => (
            <BlockView key={i} block={b} ctx={ctx} depth={props.depth + 1} />
          ))}
        </View>
      );
    case 'callout':
      return <CalloutView block={block} ctx={ctx} depth={props.depth} />;
    case 'properties':
      return ctx.embedDepth === 0 ? <PropertiesView block={block} ctx={ctx} /> : null;
    case 'embed':
      return <EmbedView block={block} ctx={ctx} depth={props.depth} />;
    case 'footnotes':
      return (
        <View style={{marginTop: F * 1.2, borderTopWidth: 1, borderColor: INK, paddingTop: F * 0.4}}>
          {block.items.map(it => (
            <View key={it.n} style={{flexDirection: 'row'}}>
              <Text style={{fontSize: F * 0.85, lineHeight: Math.round(F * 0.85 * LINE), width: F * 1.8, color: INK, fontWeight: '700'}}>
                {it.n}.
              </Text>
              <View style={{flex: 1}}>
                {it.children.map((b, j) => (
                  <BlockView key={j} block={b} ctx={{...ctx, fontSize: Math.round(F * 0.85)}} depth={props.depth + 1} />
                ))}
              </View>
            </View>
          ))}
        </View>
      );
    case 'list':
      return (
        <View style={{marginVertical: F * 0.2}}>
          {block.items.map((it, i) => {
            const canToggle = it.task !== undefined && !ctx.readOnly && it.line !== undefined && !!ctx.actions.onToggleTask;
            return (
              <View key={i} style={{flexDirection: 'row', alignItems: 'flex-start'}}>
                <View style={{width: F * 1.8, alignItems: 'flex-end', paddingRight: F * 0.4, paddingTop: F * 0.35}}>
                  {it.task !== undefined ? (
                    <Pressable
                      disabled={!canToggle}
                      hitSlop={10}
                      onPress={() => ctx.actions.onToggleTask!(it.line as number, it.taskChar || ' ')}
                      style={[styles.box, {width: F * 0.9, height: F * 0.9, marginTop: F * 0.2}]}>
                      {it.task ? <View style={{flex: 1, margin: 2, backgroundColor: INK}} /> : null}
                    </Pressable>
                  ) : (
                    <Text style={{fontSize: F, lineHeight: Math.round(F * LINE), color: INK}}>
                      {block.ordered ? block.start + i + '.' : props.depth % 2 ? '◦' : '•'}
                    </Text>
                  )}
                </View>
                <View style={{flex: 1}}>
                  {it.children.map((b, j) => (
                    <BlockView key={j} block={b} ctx={it.task ? {...ctx, bodyStyle: {...(ctx.bodyStyle || {}), color: GRAY}} : ctx} depth={props.depth + 1} />
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      );
    case 'table': {
      const cols = Math.max(block.header.length, ...block.rows.map(r => r.length));
      const minCol = F * 4;
      const align = (c: number) => (block.align[c] === 'center' ? 'center' : block.align[c] === 'right' ? 'flex-end' : 'flex-start');
      const row = (cells: Run[][], head: boolean, ri: number) => (
        <View key={ri} style={{flexDirection: 'row', borderBottomWidth: head ? 2 : 1, borderColor: INK}}>
          {Array.from({length: cols}).map((_, c) => (
            <View key={c} style={[styles.cell, {minWidth: minCol, alignItems: align(c), borderLeftWidth: c ? 1 : 0}]}>
              <Runs runs={cells[c] || []} ctx={ctx} style={head ? {fontWeight: '700'} : undefined} />
            </View>
          ))}
        </View>
      );
      return (
        <ScrollView horizontal overScrollMode="never" style={{marginVertical: F * 0.4}}>
          <View style={{borderWidth: 2, borderColor: INK}}>
            {row(block.header, true, -1)}
            {block.rows.map((r, i) => row(r, false, i))}
          </View>
        </ScrollView>
      );
    }
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
  actions?: PreviewActions;
  anchor?: {sub: string; nonce: number} | null;
  onJump?: (line: number) => void;
  onProgress?: (done: number, total: number) => void;
  header?: React.ReactNode;
}) {
  const {blocks, fontSize} = props;
  const notePath = props.notePath || null;
  const ratio = PixelRatio.get();
  const emPx = Math.round(fontSize * props.mathScale * ratio * 10) / 10;
  const vaultVersion = useVaultVersion();
  const embeds = useEmbeds(blocks, notePath, vaultVersion);

  // Math from embedded notes is rendered together with the note's own math.
  const mathBlocks = useMemo(() => {
    const extra: Block[] = [];
    for (const r of embeds.map.values()) if (r.kind === 'note') extra.push(...r.blocks);
    return extra.length ? blocks.concat(extra) : blocks;
  }, [blocks, embeds]);

  const {images, version} = useMathImages(mathBlocks, props.session, emPx, props.preamble, props.onProgress);
  const [descent, setDescent] = useState(fontSize * 0.25 + (fontSize * LINE - fontSize * 1.17) / 2);
  const scroller = useRef<ScrollView>(null);
  const positions = useRef<number[]>([]);

  const scrollToIndex = (i: number) => {
    const y = positions.current[i];
    if (i >= 0 && typeof y === 'number' && scroller.current) scroller.current.scrollTo({y: Math.max(0, y - 8), animated: false});
  };

  const footnotesIndex = blocks.findIndex(b => b.type === 'footnotes');
  const actions = props.actions || {};

  const ctx: Ctx = useMemo(
    () => ({
      images,
      embeds: embeds.map,
      fontSize,
      ratio,
      descent,
      width: props.width - 32,
      emPx,
      notePath,
      embedDepth: 0,
      readOnly: false,
      actions,
      vaultVersion,
      onFootnote: () => scrollToIndex(footnotesIndex),
    }),
    // version forces a new context when images arrive
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [images, version, embeds, fontSize, ratio, descent, props.width, emPx, notePath, props.actions, vaultVersion, footnotesIndex],
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

  return (
    <ScrollView
      ref={scroller}
      style={{flex: 1, backgroundColor: PAPER}}
      contentContainerStyle={{padding: 16, paddingBottom: 80}}
      overScrollMode="never">
      {/* Invisible probe: measures where the baseline sits in a text line. */}
      <Text
        style={{position: 'absolute', opacity: 0, fontSize, lineHeight: Math.round(fontSize * LINE)}}
        onTextLayout={e => {
          const l = e.nativeEvent.lines && e.nativeEvent.lines[0];
          if (l && typeof l.descender === 'number' && l.descender > 0 && Math.abs(l.descender - descent) > 0.5) {
            setDescent(l.descender);
          }
        }}>
        Xg
      </Text>
      {props.header}
      {blocks.length === 0 ? <Text style={{fontSize, color: GRAY}}>Nothing to show yet. Type Markdown and TeX in the editor.</Text> : null}
      {blocks.map((b, i) => (
        <Pressable
          key={i + ':' + (b.line === undefined ? '' : b.line)}
          onLayout={e => {
            positions.current[i] = e.nativeEvent.layout.y;
          }}
          onLongPress={props.onJump && b.line !== undefined ? () => props.onJump!(b.line as number) : undefined}
          delayLongPress={450}>
          <BlockView block={b} ctx={ctx} depth={0} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  mathPending: {alignItems: 'center', paddingVertical: 8},
  mathSource: {fontFamily: MONO, color: GRAY, fontSize: 14},
  mathError: {borderWidth: 2, borderStyle: 'dashed', borderColor: INK, padding: 8, marginVertical: 6},
  mathErrorTitle: {fontWeight: '700', color: INK, marginBottom: 4},
  note: {fontSize: 12, color: GRAY, textAlign: 'center'},
  hint: {fontSize: 14, color: GRAY},
  code: {borderLeftWidth: 4, borderColor: INK, backgroundColor: FAINT, padding: 8, marginVertical: 6},
  quote: {borderLeftWidth: 4, borderColor: LIGHT, paddingLeft: 12, marginVertical: 6},
  box: {borderWidth: 2, borderColor: INK},
  cell: {paddingHorizontal: 8, paddingVertical: 4, borderColor: INK, justifyContent: 'flex-end'},
  embedBox: {borderWidth: 1, borderColor: INK, borderLeftWidth: 4, borderRadius: 2, padding: 8, marginVertical: 6},
});

export default React.memo(Preview);
