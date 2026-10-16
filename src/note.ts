/**
 * Puts rendered formulas into the open NOTE page, and the lasso
 * "Render TeX" action.
 */
import {NativeUIUtils, PluginCommAPI, PluginNoteAPI} from 'sn-plugin-lib';
import {MathSession, stripDelimiters} from '../engine';
import {EXPORT_DIR, Settings, mkdirs, writeBase64} from './storage';

let shared: MathSession | null = null;

/** One rendering session for the whole plugin (shares the image cache). */
export function getSession(): MathSession {
  if (!shared) shared = new MathSession();
  return shared;
}

/** True when the plugin was opened from a NOTE file (images can be inserted). */
export async function isInNote(): Promise<boolean> {
  try {
    const res: any = await PluginCommAPI.getCurrentFilePath();
    const path = res && res.success ? String(res.result || '') : '';
    return /\.note$/i.test(path);
  } catch {
    return false;
  }
}

function escapeText(s: string): string {
  return s.replace(/[\\{}#%&_^~$]/g, c => (c === '\\' ? '\\backslash ' : c === '~' ? '\\sim ' : c === '^' ? '\\hat{}' : '\\' + c));
}

/**
 * Turns typed text into one TeX formula:
 * - no $ at all: the text is TeX already;
 * - "Area $A=\pi r^2$": prose becomes \text{...}, math stays math;
 * - a $$ block anywhere makes the result display style.
 */
export function textToTeX(input: string): {tex: string; display: boolean} {
  const src = String(input || '').trim();
  if (!/(^|[^\\])\$/.test(src)) return {tex: stripDelimiters(src), display: true};
  const parts: string[] = [];
  let display = false;
  const re = /\$\$([\s\S]+?)\$\$|\$((?:\\\$|[^$])+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const prose = src.slice(last, m.index);
    if (prose.trim()) parts.push('\\text{' + escapeText(prose.replace(/\s+/g, ' ')) + '}');
    else if (prose.length && parts.length) parts.push('\\ ');
    if (m[1] !== undefined) {
      display = true;
      parts.push('{\\displaystyle ' + m[1].trim() + '}');
    } else {
      parts.push('{' + m[2] + '}');
    }
    last = m.index + m[0].length;
  }
  const tail = src.slice(last);
  if (tail.trim()) parts.push('\\text{' + escapeText(tail.replace(/\s+/g, ' ')) + '}');
  // A single formula with no prose: return it as typed.
  const only = /^\s*(?:\$\$([\s\S]+?)\$\$|\$((?:\\\$|[^$])+?)\$)\s*$/.exec(src);
  if (only) return {tex: (only[1] !== undefined ? only[1] : only[2]).trim(), display: true};
  return {tex: parts.join(''), display: display || parts.length === 1};
}

export type InsertResult = {ok: boolean; message: string; path?: string};

/**
 * Renders TeX to a transparent PNG file in EXPORT/Mathdown.
 */
export async function writeFormulaImage(
  tex: string,
  display: boolean,
  settings: Settings,
  preamble?: string,
): Promise<InsertResult & {unsupportedText?: boolean; size?: string}> {
  const clean = tex.trim();
  if (!clean) return {ok: false, message: 'There is no formula to insert.'};
  const session = getSession();
  if (preamble !== undefined) session.setContext([], preamble);
  const img = session.forNote(clean, display, settings.insertEm, 300);
  if (!img.ok || !img.base64) return {ok: false, message: 'TeX error: ' + (img.error || 'cannot render')};
  if (!(await mkdirs(EXPORT_DIR))) return {ok: false, message: 'Cannot create ' + EXPORT_DIR + ' (write permission?).'};
  const stamp = new Date();
  const pad = (n: number) => (n < 10 ? '0' : '') + n;
  const name =
    'formula-' +
    stamp.getFullYear() +
    pad(stamp.getMonth() + 1) +
    pad(stamp.getDate()) +
    '-' +
    pad(stamp.getHours()) +
    pad(stamp.getMinutes()) +
    pad(stamp.getSeconds()) +
    '-' +
    Math.floor(Math.random() * 1000) +
    '.png';
  const path = EXPORT_DIR + '/' + name;
  try {
    await writeBase64(path, img.base64);
  } catch (e: any) {
    return {ok: false, message: String(e && e.message ? e.message : e)};
  }
  return {ok: true, message: '', path, unsupportedText: img.unsupportedText, size: img.width + ' × ' + img.height + ' px'};
}

/** Inserts an existing PNG file into the current layer of the current note page. */
export async function insertImageFile(path: string): Promise<InsertResult> {
  try {
    const res: any = await PluginNoteAPI.insertImage(path);
    if (!res || !res.success) {
      return {ok: false, message: 'insertImage failed: ' + ((res && res.error && res.error.message) || 'unknown error'), path};
    }
    return {ok: true, message: 'Inserted.', path};
  } catch (e: any) {
    return {ok: false, message: 'insertImage failed: ' + String(e && e.message ? e.message : e), path};
  }
}

/** Renders and inserts in one step. */
export async function insertFormula(tex: string, display: boolean, settings: Settings, preamble?: string): Promise<InsertResult> {
  const file = await writeFormulaImage(tex, display, settings, preamble);
  if (!file.ok || !file.path) return file;
  const ins = await insertImageFile(file.path);
  if (!ins.ok) return ins;
  return {
    ok: true,
    path: file.path,
    message: 'Inserted (' + file.size + ')' + (file.unsupportedText ? '. Some characters have no glyph and show as boxes.' : '.'),
  };
}

/**
 * Lasso button: render the selected text box(es) as one formula image.
 * Runs without the plugin UI, so messages use the system dialog.
 */
export async function renderLassoSelection(settings: Settings): Promise<void> {
  const say = (msg: string, ok: boolean) => {
    try {
      NativeUIUtils.showRattaDialog(msg, '', 'OK', ok);
    } catch {
      // no dialog available
    }
  };
  try {
    const res: any = await PluginNoteAPI.getLassoText();
    const boxes: any[] = res && res.success && Array.isArray(res.result) ? res.result : [];
    const text = boxes
      .map(b => (b && b.textContentFull) || '')
      .filter(Boolean)
      .join('\n');
    if (!text.trim()) {
      say('Mathdown: select a text box that contains TeX, then tap Render TeX.', false);
      return;
    }
    const {tex, display} = textToTeX(text);
    // Render and save first, so that a TeX error never removes the text.
    const file = await writeFormulaImage(tex, display, settings, settings.preamble);
    if (!file.ok || !file.path) {
      say('Mathdown: ' + file.message, false);
      return;
    }
    if (settings.removeTextAfterRender) {
      // Remove the text box before the insert: after the insert, the lasso
      // selection may hold the new image instead.
      try {
        await PluginCommAPI.deleteLassoElements();
      } catch {
        // keep the text if it cannot be removed
      }
    }
    const ins = await insertImageFile(file.path);
    if (!ins.ok) say('Mathdown: ' + ins.message + '\nThe image is saved at ' + file.path, false);
  } catch (e: any) {
    say('Mathdown: ' + String(e && e.message ? e.message : e), false);
  }
}
