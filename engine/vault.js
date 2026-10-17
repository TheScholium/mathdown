'use strict';
/**
 * Vault index and Obsidian-style link resolution (pure functions, no I/O).
 *
 * Resolution rules (the same as Obsidian with "shortest path" links):
 *  - "Note"           -> a note named Note.md anywhere; prefer the linking
 *                        note's folder, then the shortest path.
 *  - "folder/Note"    -> a note whose path ends with folder/Note.md.
 *  - "./x" or "../x"  -> relative to the linking note.
 *  - "pic.png"        -> an attachment (any file that is not .md), same rules.
 *  - names compare without case.
 */

const NOTE_EXT = /\.(md|markdown)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;

function lower(s) {
  return String(s || '').toLowerCase();
}

function dirOf(p) {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(0, i) : '';
}

function baseOf(p) {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(i + 1) : p;
}

/** Joins and normalizes "a/b" + "../c" style paths. */
function joinPath(dir, rel) {
  const parts = (dir ? dir.split('/') : []).concat(rel.split('/'));
  const out = [];
  for (const part of parts) {
    if (part === '' || part === '.') {
      if (!out.length && part === '') out.push('');
      continue;
    }
    if (part === '..') {
      if (out.length && out[out.length - 1] !== '') out.pop();
    } else {
      out.push(part);
    }
  }
  return out.join('/');
}

/**
 * Builds an index from a file listing.
 * @param {{path:string, rel:string, name?:string, modified?:number, size?:number}[]} files
 * @param {string} root absolute vault folder
 */
function buildIndex(files, root) {
  const index = {
    root: String(root || '').replace(/\/+$/, ''),
    notes: [],
    attachments: [],
    noteByName: new Map(), // lower name without .md -> entries
    fileByName: new Map(), // lower file name -> entries (attachments)
    byPath: new Map(), // absolute path -> entry
  };
  for (const f of files || []) {
    const rel = f.rel || f.path;
    const name = f.name || baseOf(rel);
    const isNote = NOTE_EXT.test(name);
    const entry = {
      path: f.path,
      rel,
      name,
      title: isNote ? name.replace(NOTE_EXT, '') : name,
      isNote,
      isImage: IMAGE_EXT.test(name),
      modified: f.modified || 0,
      size: f.size || 0,
    };
    index.byPath.set(entry.path, entry);
    if (isNote) {
      index.notes.push(entry);
      const k = lower(entry.title);
      if (!index.noteByName.has(k)) index.noteByName.set(k, []);
      index.noteByName.get(k).push(entry);
    } else {
      index.attachments.push(entry);
      const k = lower(name);
      if (!index.fileByName.has(k)) index.fileByName.set(k, []);
      index.fileByName.get(k).push(entry);
    }
  }
  index.notes.sort((a, b) => a.rel.localeCompare(b.rel));
  return index;
}

function pickBest(cands, fromPath) {
  if (!cands || !cands.length) return null;
  if (cands.length === 1) return cands[0];
  const fromDir = fromPath ? dirOf(fromPath) : null;
  const same = fromDir !== null ? cands.find(c => dirOf(c.path) === fromDir) : null;
  if (same) return same;
  return cands.slice().sort((a, b) => a.rel.split('/').length - b.rel.split('/').length || a.rel.length - b.rel.length)[0];
}

/**
 * Resolves a link target to an index entry.
 * @param {object} index from buildIndex
 * @param {string} page link page part ("" means the current note)
 * @param {string} [fromPath] absolute path of the linking note
 * @returns {object|null} entry
 */
function resolveLink(index, page, fromPath) {
  if (!index) return null;
  let p = String(page || '').trim().replace(/\\/g, '/');
  if (!p) return fromPath ? index.byPath.get(fromPath) || {path: fromPath, isNote: true} : null;
  const hasExt = /\.[A-Za-z0-9]{1,6}$/.test(p) && !NOTE_EXT.test(p);
  const wantNote = !hasExt;
  const noteKey = wantNote ? p.replace(NOTE_EXT, '') : p;

  // Relative to the linking note, or vault-absolute "/x".
  const tryPaths = [];
  if (p.startsWith('/')) tryPaths.push(joinPath(index.root, p.slice(1)));
  else if (fromPath) tryPaths.push(joinPath(dirOf(fromPath), p));
  tryPaths.push(joinPath(index.root, p.replace(/^\//, '')));
  for (const tp of tryPaths) {
    const candidates = wantNote ? [tp.replace(NOTE_EXT, '') + '.md', tp.replace(NOTE_EXT, '') + '.markdown'] : [tp];
    for (const c of candidates) {
      const hit = index.byPath.get(c);
      if (hit) return hit;
      for (const [k, v] of index.byPath) if (lower(k) === lower(c)) return v;
    }
  }

  const key = lower(baseOf(noteKey));
  const cands = wantNote ? index.noteByName.get(key) : index.fileByName.get(key);
  if (!cands) return null;
  if (noteKey.indexOf('/') >= 0) {
    const suffix = lower(noteKey.replace(/^\/+/, ''));
    const filtered = cands.filter(c => {
      const relNoExt = lower(wantNote ? c.rel.replace(NOTE_EXT, '') : c.rel);
      return relNoExt === suffix || relNoExt.endsWith('/' + suffix);
    });
    return pickBest(filtered, fromPath);
  }
  return pickBest(cands, fromPath);
}

/** Where a new note for an unresolved link goes (the vault root, like Obsidian's default). */
function newNotePath(index, page) {
  const clean = String(page || 'Untitled')
    .replace(NOTE_EXT, '')
    .replace(/[\\:*?"<>|]/g, '-')
    .replace(/^\/+/, '')
    .trim();
  return joinPath(index.root, clean + '.md');
}

/** Notes whose title contains all words of the query (for the quick switcher later). */
function searchNotes(index, query, limit) {
  const words = lower(query).split(/\s+/).filter(Boolean);
  const out = [];
  for (const n of index.notes) {
    const hay = lower(n.rel);
    if (words.every(w => hay.indexOf(w) >= 0)) out.push(n);
    if (out.length >= (limit || 50)) break;
  }
  return out;
}

module.exports = {buildIndex, resolveLink, newNotePath, searchNotes, joinPath, dirOf, baseOf, IMAGE_EXT, NOTE_EXT};
