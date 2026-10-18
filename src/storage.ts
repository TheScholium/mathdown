/**
 * Files, permissions, settings and the auto-saved draft.
 *
 * - Text and PNG writes go through the plugin's native module
 *   (android/.../MathdownFilesModule.java), because sn-plugin-lib has no
 *   "write file" call.
 * - Shared storage (Document, EXPORT, ...) needs the Supernote plugin
 *   permissions FILE:READ / FILE:WRITE / FILE:DELETE. They are declared in
 *   PluginConfig.json and asked for just before use, as the SDK requires.
 * - Settings and the draft live in the plugin's private folder, which needs
 *   no permission.
 */
import {NativeModules, TurboModuleRegistry} from 'react-native';
import {FileUtils, PluginManager} from 'sn-plugin-lib';

export const STORAGE_ROOT = '/storage/emulated/0';
export const DEFAULT_VAULT = STORAGE_ROOT + '/Document/Mathdown';
export const EXPORT_DIR = STORAGE_ROOT + '/EXPORT/Mathdown';

type NativeFiles = {
  version(): Promise<string>;
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<boolean>;
  writeBase64(path: string, data: string): Promise<boolean>;
  exists(path: string): Promise<boolean>;
  mkdirs(path: string): Promise<boolean>;
  listDir(path: string): Promise<FileEntry[]>;
  listTree?(root: string, maxFiles: number): Promise<TreeEntry[]>;
  rename(from: string, to: string): Promise<boolean>;
  deleteFile(path: string): Promise<boolean>;
};

export type FileEntry = {name: string; path: string; isDir: boolean; size: number; modified: number};
export type TreeEntry = {path: string; rel: string; name: string; size: number; modified: number};

function nativeFiles(): NativeFiles | null {
  const m = (NativeModules as any).MathdownFiles;
  if (m) return m as NativeFiles;
  try {
    return (TurboModuleRegistry.get('MathdownFiles') as any) || null;
  } catch {
    return null;
  }
}

/** True when the native file module is loaded (saving works). */
export function canWrite(): boolean {
  return !!nativeFiles();
}

/* ------------------------------------------------------------------ */
/* Permissions                                                         */
/* ------------------------------------------------------------------ */

export type Perm = 'READ' | 'WRITE' | 'DELETE';
const granted: {[k in Perm]?: boolean} = {};

/**
 * Checks and, if needed, asks for a Supernote file permission.
 * "Allow this time only" lasts for the current plugin session, so this is
 * called before every file operation (the check is fast once granted).
 */
export async function ensurePermission(kind: Perm): Promise<boolean> {
  const name = 'plugin.permission.FILE:' + kind;
  try {
    const has = await PluginManager.hasPermission(name);
    if (has === 1) {
      granted[kind] = true;
      return true;
    }
    const desc =
      kind === 'READ'
        ? 'Mathdown reads your Markdown notes in the Document folder.'
        : kind === 'WRITE'
        ? 'Mathdown saves Markdown notes and rendered formula images.'
        : 'Mathdown deletes the note you selected.';
    const res = await PluginManager.requestPermission(name, desc);
    const ok = res === 1 || res === 2;
    granted[kind] = ok;
    return ok;
  } catch (e) {
    // Older firmware without the permission system: try the operation anyway.
    return true;
  }
}

/** Forget cached grants (called when the plugin UI is hidden). */
export function resetPermissionCache() {
  (Object.keys(granted) as Perm[]).forEach(k => delete granted[k]);
}

function isShared(path: string): boolean {
  return path.startsWith('/storage/') || path.startsWith('/sdcard') || path.startsWith('/mnt/');
}

/* ------------------------------------------------------------------ */
/* File operations                                                     */
/* ------------------------------------------------------------------ */

export class FileError extends Error {}

function need(): NativeFiles {
  const m = nativeFiles();
  if (!m) throw new FileError('The Mathdown file module is not loaded. Reinstall the plugin package.');
  return m;
}

export async function readText(path: string): Promise<string> {
  if (isShared(path) && !(await ensurePermission('READ'))) throw new FileError('Read permission was not given.');
  const m = nativeFiles();
  if (m) return m.readText(path);
  // Fallback without the native module: React Native can read file:// as a blob.
  const res = await fetch('file://' + path);
  return await res.text();
}

export async function writeText(path: string, text: string): Promise<void> {
  if (isShared(path) && !(await ensurePermission('WRITE'))) throw new FileError('Write permission was not given.');
  await need().writeText(path, text);
}

export async function writeBase64(path: string, data: string): Promise<void> {
  if (isShared(path) && !(await ensurePermission('WRITE'))) throw new FileError('Write permission was not given.');
  await need().writeBase64(path, data);
}

export async function exists(path: string): Promise<boolean> {
  const m = nativeFiles();
  if (m) return m.exists(path);
  return FileUtils.exists(path);
}

export async function mkdirs(path: string): Promise<boolean> {
  if (isShared(path) && !(await ensurePermission('WRITE'))) return false;
  const m = nativeFiles();
  if (m) return m.mkdirs(path);
  return FileUtils.makeDir(path);
}

export async function listDir(path: string): Promise<FileEntry[]> {
  if (isShared(path) && !(await ensurePermission('READ'))) throw new FileError('Read permission was not given.');
  const m = nativeFiles();
  if (m) return (await m.listDir(path)) || [];
  const list = (await FileUtils.listFiles(path)) || [];
  return list.map(p => ({name: p.split('/').pop() || p, path: p, isDir: !/\.[A-Za-z0-9]+$/.test(p), size: 0, modified: 0}));
}

