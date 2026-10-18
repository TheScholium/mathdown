/**
 * Mathdown: a Markdown + TeX editor plugin for Supernote (NOTE and DOC).
 *
 * Screens: editor (Edit / Split / View), file browser, settings.
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Keyboard,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TextInputSelectionChangeEventData,
  View,
} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import type {LinkTarget} from './engine';
import {mathAtOffset, newNotePath, parseMarkdown} from './engine';
import FileBrowser from './src/FileBrowser';
import Preview, {PreviewActions} from './src/Preview';
import SettingsScreen from './src/SettingsScreen';
import {on} from './src/bus';
import {getSession, insertFormula, isInNote, textToTeX} from './src/note';
import {SNIPPET_GROUPS, applySnippet} from './src/snippets';
import {
  DEFAULT_SETTINGS,
  Settings,
  basename,
  canWrite,
  exists,
  loadDraft,
  loadRecent,
  loadSettings,
  mkdirs,
  pushRecent,
  readText,
  saveDraft,
  saveSettings,
  writeText,
} from './src/storage';
import {FALLBACK_FONTS, Fonts, loadFonts} from './src/fonts';
import {DEFAULT_THEME, ThemeProvider, makeTheme, paletteOf, track} from './src/theme';
import {Button, Confirm, ConfirmSpec, Prompt, Segmented} from './src/ui';
import {getVault, invalidateNote, refreshVault, resolve} from './src/vault';
import {WELCOME} from './src/welcome';

type Mode = 'edit' | 'split' | 'view';
type Screen = 'editor' | 'files' | 'settings';
type Sel = {start: number; end: number};

const HISTORY_LIMIT = 200;
const BACK_LIMIT = 50;

/** Toggles "- [ ]" / "- [x]" on one source line (also inside "> " quotes and callouts). */
export function toggleTaskLine(text: string, line: number): string | null {
  const lines = text.split('\n');
  const l = lines[line];
  if (l === undefined) return null;
  const m = /^((?:\s*>)*\s*(?:[-*+]|\d+[.)])\s+)\[(.)\]/.exec(l);
  if (!m) return null;
  lines[line] = m[1] + '[' + (m[2] === ' ' ? 'x' : ' ') + ']' + l.slice(m[0].length);
  return lines.join('\n');
}

function lineOffset(text: string, line: number): number {
  let off = 0;
  for (let i = 0; i < line; i++) {
    const n = text.indexOf('\n', off);
    if (n < 0) return text.length;
    off = n + 1;
  }
  return off;
}

function timeNow(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? '0' : '') + n;
  return p(d.getHours()) + ':' + p(d.getMinutes());
}

function errText(e: any): string {
  return String(e && e.message ? e.message : e);
}

