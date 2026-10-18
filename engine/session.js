'use strict';
/**
 * Rendering session: one macro context plus a cache of rendered images.
 *
 * The context is the user's global preamble plus every formula in the
 * document that defines macros (\newcommand, \def, ...). When the context
 * changes, a fresh MathJax document is made, the definitions run first, and
 * the cache is cleared. So a macro may be defined anywhere in the note.
 */
const {MathRenderer} = require('./mathrender');
const {collectMath, definesMacros} = require('./markdown');

const CACHE_LIMIT = 400;

class MathSession {
  constructor() {
    this.renderer = null;
    this.contextKey = null;
    this.cache = new Map();
    this.preamble = '';
  }

  /**
   * Prepares the macro context for a parsed document.
   * @param {object[]} blocks output of parseMarkdown
   * @param {string} preamble global TeX preamble from the settings
   * @returns {boolean} true if the context changed
   */
  setContext(blocks, preamble) {
    const defs = collectMath(blocks || []).filter(m => definesMacros(m.tex)).map(m => m.tex);
    const key = (preamble || '') + '\u0000' + defs.join('\u0001');
    if (key === this.contextKey && this.renderer) return false;
    this.contextKey = key;
    this.preamble = preamble || '';
    this.renderer = new MathRenderer({preamble: this.preamble});
    this.cache.clear();
    for (const tex of defs) {
      try {
        this.renderer.layout(tex, true);
      } catch (e) {
        // Errors show where the formula itself is drawn.
      }
    }
    return true;
  }

  _renderer() {
    if (!this.renderer) this.setContext([], this.preamble);
    return this.renderer;
  }

  /**
   * Renders a formula for on-screen preview (fast compression).
   * A black formula comes back as an alpha mask with tint: true, so the UI
   * draws it in the color of the surrounding text (Istari section 4). A
   * formula with its own colors comes back opaque on white, tint: false.
   * @returns {{ok:boolean, uri?:string, tint?:boolean, width:number, height:number, ascent:number, error?:string, unsupportedText?:boolean}}
   *   width/height/ascent are in device pixels.
   */
  preview(tex, display, emPx) {
    const key = (display ? 'D' : 'I') + '|' + Math.round(emPx * 10) + '|' + tex;
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const res = this._renderer().render(tex, {display, emPx, pad: 2, mask: true, level: 1});
    const out = res.ok
      ? {
          ok: true,
          uri: 'data:image/png;base64,' + res.base64,
          tint: res.tint,
          width: res.width,
          height: res.height,
          ascent: res.ascent,
          unsupportedText: res.unsupportedText,
        }
      : {ok: false, error: res.error || 'Cannot render', width: 0, height: 0, ascent: 0};
    this.cache.set(key, out);
    if (this.cache.size > CACHE_LIMIT) {
      const first = this.cache.keys().next().value;
      this.cache.delete(first);
    }
    return out;
  }

  /** True if the preview for this formula is already cached. */
  hasPreview(tex, display, emPx) {
    return this.cache.has((display ? 'D' : 'I') + '|' + Math.round(emPx * 10) + '|' + tex);
  }

  /**
   * Renders a formula for insertion into a note page (transparent PNG).
   * @returns {{ok:boolean, png?:Uint8Array, base64?:string, width:number, height:number, error?:string}}
   */
  forNote(tex, display, emPx, dpi) {
    const res = this._renderer().render(tex, {display, emPx, pad: Math.ceil(emPx * 0.15), opaque: false, level: 6, dpi});
    if (!res.ok) return {ok: false, error: res.error || 'Cannot render', width: 0, height: 0};
    return {ok: true, png: res.png, base64: res.base64, width: res.width, height: res.height, unsupportedText: res.unsupportedText};
  }
}

module.exports = {MathSession};