/**
 * Lists every file under a folder (hidden folders such as .obsidian are
 * skipped). Uses the native walker; falls back to listDir in JavaScript.
 */
export async function listTree(root: string, maxFiles = 20000): Promise<TreeEntry[]> {
  if (isShared(root) && !(await ensurePermission('READ'))) throw new FileError('Read permission was not given.');
  const m = nativeFiles();
  if (m && typeof m.listTree === 'function') return (await m.listTree(root, maxFiles)) || [];
  const out: TreeEntry[] = [];
  const base = root.replace(/\/+$/, '');
  const walk = async (dir: string, depth: number) => {
    if (depth > 12 || out.length >= maxFiles) return;
    let entries: FileEntry[] = [];
    try {
      entries = await listDir(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      if (e.isDir) await walk(e.path, depth + 1);
      else out.push({path: e.path, rel: e.path.slice(base.length + 1), name: e.name, size: e.size, modified: e.modified});
      if (out.length >= maxFiles) return;
    }
  };
  await walk(base, 0);
  return out;
}

export async function renameFile(from: string, to: string): Promise<void> {
  if (isShared(from) && !(await ensurePermission('WRITE'))) throw new FileError('Write permission was not given.');
  const ok = await need().rename(from, to);
  if (!ok) throw new FileError('Could not rename the file.');
}

export async function deleteFile(path: string): Promise<void> {
  if (isShared(path) && !(await ensurePermission('DELETE'))) throw new FileError('Delete permission was not given.');
  const m = nativeFiles();
  const ok = m ? await m.deleteFile(path) : await FileUtils.deleteFile(path);
  if (!ok) throw new FileError('Could not delete the file.');
}

export function basename(path: string): string {
  return path.split('/').pop() || path;
}

export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i) : '/';
}

/** Makes a safe file name from a title (keeps letters, digits, spaces, - and _). */
export function safeName(title: string): string {
  const t = title
    .replace(/\.(md|markdown|txt)$/i, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return (t || 'Untitled').slice(0, 80);
}

/* ------------------------------------------------------------------ */
/* Settings and draft (plugin private folder)                          */
/* ------------------------------------------------------------------ */

export type Settings = {
  vaultDir: string;
  fontSize: number; // editor and preview text size (dp)
  mathScale: number; // math size relative to text
  insertEm: number; // pixels per em for formulas inserted into a note
  autoPreview: boolean;
  previewDelayMs: number;
  preamble: string; // global \newcommand definitions
  removeTextAfterRender: boolean; // lasso "Render TeX": delete the text box
  closeAfterInsert: boolean;
  autoSave: boolean; // save a note that has a file 2.5 s after the last change
  theme: 'paper' | 'night'; // Istari palette: print (paper) or screen (night)
  inlineTitle: boolean; // show the file name above the note, as Obsidian does
  sidenotes: boolean; // footnotes open in place under their line (Istari)
  editorFont: 'serif' | 'mono'; // editor face: EB Garamond (as Istari) or JetBrains Mono
};

export const DEFAULT_SETTINGS: Settings = {
  vaultDir: DEFAULT_VAULT,
  fontSize: 18,
  mathScale: 1.12,
  insertEm: 64,
  autoPreview: true,
  previewDelayMs: 1500,
  preamble: '',
  removeTextAfterRender: false,
  closeAfterInsert: true,
  autoSave: true,
  theme: 'paper',
  inlineTitle: true,
  sidenotes: true,
  editorFont: 'serif',
};

export type Draft = {path: string | null; text: string; dirty: boolean; savedAt: number; selection?: number};

let privateDir: string | null = null;

async function getPrivateDir(): Promise<string | null> {
  if (privateDir) return privateDir;
  try {
    const d = await PluginManager.getPluginDirPath();
    if (d) privateDir = d.replace(/\/+$/, '');
  } catch {
    privateDir = null;
  }
  return privateDir;
}

async function readJSON<T>(name: string): Promise<T | null> {
  const dir = await getPrivateDir();
  const m = nativeFiles();
  if (!dir || !m) return null;
  try {
    if (!(await m.exists(dir + '/' + name))) return null;
    return JSON.parse(await m.readText(dir + '/' + name)) as T;
  } catch {
    return null;
  }
}

async function writeJSON(name: string, value: unknown): Promise<boolean> {
  const dir = await getPrivateDir();
  const m = nativeFiles();
  if (!dir || !m) return false;
  try {
    await m.writeText(dir + '/' + name, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export async function loadSettings(): Promise<Settings> {
  const s = await readJSON<Partial<Settings>>('settings.json');
  return Object.assign({}, DEFAULT_SETTINGS, s || {});
}

export function saveSettings(s: Settings): Promise<boolean> {
  return writeJSON('settings.json', s);
}

export function loadDraft(): Promise<Draft | null> {
  return readJSON<Draft>('draft.json');
}

export function saveDraft(d: Draft): Promise<boolean> {
  return writeJSON('draft.json', d);
}

export async function loadRecent(): Promise<string[]> {
  return (await readJSON<string[]>('recent.json')) || [];
}

export async function pushRecent(path: string): Promise<void> {
  const list = (await loadRecent()).filter(p => p !== path);
  list.unshift(path);
  await writeJSON('recent.json', list.slice(0, 12));
}
