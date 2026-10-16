/**
 * Rendered view of a Markdown document with TeX math.
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
import type {Block, MathSession, PreviewImage, Run} from '../engine';
import {collectMath} from '../engine';
import {FAINT, GRAY, INK, LIGHT, MONO, PAPER} from './theme';

type Ctx = {
  images: Map<string, PreviewImage>;
  fontSize: number;
  ratio: number;
  descent: number; // baseline to bottom of a body text line (dp)
  width: number;
  emPx: number;
};

const LINE = 1.45;

function key(tex: string, display: boolean): string {
  return (display ? 'D|' : 'I|') + tex;
}

/* ------------------------------------------------------------------ */
/* Inline content                                                      */
/* ------------------------------------------------------------------ */

function runStyle(r: Run & {type: 'text'}, fontSize: number): TextStyle {
  const s: TextStyle = {};
  if (r.bold) s.fontWeight = '700';
  if (r.italic) s.fontStyle = 'italic';
  if (r.strike) s.textDecorationLine = 'line-through';
  if (r.href) s.textDecorationLine = r.strike ? 'underline line-through' : 'underline';
  if (r.code) {
    s.fontFamily = MONO;
    s.fontSize = fontSize * 0.9;
    s.backgroundColor = FAINT;
  }
  return s;
}

type Piece = {kind: 'text'; run: Run & {type: 'text'}; text: string};
type Item =
  | {kind: 'word'; pieces: Piece[]; spaceAfter: boolean}
  | {kind: 'math'; tex: string; spaceAfter: boolean}
  | {kind: 'break'};

/** Splits runs into words and formulas for the wrapping-row layout. */
function toItems(runs: Run[]): Item[] {
  const items: Item[] = [];
  let word: Piece[] = [];
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
      const parts = r.text.split(/(\s+)/);
      for (const p of parts) {
        if (!p) continue;
        if (/^\s+$/.test(p)) endWord(true);
        else word.push({kind: 'text', run: r, text: p});
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
        {'$' + tex + '$ ⚠'}
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

/** Text with optional inline math. */
function Runs(props: {runs: Run[]; ctx: Ctx; size?: number; style?: TextStyle}) {
  const {runs, ctx} = props;
  const size = props.size || ctx.fontSize;
  const base: TextStyle = {fontSize: size, lineHeight: Math.round(size * LINE), color: INK, ...(props.style || {})};
  const hasMath = runs.some(r => r.type === 'math');
  if (!hasMath) {
    return (
      <Text style={base} selectable={false}>
        {runs.map((r, i) =>
          r.type === 'break' ? (
            '\n'
          ) : r.type === 'text' ? (
            <Text key={i} style={runStyle(r, size)}>
              {r.text}
            </Text>
          ) : null,
        )}
      </Text>
    );
  }
  const scale = size / ctx.fontSize;
  const space = size * 0.28;
  const items = toItems(runs);
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
            const mr = it.kind !== 'break' && it.spaceAfter ? space : 0;
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
                    <Text key={j} style={runStyle(p.run, size)}>
                      {p.text}
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

const BlockView = React.memo(function BlockView(props: {block: Block; ctx: Ctx; depth: number}) {
  const {block, ctx} = props;
  const F = ctx.fontSize;
  switch (block.type) {
    case 'heading': {
      const sizes = [1.7, 1.45, 1.25, 1.1, 1.0, 0.95];
      const size = Math.round(F * sizes[Math.min(5, block.level - 1)]);
      return (
        <View style={{marginTop: F * (block.level <= 2 ? 0.9 : 0.6), marginBottom: F * 0.3}}>
          <Runs runs={block.runs} ctx={ctx} size={size} style={{fontWeight: '700'}} />
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
    case 'list':
      return (
        <View style={{marginVertical: F * 0.2}}>
          {block.items.map((it, i) => (
            <View key={i} style={{flexDirection: 'row', alignItems: 'flex-start'}}>
              <View style={{width: F * 1.8, alignItems: 'flex-end', paddingRight: F * 0.4, paddingTop: F * 0.35}}>
                {it.task !== undefined ? (
                  <View style={[styles.box, {width: F * 0.9, height: F * 0.9, marginTop: F * 0.2}]}>
                    {it.task ? <View style={{flex: 1, margin: 2, backgroundColor: INK}} /> : null}
                  </View>
                ) : (
                  <Text style={{fontSize: F, lineHeight: Math.round(F * LINE), color: INK}}>
                    {block.ordered ? block.start + i + '.' : props.depth % 2 ? '◦' : '•'}
                  </Text>
                )}
              </View>
              <View style={{flex: 1}}>
                {it.children.map((b, j) => (
                  <BlockView key={j} block={b} ctx={ctx} depth={props.depth + 1} />
                ))}
              </View>
            </View>
          ))}
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
/* Preview                                                             */
/* ------------------------------------------------------------------ */

function Preview(props: {
  blocks: Block[];
  session: MathSession;
  fontSize: number;
  mathScale: number;
  preamble: string;
  width: number;
  onJump?: (line: number) => void;
  onProgress?: (done: number, total: number) => void;
  header?: React.ReactNode;
}) {
  const {blocks, fontSize} = props;
  const ratio = PixelRatio.get();
  const emPx = Math.round(fontSize * props.mathScale * ratio * 10) / 10;
  const {images, version} = useMathImages(blocks, props.session, emPx, props.preamble, props.onProgress);
  const [descent, setDescent] = useState(fontSize * 0.25 + (fontSize * LINE - fontSize * 1.17) / 2);

  const ctx: Ctx = useMemo(
    () => ({images, fontSize, ratio, descent, width: props.width - 32, emPx}),
    // version forces a new context when images arrive
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [images, version, fontSize, ratio, descent, props.width, emPx],
  );

  return (
    <ScrollView style={{flex: 1, backgroundColor: PAPER}} contentContainerStyle={{padding: 16, paddingBottom: 80}} overScrollMode="never">
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
  code: {borderLeftWidth: 4, borderColor: INK, backgroundColor: FAINT, padding: 8, marginVertical: 6},
  quote: {borderLeftWidth: 4, borderColor: LIGHT, paddingLeft: 12, marginVertical: 6},
  box: {borderWidth: 2, borderColor: INK},
  cell: {paddingHorizontal: 8, paddingVertical: 4, borderColor: INK, justifyContent: 'flex-end'},
});

export default React.memo(Preview);
