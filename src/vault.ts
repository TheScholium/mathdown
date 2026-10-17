/**
 * The vault on the device: a file index for link resolution, and a cache of
 * notes that other notes embed (![[Note]]).
 */
import {useEffect, useState} from 'react';
import type {Block, LinkTarget, VaultEntry, VaultIndex} from '../engine';
import {buildIndex, extractSection, parseMarkdown, resolveLink} from '../engine';
import {listTree, readText} from './storage';

let index: VaultIndex | null = null;
let indexRoot = '';
let loading: Promise<VaultIndex | null> | null = null;
let version = 0;
const listeners = new Set<() => void>();

function changed() {
  version++;
  listeners.forEach(l => l());
}

/** Re-reads the vault folder. Safe to call often; parallel calls share one walk. */
export function refreshVault(root: string): Promise<VaultIndex | null> {
  if (loading && indexRoot === root) return loading;
  indexRoot = root;
  loading = (async () => {
    try {
      const files = await listTree(root);
      index = buildIndex(files, root);
    } catch {
      index = index && index.root === root ? index : buildIndex([], root);
    }
    loading = null;
    changed();
    return index;
  })();
  return loading;
}

export function getVault(): VaultIndex | null {
  return index;
}

/** Re-renders a component when the vault index changes. */
export function useVaultVersion(): number {
  const [v, setV] = useState(version);
  useEffect(() => {
    const l = () => setV(version);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return v;
}

export function resolve(target: LinkTarget, fromPath: string | null): VaultEntry | null {
  return resolveLink(index, target.page, fromPath);
}

/** file:// URI for an image on the device. */
export function fileUri(path: string): string {
  return 'file://' + path.split('/').map(encodeURIComponent).join('/');
}

/* ------------------------------------------------------------------ */
/* Embedded notes                                                      */
/* ------------------------------------------------------------------ */

type Cached = {modified: number; blocks: Block[]};
const noteCache = new Map<string, Cached>();

/** Parsed blocks of a note (cached by modification time). */
export async function loadNoteBlocks(entry: VaultEntry): Promise<Block[]> {
  const hit = noteCache.get(entry.path);
  if (hit && hit.modified === entry.modified && entry.modified) return hit.blocks;
  const text = await readText(entry.path);
  const blocks = parseMarkdown(text);
  noteCache.set(entry.path, {modified: entry.modified, blocks});
  if (noteCache.size > 200) noteCache.delete(noteCache.keys().next().value as string);
  return blocks;
}

/** Forget a note in the cache (after Mathdown saves it). */
export function invalidateNote(path: string) {
  noteCache.delete(path);
}

export type EmbedResult =
  | {kind: 'note'; entry: VaultEntry; blocks: Block[]}
  | {kind: 'image'; entry: VaultEntry}
  | {kind: 'file'; entry: VaultEntry}
  | {kind: 'missing'}
  | {kind: 'error'; message: string};

/** Loads what an embed points to. Sections ("#Heading", "#^id") are cut out. */
export async function loadEmbed(target: LinkTarget, fromPath: string | null): Promise<EmbedResult> {
  const entry = resolve(target, fromPath);
  if (!entry) return {kind: 'missing'};
  if (entry.isImage) return {kind: 'image', entry};
  if (!entry.isNote) return {kind: 'file', entry};
  try {
    const all = await loadNoteBlocks(entry);
    const part = extractSection(all, target.sub);
    if (!part) return {kind: 'error', message: 'No section "' + target.sub + '" in ' + entry.title};
    return {kind: 'note', entry, blocks: part.filter(b => b.type !== 'properties')};
  } catch (e: any) {
    return {kind: 'error', message: String(e && e.message ? e.message : e)};
  }
}