function App(): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('editor');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [path, setPath] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<Mode>('split');
  const [previewSource, setPreviewSource] = useState('');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [inNote, setInNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [group, setGroup] = useState(0);
  const [showSnippets, setShowSnippets] = useState(true);
  const [forcedSel, setForcedSel] = useState<Sel | undefined>(undefined);
  const [confirm, setConfirm] = useState<ConfirmSpec>(null);
  const [savePrompt, setSavePrompt] = useState<null | {then?: () => void}>(null);
  const [kbHeight, setKbHeight] = useState(0);
  const [layoutH, setLayoutH] = useState(0);
  const [maxH, setMaxH] = useState(0);
  const [width, setWidth] = useState(700);
  const [history, setHistory] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<{sub: string; nonce: number} | null>(null);
  const [fonts, setFonts] = useState<Fonts>(FALLBACK_FONTS);
  const theme = useMemo(() => makeTheme(paletteOf(settings.theme), fonts), [settings.theme, fonts]);
  const {S, p: pal, f: face} = theme;

  const sel = useRef<Sel>({start: 0, end: 0});
  const editor = useRef<TextInput>(null);
  const undo = useRef<{text: string; sel: Sel}[]>([]);
  const redo = useRef<{text: string; sel: Sel}[]>([]);
  const lastSnap = useRef(0);
  const textRef = useRef(text);
  textRef.current = text;
  const stateRef = useRef({path, dirty});
  stateRef.current = {path, dirty};

  const session = useMemo(() => getSession(), []);

  /* ---------------- start-up ---------------- */

  useEffect(() => {
    (async () => {
      // The fonts are registered before any text uses them.
      const [s, ft] = await Promise.all([loadSettings(), loadFonts()]);
      setFonts(ft);
      setSettings(s);
      refreshVault(s.vaultDir);
      setMode(s.autoPreview ? 'split' : 'edit');
      const draft = await loadDraft();
      if (draft && (draft.dirty || draft.path)) {
        let restored = false;
        if (draft.dirty) {
          setPath(draft.path);
          setText(draft.text);
          setDirty(true);
          setPreviewSource(draft.text);
          setStatus('Restored unsaved changes' + (draft.path ? ' to ' + basename(draft.path) : ''));
          restored = true;
        } else if (draft.path && (await exists(draft.path).catch(() => false))) {
          try {
            const t = await readText(draft.path);
            setPath(draft.path);
            setText(t);
            setPreviewSource(t);
            restored = true;
          } catch (e) {
            setStatus('Could not reopen ' + basename(draft.path) + ': ' + errText(e));
          }
        }
        if (!restored) {
          setText(WELCOME);
          setPreviewSource(WELCOME);
        }
      } else {
        const recent = await loadRecent();
        if (!recent.length) {
          setText(WELCOME);
          setPreviewSource(WELCOME);
          setMode('view');
        } else {
          setText('');
          setPreviewSource('');
        }
      }
      setInNote(await isInNote());
      setReady(true);
    })();
  }, []);

  useEffect(() => on('open-settings', () => setScreen('settings')), []);
  useEffect(
    () =>
      on('ui-shown', async () => {
        setInNote(await isInNote());
      }),
    [],
  );
  useEffect(
    () =>
      on('ui-hidden', () => {
        const st = stateRef.current;
        saveDraft({path: st.path, text: textRef.current, dirty: st.dirty, savedAt: Date.now(), selection: sel.current.start});
      }),
    [],
  );

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', e => setKbHeight(e.endCoordinates.height));
    const b = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);

  const onRootLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setLayoutH(h);
    setWidth(e.nativeEvent.layout.width);
    if (h > maxH) setMaxH(h);
  };
  // If the host already shrank our view for the keyboard, do not pad twice.
  const kbPad = Math.max(0, kbHeight - Math.max(0, maxH - layoutH));

  /* ---------------- draft auto-save ---------------- */

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      if (settings.autoSave && path && dirty && canWrite()) {
        writeTo(path, true);
      } else {
        saveDraft({path, text, dirty, savedAt: Date.now(), selection: sel.current.start});
      }
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, path, dirty, ready, settings.autoSave]);

  /* ---------------- live preview ---------------- */

  useEffect(() => {
    if (mode === 'edit') return;
    if (mode === 'view') {
      setPreviewSource(text);
      return;
    }
    if (!settings.autoPreview) return;
    const t = setTimeout(() => setPreviewSource(text), settings.previewDelayMs);
    return () => clearTimeout(t);
  }, [text, mode, settings.autoPreview, settings.previewDelayMs]);

  const blocks = useMemo(() => parseMarkdown(previewSource), [previewSource]);

  /* ---------------- editing ---------------- */

  const snapshot = (force: boolean) => {
    const now = Date.now();
    if (!force && now - lastSnap.current < 1200) return;
    lastSnap.current = now;
    const stack = undo.current;
    if (stack.length && stack[stack.length - 1].text === textRef.current) return;
    stack.push({text: textRef.current, sel: {...sel.current}});
    if (stack.length > HISTORY_LIMIT) stack.shift();
    redo.current = [];
  };

  const onChangeText = (t: string) => {
    snapshot(false);
    setText(t);
    setDirty(true);
  };

  const onSelectionChange = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    sel.current = e.nativeEvent.selection;
    if (forcedSel) setForcedSel(undefined);
  };

  const placeCursor = (start: number, end?: number) => {
    const s = {start, end: end === undefined ? start : end};
    sel.current = s;
    setForcedSel(s);
    setTimeout(() => editor.current && editor.current.focus(), 30);
  };

  const insertSnippet = (snippet: string) => {
    snapshot(true);
    // Front matter is valid only at the top of the file.
    if (snippet.startsWith('---\n')) {
      if (/^---[ \t]*\r?\n/.test(textRef.current)) {
        setStatus('This note already has properties.');
        return;
      }
      const r0 = applySnippet(textRef.current, {start: 0, end: 0}, snippet);
      setText(r0.text);
      setDirty(true);
      placeCursor(r0.cursor);
      return;
    }
    const r = applySnippet(textRef.current, sel.current, snippet);
    setText(r.text);
    setDirty(true);
    placeCursor(r.cursor, r.selectionEnd);
  };

  const doUndo = () => {
    const prev = undo.current.pop();
    if (!prev) return;
    redo.current.push({text: textRef.current, sel: {...sel.current}});
    setText(prev.text);
    setDirty(true);
    placeCursor(prev.sel.start, prev.sel.end);
  };

  const doRedo = () => {
    const next = redo.current.pop();
    if (!next) return;
    undo.current.push({text: textRef.current, sel: {...sel.current}});
    setText(next.text);
    setDirty(true);
    placeCursor(next.sel.start, next.sel.end);
  };

  /* ---------------- files ---------------- */

  const writeTo = async (target: string, quiet = false, content?: string) => {
    if (!quiet) setBusy(true);
    const written = content !== undefined ? content : textRef.current;
    try {
      const isNew = !getVault() || !getVault()!.byPath.has(target);
      await writeText(target, written);
      setPath(target);
      // Typing during the write keeps the note dirty.
      setDirty(textRef.current !== written);
      if (!quiet) setStatus('Saved ' + basename(target) + ' at ' + timeNow());
      invalidateNote(target);
      if (isNew) refreshVault(settings.vaultDir);
      await pushRecent(target);
      saveDraft({path: target, text: written, dirty: false, savedAt: Date.now()});
      return true;
    } catch (e) {
      setStatus('Save failed: ' + errText(e));
      return false;
    } finally {
      if (!quiet) setBusy(false);
    }
  };

  const save = async (then?: () => void) => {
    if (!canWrite()) {
      setStatus('Saving is not available: the file module did not load.');
      return;
    }
    if (!path) {
      setSavePrompt({then});
      return;
    }
    if (await writeTo(path)) then && then();
  };

  const onSaveAs = async (name: string, then?: () => void) => {
    setSavePrompt(null);
    const clean = name.replace(/[\\/:*?"<>|]/g, '-').replace(/\.(md|markdown|txt)$/i, '').trim() || 'Untitled';
    await mkdirs(settings.vaultDir);
    const target = settings.vaultDir + '/' + clean + '.md';
    const go = async () => {
      if (await writeTo(target)) then && then();
    };
    if (await exists(target)) {
      setConfirm({
        title: '"' + clean + '.md" exists',
        message: 'Replace it with this note?',
        buttons: [
          {label: 'Cancel', onPress: () => {}},
          {label: 'Replace', onPress: go},
        ],
      });
    } else {
      go();
    }
  };

  /** Runs `action` after the user saves or discards unsaved changes. */
  const guardUnsaved = (action: () => void) => {
    if (!dirty || !textRef.current.trim()) {
      action();
      return;
    }
    setConfirm({
      title: 'Save changes to ' + (path ? basename(path) : 'this note') + '?',
      buttons: [
        {label: 'Cancel', onPress: () => {}},
        {label: 'Discard', onPress: action},
        {label: 'Save', onPress: () => save(action)},
      ],
    });
  };

  /**
   * Runs `action` when it is safe to leave the current note: a note that has
   * a file is saved without asking (like Obsidian); an untitled one asks.
   */
  const leaveThen = (action: () => void) => {
    if (!dirty || !textRef.current.trim()) {
      action();
    } else if (path && canWrite()) {
      writeTo(path, true).then(ok => ok && action());
    } else {
      guardUnsaved(action);
    }
  };

  const openFile = async (p: string, opts?: {push?: boolean; sub?: string | null}) => {
    try {
      const t = await readText(p);
      if (opts && opts.push && path && path !== p) setHistory(h => h.concat(path).slice(-BACK_LIMIT));
      setAnchor(opts && opts.sub ? {sub: opts.sub, nonce: Date.now()} : null);
      setPath(p);
      setText(t);
      textRef.current = t;
      setPreviewSource(t);
      setDirty(false);
      undo.current = [];
      redo.current = [];
      setScreen('editor');
      setStatus('Opened ' + basename(p));
      await pushRecent(p);
      saveDraft({path: p, text: t, dirty: false, savedAt: Date.now()});
    } catch (e) {
      setStatus('Could not open: ' + errText(e));
      setScreen('editor');
    }
  };

  const newFile = async (p: string, opts?: {push?: boolean; empty?: boolean}) => {
    const title = basename(p).replace(/\.md$/i, '');
    // With the inline title, the file name is the title (as in Obsidian): start empty.
    const t = (opts && opts.empty) || settings.inlineTitle ? '' : '# ' + title + '\n\n';
    if (opts && opts.push && path && path !== p) setHistory(h => h.concat(path).slice(-BACK_LIMIT));
    setAnchor(null);
    setPath(p);
    setText(t);
    setPreviewSource(t);
    setDirty(true);
    undo.current = [];
    redo.current = [];
    setScreen('editor');
    setMode(m => (m === 'view' ? 'split' : m));
    // textRef updates only on the next render, so pass the new text explicitly.
    textRef.current = t;
    if (await writeTo(p, false, t)) placeCursor(t.length);
  };

  /* ---------------- links ---------------- */

  const goBack = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    leaveThen(() => {
      setHistory(h => h.slice(0, -1));
      openFile(prev);
    });
  };

  const onLink = (target: LinkTarget, fromPath: string | null) => {
    const entry = target.page ? resolve(target, fromPath) : null;
    // A link to a heading or block in this note: scroll there.
    if (!target.page || (entry && entry.path === path)) {
      if (target.sub) {
        setAnchor({sub: target.sub, nonce: Date.now()});
        setPreviewSource(textRef.current);
        setMode(m => (m === 'edit' ? 'view' : m));
      }
      return;
    }
    if (entry && entry.isNote) {
      leaveThen(() => openFile(entry.path, {push: true, sub: target.sub}));
      return;
    }
    if (entry) {
      setStatus('Attachment: ' + entry.rel);
      return;
    }
    const vault = getVault();
    if (!vault) {
      setStatus('The vault is still loading. Try again in a moment.');
      return;
    }
    if (/\.[A-Za-z0-9]{1,6}$/.test(target.page) && !/\.md$/i.test(target.page)) {
      setStatus('Not found in the vault: ' + target.page);
      return;
    }
    const p = newNotePath(vault, target.page);
    setConfirm({
      title: 'Create "' + basename(p).replace(/\.md$/i, '') + '"?',
      message: 'No note with this name exists. Mathdown creates it in ' + vault.root.replace('/storage/emulated/0/', '') + '.',
      buttons: [
        {label: 'Cancel', onPress: () => {}},
        {label: 'Create', onPress: () => leaveThen(() => newFile(p, {push: true, empty: true}))},
      ],
    });
  };

  const onToggleTask = (line: number) => {
    if (textRef.current !== previewSource) {
      setPreviewSource(textRef.current);
      setStatus('The preview was out of date. Tap the box again.');
      return;
    }
    const next = toggleTaskLine(textRef.current, line);
    if (next === null) return;
    snapshot(true);
    setText(next);
    setPreviewSource(next);
    setDirty(true);
  };

  // Stable callbacks for the preview, so that it does not re-render on every key stroke.
  const handlers = useRef({onLink, onToggleTask});
  handlers.current = {onLink, onToggleTask};
  const actions: PreviewActions = useMemo(
    () => ({
      onLink: (t, from) => handlers.current.onLink(t, from),
      onToggleTask: line => handlers.current.onToggleTask(line),
      onTag: tag => setStatus('#' + tag + ': tag search is not in Mathdown yet.'),
      onExternal: href => setStatus('Link: ' + href + ' (Mathdown has no internet access.)'),
    }),
    [],
  );

  /* ---------------- note insertion ---------------- */

  const formulaForInsert = (): {tex: string; display: boolean} | null => {
    const t = textRef.current;
    const {start, end} = sel.current;
    if (end > start) return textToTeX(t.slice(start, end));
    const m = mathAtOffset(t, start);
    return m ? {tex: m.tex, display: m.display} : null;
  };

  const doInsert = async () => {
    if (!inNote) {
      setStatus('Open Mathdown from a NOTE file to insert formulas. (DOC files cannot hold images.)');
      return;
    }
    const f = formulaForInsert();
    if (!f) {
      setStatus('Put the cursor inside a formula, or select TeX, then tap Insert.');
      return;
    }
    setBusy(true);
    setStatus('Rendering formula…');
    try {
      session.setContext(parseMarkdown(textRef.current), settings.preamble);
      const res = await insertFormula(f.tex, f.display, settings);
      setStatus(res.message);
      if (res.ok && settings.closeAfterInsert) {
        await saveDraft({path, text: textRef.current, dirty, savedAt: Date.now(), selection: sel.current.start});
        PluginManager.closePluginView();
      }
    } catch (e) {
      setStatus('Insert failed: ' + errText(e));
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    await saveDraft({path, text: textRef.current, dirty, savedAt: Date.now(), selection: sel.current.start});
    PluginManager.closePluginView();
  };

  const onProgress = useCallback((d: number, t: number) => {
    setProgress(prev => (prev[0] === d && prev[1] === t ? prev : [d, t]));
  }, []);

  const jumpTo = useCallback(
    (line: number) => {
      const off = lineOffset(textRef.current, line);
      setMode(m => (m === 'view' ? 'edit' : m));
      placeCursor(off);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /* ---------------- screens ---------------- */

  if (!ready) {
    // No custom fonts here: they are not registered yet.
    const d = DEFAULT_THEME.p;
    return (
      <View style={{flex: 1, backgroundColor: d.bg, justifyContent: 'center', alignItems: 'center'}}>
        <StatusBar barStyle="dark-content" backgroundColor={d.bg} />
        <Text style={{fontFamily: 'serif', fontSize: 26, color: d.bright, fontStyle: 'italic'}}>Mathdown</Text>
        <Text style={{fontFamily: 'serif', fontSize: 15, color: d.faint}}>Loading…</Text>
      </View>
    );
  }

  const statusBar = <StatusBar barStyle={pal.dark ? 'light-content' : 'dark-content'} backgroundColor={pal.bg0} />;

  if (screen === 'files') {
    return (
      <ThemeProvider theme={theme}>
        {statusBar}
      <FileBrowser
        root={settings.vaultDir}
        currentPath={path}
        canWrite={canWrite()}
        onClose={() => setScreen('editor')}
        onOpen={p => leaveThen(() => openFile(p, {push: true}))}
        onNew={p => leaveThen(() => newFile(p, {push: true}))}
        onRenamed={(from, to) => {
          if (from === path) setPath(to);
          setHistory(h => h.map(x => (x === from ? to : x)));
          refreshVault(settings.vaultDir);
        }}
        onDeleted={p => {
          setHistory(h => h.filter(x => x !== p));
          refreshVault(settings.vaultDir);
          if (p === path) {
            setPath(null);
            setDirty(true);
            setStatus('The open note was deleted; its text is still here.');
          }
        }}
      />
      </ThemeProvider>
    );
  }

  if (screen === 'settings') {
    return (
      <ThemeProvider theme={theme}>
        {statusBar}
      <SettingsScreen
        settings={settings}
        onClose={() => setScreen('editor')}
        onSave={async s => {
          if (s.vaultDir !== settings.vaultDir) refreshVault(s.vaultDir);
          setSettings(s);
          setScreen('editor');
          const ok = await saveSettings(s);
          setStatus(ok ? 'Settings saved.' : 'Settings are active but could not be stored.');
        }}
      />
      </ThemeProvider>
    );
  }

  const noteName = path ? basename(path).replace(/\.md$/i, '') : 'Untitled';
  const folder = path ? path.slice(0, path.lastIndexOf('/')) : '';
  const crumb = path && folder !== settings.vaultDir && folder.startsWith(settings.vaultDir + '/') ? folder.slice(settings.vaultDir.length + 1).replace(/\//g, ' › ') + ' › ' : '';
  const words = (text.match(/\S+/g) || []).length;
  const editorFont = settings.fontSize;

  const editorView = (
    <TextInput
      ref={editor}
      style={{
        flex: 1,
        fontFamily: settings.editorFont === 'mono' ? face.mono : face.serif,
        fontSize: settings.editorFont === 'mono' ? Math.round(editorFont * 0.9) : editorFont,
        lineHeight: Math.round(editorFont * 1.5),
        color: pal.text,
        paddingHorizontal: 16,
        paddingVertical: 12,
        textAlignVertical: 'top',
        backgroundColor: pal.bg,
      }}
      cursorColor={pal.gold}
      selectionColor={pal.highlight}
      value={text}
      onChangeText={onChangeText}
      onSelectionChange={onSelectionChange}
      selection={forcedSel}
      multiline
      scrollEnabled
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      keyboardType="default"
      importantForAutofill="no"
      placeholder="Type Markdown here. Math: $x^2$ or $$ … $$"
      placeholderTextColor={pal.faint}
      underlineColorAndroid="transparent"
      textBreakStrategy="simple"
    />
  );

  const previewView = (
    <Preview
      blocks={blocks}
      session={session}
      fontSize={settings.fontSize}
      mathScale={settings.mathScale}
      preamble={settings.preamble}
      width={width}
      notePath={path}
      title={settings.inlineTitle && path ? noteName : null}
      sidenotes={settings.sidenotes}
      actions={actions}
      anchor={anchor}
      onJump={jumpTo}
      onProgress={onProgress}
    />
  );

  const snippetBar =
    mode !== 'view' && showSnippets ? (
      <View style={{borderTopWidth: 1, borderColor: pal.rule, backgroundColor: pal.bg0}}>
        <ScrollView horizontal keyboardShouldPersistTaps="always" overScrollMode="never" showsHorizontalScrollIndicator={false}>
          <View style={[S.row, {paddingHorizontal: 4, paddingTop: 4}]}>
            {SNIPPET_GROUPS.map((g, i) => (
              <Button key={g.name} small label={g.name} active={i === group} onPress={() => setGroup(i)} />
            ))}
          </View>
        </ScrollView>
        <ScrollView horizontal keyboardShouldPersistTaps="always" overScrollMode="never">
          <View style={[S.row, {padding: 4}]}>
            {SNIPPET_GROUPS[group].items.map(it => (
              <Button key={it.label + it.insert} small plain label={it.label} onPress={() => insertSnippet(it.insert)} />
            ))}
          </View>
        </ScrollView>
      </View>
    ) : null;

  return (
    <ThemeProvider theme={theme}>
    <View style={[S.fill, {paddingBottom: kbPad}]} onLayout={onRootLayout}>
      {statusBar}
      {/* Top bar */}
      <View style={S.bar}>
        <Button label="Files" icon="istari-codex" onPress={() => setScreen('files')} />
        <View style={{flex: 1}} />
        <Segmented<Mode>
          value={mode}
          onChange={m => {
            setMode(m);
            if (m !== 'edit') setPreviewSource(textRef.current);
          }}
          options={[
            {value: 'edit', label: 'Edit'},
            {value: 'split', label: 'Split'},
            {value: 'view', label: 'View'},
          ]}
        />
        <Button label="Save" disabled={busy || (!dirty && !!path)} onPress={() => save()} />
        <Button label="Insert ∑" disabled={busy} onPress={doInsert} />
        <Button label="Settings" icon="istari-key" iconOnly onPress={() => setScreen('settings')} />
        <Button label="Close" icon="lucide-x" iconOnly onPress={() => leaveThen(close)} />
      </View>

      {/* Second bar */}
      <View style={[S.row, {paddingHorizontal: 6, paddingVertical: 3, borderBottomWidth: 1, borderColor: pal.rule, backgroundColor: pal.bg0}]}>
        {history.length ? <Button small label="Back" icon="lucide-arrow-left" onPress={goBack} /> : null}
        {/* Istari view header: the note's path as a small-caps breadcrumb */}
        <Text style={[S.barTitle, {fontSize: 17, marginHorizontal: 6}]} numberOfLines={1} ellipsizeMode="head" testID="note-title">
          <Text style={{color: pal.faint}}>{crumb}</Text>
          {noteName}
          {dirty ? <Text style={{color: pal.gold}}>{' •'}</Text> : null}
        </Text>
        {mode !== 'view' ? (
          <>
            <Button small label="Undo" onPress={doUndo} />
            <Button small label="Redo" onPress={doRedo} />
            <Button small label="Symbols" active={showSnippets} onPress={() => setShowSnippets(v => !v)} />
          </>
        ) : null}
        {mode !== 'edit' ? <Button small label="Render" onPress={() => setPreviewSource(textRef.current)} /> : null}
        <Button
          small
          label="Help"
          icon="istari-scroll"
          onPress={() =>
            leaveThen(() => {
              if (path) setHistory(h => h.concat(path).slice(-BACK_LIMIT));
              setPath(null);
              setText(WELCOME);
              setPreviewSource(WELCOME);
              setDirty(false);
              setMode('view');
            })
          }
        />
        <Text style={[S.status, {marginHorizontal: 6}]} numberOfLines={1}>
          {progress[1] ? 'rendering ' + progress[0] + '/' + progress[1] + ' · ' : ''}
          {words} words
        </Text>
      </View>

      {!canWrite() ? (
        <View style={S.banner}>
          <Text style={S.bannerText}>
            File module not loaded: you can read and preview, but not save. Reinstall mathdown.snplg.
          </Text>
        </View>
      ) : null}

      {/* Body */}
      <View style={{flex: 1}}>
        {mode === 'edit' ? editorView : null}
        {mode === 'view' ? previewView : null}
        {mode === 'split' ? (
          <>
            <View style={{flex: 1}}>{editorView}</View>
            <View style={{height: 1, backgroundColor: pal.goldDim}} />
            <View style={{flex: 1}}>{previewView}</View>
          </>
        ) : null}
      </View>

      {snippetBar}

      {/* Status line */}
      {status ? (
        <View style={{borderTopWidth: 1, borderColor: pal.rule, backgroundColor: pal.bg0, paddingHorizontal: 12, paddingVertical: 5, flexDirection: 'row', alignItems: 'center'}}>
          <Text style={[S.bannerText, {flex: 1, fontStyle: 'italic', color: pal.muted, letterSpacing: track(16, 0.005)}]} numberOfLines={2}>
            {status}
          </Text>
          <Button small label="OK" onPress={() => setStatus('')} />
        </View>
      ) : null}

      <Prompt
        visible={!!savePrompt}
        title="Save note as"
        message={'In ' + settings.vaultDir.replace('/storage/emulated/0/', '') + ' (".md" is added).'}
        initial={(() => {
          const h = /^#\s+(.+)$/m.exec(text);
          return h ? h[1].replace(/\$[^$]*\$/g, '').trim().slice(0, 60) : '';
        })()}
        okLabel="Save"
        onOk={v => onSaveAs(v, savePrompt ? savePrompt.then : undefined)}
        onCancel={() => setSavePrompt(null)}
      />
      <Confirm spec={confirm} onClose={() => setConfirm(null)} />
    </View>
    </ThemeProvider>
  );
}

export default App;
