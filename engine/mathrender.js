'use strict';
/**
 * Renders TeX to a PNG with no DOM and no native code:
 * TeX -> MathJax (lite DOM SVG tree) -> scanline rasterizer -> PNG bytes.
 */
const G = require('./geom');
const {Canvas} = require('./raster');
const {encodePNG, toBase64} = require('./png');
const {createMathDocument} = require('./mathjax-setup');

/* ------------------------------------------------------------------ */
/* Colors                                                              */
/* ------------------------------------------------------------------ */

const NAMED = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0],
  blue: [0, 0, 255], yellow: [255, 255, 0], orange: [255, 165, 0], purple: [128, 0, 128],
  gray: [128, 128, 128], grey: [128, 128, 128], cyan: [0, 255, 255], magenta: [255, 0, 255],
  brown: [165, 42, 42], pink: [255, 192, 203], violet: [238, 130, 238], teal: [0, 128, 128],
  navy: [0, 0, 128], maroon: [128, 0, 0], olive: [128, 128, 0], lime: [0, 255, 0],
  silver: [192, 192, 192], darkgray: [169, 169, 169], lightgray: [211, 211, 211],
};

/** Returns luminance 0..1 for a CSS color string, or null for "none". */
function luminance(color) {
  if (color === undefined || color === null) return 0;
  const c = String(color).trim().toLowerCase();
  if (c === 'none' || c === 'transparent') return null;
  if (c === 'currentcolor' || c === '') return 0;
  let rgb = null;
  if (c[0] === '#') {
    const h = c.slice(1);
    if (h.length === 3) rgb = [0, 1, 2].map(i => parseInt(h[i] + h[i], 16));
    else if (h.length >= 6) rgb = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  } else if (c.startsWith('rgb')) {
    const v = G.numbers(c);
    if (v.length >= 3) rgb = [v[0], v[1], v[2]];
  } else if (NAMED[c]) {
    rgb = NAMED[c];
  }
  if (!rgb || rgb.some(v => isNaN(v))) return 0;
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
}

/** Ink (foreground) gray: keep colored ink dark enough to read on e-ink. */
function inkGray(color) {
  const l = luminance(color);
  if (l === null) return null;
  return Math.min(0.6, l * 0.75);
}

/** Background gray (\colorbox etc.): keep it light so text stays readable. */
function backgroundGray(color) {
  const l = luminance(color);
  if (l === null) return null;
  return 0.78 + 0.2 * l;
}

/* ------------------------------------------------------------------ */
/* Stroke helpers (all in device space)                                */
/* ------------------------------------------------------------------ */

function segmentQuad(x0, y0, x1, y1, hw) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  const nx = (-dy / len) * hw;
  const ny = (dx / len) * hw;
  // Wind consistently so that the non-zero rule gives a union.
  return [x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny];
}

function disc(cx, cy, r, ccw) {
  const n = Math.max(8, Math.min(32, Math.ceil(r * 2)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = ((ccw ? -1 : 1) * 2 * Math.PI * i) / n;
    out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return out;
}

/** Polygon area sign (shoelace) for winding normalization. */
function signedArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i += 2) {
    const j = (i + 2) % p.length;
    a += p[i] * p[j + 1] - p[j] * p[i + 1];
  }
  return a / 2;
}

function normalize(p) {
  if (signedArea(p) >= 0) return p;
  const out = [];
  for (let i = p.length - 2; i >= 0; i -= 2) out.push(p[i], p[i + 1]);
  return out;
}

/**
 * Strokes polylines (flat point arrays in device space) with round joins.
 * @param {number[][]} lines
 * @param {number} width device pixels
 * @param {boolean} closed
 */
function strokePolylines(lines, width, closed) {
  const hw = Math.max(0.5, width / 2);
  const polys = [];
  for (const pts of lines) {
    const n = pts.length;
    if (n < 4) continue;
    const last = closed ? n : n - 2;
    for (let i = 0; i < last; i += 2) {
      const j = (i + 2) % n;
      const q = segmentQuad(pts[i], pts[i + 1], pts[j], pts[j + 1], hw);
      if (q) polys.push(normalize(q));
    }
    if (hw > 0.75) {
      for (let i = 0; i < n; i += 2) polys.push(normalize(disc(pts[i], pts[i + 1], hw)));
    }
  }
  return polys;
}

function dashLine(x0, y0, x1, y1, dashes) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (!dashes || !dashes.length || len === 0) return [[x0, y0, x1, y1]];
  const pattern = dashes.length % 2 ? dashes.concat(dashes) : dashes;
  const total = pattern.reduce((a, b) => a + b, 0);
  if (total <= 0) return [[x0, y0, x1, y1]];
  const out = [];
  let t = 0;
  let k = 0;
  while (t < len) {
    const d = pattern[k % pattern.length];
    if (k % 2 === 0) {
      const a = t / len;
      const b = Math.min(len, t + Math.max(d, 0.01)) / len;
      out.push([x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b]);
    }
    t += d;
    k++;
    if (k > 10000) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* SVG tree walk                                                       */
/* ------------------------------------------------------------------ */

function attrs(adaptor, node) {
  const out = {};
  for (const a of adaptor.allAttributes(node)) out[a.name] = a.value;
  return out;
}

function styleProps(style) {
  const out = {};
  if (!style) return out;
  for (const part of String(style).split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return out;
}

function num(v, dflt) {
  if (v === undefined || v === null || v === '') return dflt;
  const f = parseFloat(v);
  return isNaN(f) ? dflt : f;
}

/**
 * Walks the MathJax SVG tree and draws into the canvas.
 */
function drawTree(adaptor, root, canvas, rootMatrix, info) {
  const tolerance = 0.2;

  // Consecutive glyphs with the same ink and clip are filled in one pass:
  // far fewer rasterizer calls, and overlapping glyphs merge cleanly.
  let batchGray = null;
  let batchClip = null;
  let batchPolys = [];

  function flush() {
    if (batchPolys.length) canvas.fill(batchPolys, batchGray, 1, batchClip);
    batchPolys = [];
    batchGray = null;
    batchClip = null;
  }

  function drawGlyph(polys, gray, clip, m) {
    if (batchPolys.length && (batchGray !== gray || batchClip !== clip)) flush();
    batchGray = gray;
    batchClip = clip;
    const flip = m[0] * m[3] - m[1] * m[2] > 0; // keep one winding orientation
    for (const p of polys) {
      if (!flip) {
        batchPolys.push(p);
      } else {
        const r = [];
        for (let i = p.length - 2; i >= 0; i -= 2) r.push(p[i], p[i + 1]);
        batchPolys.push(r);
      }
    }
  }

  function drawOther(polys, gray, opacity, clip) {
    flush();
    canvas.fill(polys, gray, opacity, clip);
  }

  function transformRect(m, x, y, w, h) {
    const p = [G.apply(m, x, y), G.apply(m, x + w, y), G.apply(m, x + w, y + h), G.apply(m, x, y + h)];
    return [p[0][0], p[0][1], p[1][0], p[1][1], p[2][0], p[2][1], p[3][0], p[3][1]];
  }

  function intersectClip(a, b) {
    if (!a) return b;
    if (!b) return a;
    return {x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1)};
  }

  function strokeWidthPx(state, a, dflt) {
    const st = styleProps(a.style);
    let sw = num(st['stroke-width'], NaN);
    if (isNaN(sw)) sw = num(a['stroke-width'], NaN);
    if (isNaN(sw)) sw = dflt !== undefined ? dflt : state.strokeWidth;
    return sw * G.scaleOf(state.m);
  }

  function visit(node, state) {
    const kind = adaptor.kind(node);
    if (kind === '#text' || kind === '#comment') return;
    const a = attrs(adaptor, node);
    if (kind === 'title' || kind === 'desc' || kind === 'defs' || kind === 'style') return;

    const st = styleProps(a.style);
    const next = Object.assign({}, state);
    if (a.transform) next.m = G.multiply(state.m, G.parseTransform(a.transform));
    if (a.fill !== undefined) next.fill = a.fill === 'currentColor' ? state.color : a.fill;
    if (st.fill !== undefined) next.fill = st.fill;
    if (a.stroke !== undefined) next.stroke = a.stroke === 'currentColor' ? state.color : a.stroke;
    if (st.stroke !== undefined) next.stroke = st.stroke;
    if (a['stroke-width'] !== undefined) next.strokeWidth = num(a['stroke-width'], state.strokeWidth);
    if (st['stroke-width'] !== undefined) next.strokeWidth = num(st['stroke-width'], next.strokeWidth);
    if (a.color !== undefined) next.color = a.color;

    if (kind === 'g') {
      if (a['data-mml-node'] === 'mtable') next.mtableLevel = 1;
      else next.mtableLevel = state.mtableLevel ? state.mtableLevel + 1 : 0;
      if (a['data-mml-node'] === 'merror') {
        info.error = a['data-mjx-error'] || 'TeX error';
      }
      for (const c of adaptor.childNodes(node)) visit(c, next);
      return;
    }

    if (kind === 'svg') {
      // Nested viewport: map viewBox to (x, y, width, height) and clip.
      const x = num(a.x, 0);
      const y = num(a.y, 0);
      const vb = G.numbers(a.viewBox);
      const w = num(a.width, vb.length === 4 ? vb[2] : 0);
      const h = num(a.height, vb.length === 4 ? vb[3] : 0);
      let m = G.multiply(next.m, [1, 0, 0, 1, x, y]);
      if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
        let sx = w / vb[2];
        let sy = h / vb[3];
        let tx = 0;
        let ty = 0;
        if (a.preserveAspectRatio !== 'none') {
          const s = Math.min(sx, sy);
          tx = (w - vb[2] * s) / 2;
          ty = (h - vb[3] * s) / 2;
          sx = sy = s;
        }
        m = G.multiply(m, [sx, 0, 0, sy, tx - vb[0] * sx, ty - vb[1] * sy]);
      }
      const r = transformRect(next.m, x, y, w, h);
      const xsr = [r[0], r[2], r[4], r[6]];
      const ysr = [r[1], r[3], r[5], r[7]];
      const box = {x0: Math.min(...xsr), y0: Math.min(...ysr), x1: Math.max(...xsr), y1: Math.max(...ysr)};
      const visible = st.overflow === 'visible' || state.mtableLevel === 2;
      next.m = m;
      if (!visible) next.clip = intersectClip(state.clip, box);
      for (const c of adaptor.childNodes(node)) visit(c, next);
      return;
    }

    const gray = inkGray(next.fill);
    const strokeGray = inkGray(next.stroke);

    if (kind === 'path') {
      const cmds = G.parsePath(a.d || '');
      const fillNone = next.fill === 'none';
      if (!fillNone && gray !== null) {
        const polys = G.flattenPath(cmds, next.m, tolerance);
        if (a['data-c'] !== undefined) drawGlyph(polys, gray, next.clip, next.m);
        else drawOther(polys, gray, 1, next.clip);
      }
      const hasOwnStroke = a['stroke-width'] !== undefined || st['stroke-width'] !== undefined;
      if ((fillNone || hasOwnStroke) && strokeGray !== null) {
        const sw = strokeWidthPx(next, a);
        if (sw > 0) {
          // Re-flatten without closing to get open polylines.
          const lines = openPolylines(cmds, next.m, tolerance);
          drawOther(strokePolylines(lines.open, sw, false), strokeGray, 1, next.clip);
          drawOther(strokePolylines(lines.closed, sw, true), strokeGray, 1, next.clip);
        }
      }
      return;
    }

    if (kind === 'rect') {
      const x = num(a.x, 0);
      const y = num(a.y, 0);
      const w = num(a.width, 0);
      const h = num(a.height, 0);
      if (a['data-background'] !== undefined) {
        // merror background: drawn as a light frame later by the caller.
        return;
      }
      const isBg = a['data-bgcolor'] !== undefined;
      const isFrame = a['data-frame'] !== undefined;
      const fillNone = isFrame || next.fill === 'none';
      if (!fillNone) {
        const g = isBg ? backgroundGray(next.fill) : gray;
        if (g !== null) {
          let r = transformRect(next.m, x, y, w, h);
          r = minThickness(r);
          drawOther([r], g, 1, next.clip);
        }
      } else if (strokeGray !== null) {
        const sw = strokeWidthPx(next, a, isFrame ? 70 : undefined);
        if (sw > 0) {
          const r = transformRect(next.m, x, y, w, h);
          drawOther(strokePolylines([r], sw, true), strokeGray, 1, next.clip);
        }
      }
      return;
    }

    if (kind === 'line') {
      if (strokeGray === null) return;
      const isTableLine = a['data-line'] !== undefined;
      const sw = strokeWidthPx(next, a, isTableLine ? 70 : undefined);
      const p0 = G.apply(next.m, num(a.x1, 0), num(a.y1, 0));
      const p1 = G.apply(next.m, num(a.x2, 0), num(a.y2, 0));
      let dashes = null;
      const cls = a.class || '';
      const sc = G.scaleOf(next.m);
      if (cls.indexOf('mjx-dashed') >= 0) dashes = [140 * sc, 140 * sc];
      else if (cls.indexOf('mjx-dotted') >= 0) dashes = [Math.max(1, 0.1 * sw), 140 * sc];
      else if (a['stroke-dasharray']) dashes = G.numbers(a['stroke-dasharray']).map(v => v * sc);
      const segs = dashLine(p0[0], p0[1], p1[0], p1[1], dashes);
      drawOther(strokePolylines(segs, Math.max(1, sw), false), strokeGray, 1, next.clip);
      return;
    }

    if (kind === 'ellipse' || kind === 'circle') {
      const cx = num(a.cx, 0);
      const cy = num(a.cy, 0);
      const rx = kind === 'circle' ? num(a.r, 0) : num(a.rx, 0);
      const ry = kind === 'circle' ? num(a.r, 0) : num(a.ry, 0);
      const pts = [];
      const n = 48;
      for (let i = 0; i < n; i++) {
        const t = (2 * Math.PI * i) / n;
        const p = G.apply(next.m, cx + rx * Math.cos(t), cy + ry * Math.sin(t));
        pts.push(p[0], p[1]);
      }
      if (next.fill !== 'none' && gray !== null) drawOther([pts], gray, 1, next.clip);
      else if (strokeGray !== null) {
        const sw = strokeWidthPx(next, a);
        if (sw > 0) drawOther(strokePolylines([pts], sw, true), strokeGray, 1, next.clip);
      }
      return;
    }

    if (kind === 'polygon' || kind === 'polyline') {
      const v = G.numbers(a.points);
      const pts = [];
      for (let i = 0; i + 1 < v.length; i += 2) {
        const p = G.apply(next.m, v[i], v[i + 1]);
        pts.push(p[0], p[1]);
      }
      if (kind === 'polygon' && next.fill !== 'none' && gray !== null) {
        drawOther([pts], gray, 1, next.clip);
      }
      const hasOwnStroke = a['stroke-width'] !== undefined || st['stroke-width'] !== undefined;
      if ((next.fill === 'none' || kind === 'polyline' || hasOwnStroke) && next.stroke !== 'none' && strokeGray !== null) {
        const sw = strokeWidthPx(next, a);
        if (sw > 0) drawOther(strokePolylines([pts], sw, kind === 'polygon'), strokeGray, 1, next.clip);
      }
      return;
    }

    if (kind === 'text') {
      // Characters outside the MathJax fonts (for example CJK). They cannot
      // be drawn without a font, so draw an outlined placeholder box.
      const text = adaptor.textContent(node) || '';
      if (a['data-id-align'] !== undefined || !text.trim()) return;
      info.unsupportedText = true;
      const fs = num(a['font-size'], 884);
      const chars = Math.max(1, Array.from(text).length);
      const w = chars * fs * 0.9;
      const r = transformRect(next.m, fs * 0.05, -fs * 0.75, w, fs * 0.8);
      const sw = Math.max(1, fs * 0.05 * G.scaleOf(next.m));
      drawOther(strokePolylines([r], sw, true), gray === null ? 0 : gray, 1, next.clip);
      return;
    }

    // Unknown element: draw children (for example <a>).
    for (const c of adaptor.childNodes(node)) visit(c, next);
  }

  function minThickness(r) {
    // Keep fraction bars and rules at least ~1 device pixel so that they
    // stay solid on e-ink.
    const xs = [r[0], r[2], r[4], r[6]];
    const ys = [r[1], r[3], r[5], r[7]];
    let x0 = Math.min(...xs);
    let x1 = Math.max(...xs);
    let y0 = Math.min(...ys);
    let y1 = Math.max(...ys);
    if (y1 - y0 < 1) {
      const c = (y0 + y1) / 2;
      y0 = c - 0.5;
      y1 = c + 0.5;
    }
    if (x1 - x0 < 1) {
      const c = (x0 + x1) / 2;
      x0 = c - 0.5;
      x1 = c + 0.5;
    }
    return [x0, y0, x1, y0, x1, y1, x0, y1];
  }

  for (const c of adaptor.childNodes(root)) {
    visit(c, {m: rootMatrix, fill: 'black', stroke: 'black', color: 'black', strokeWidth: 0, clip: null, mtableLevel: 0});
  }
  flush();
}

/** Splits path commands into open and closed device-space polylines. */
function openPolylines(cmds, m, tol) {
  const open = [];
  const closed = [];
  let cur = null;
  let start = null;
  let px = 0;
  let py = 0;
  const flushOpen = () => {
    if (cur && cur.length >= 4) open.push(cur);
    cur = null;
  };
  for (const c of cmds) {
    if (c[0] === 'M') {
      flushOpen();
      const p = G.apply(m, c[1], c[2]);
      cur = [p[0], p[1]];
      start = [c[1], c[2]];
      px = c[1];
      py = c[2];
    } else if (c[0] === 'Z') {
      if (cur && cur.length >= 4) closed.push(cur);
      cur = null;
      if (start) {
        px = start[0];
        py = start[1];
      }
    } else {
      if (!cur) {
        const p = G.apply(m, px, py);
        cur = [p[0], p[1]];
      }
      // Reuse flattenPath on a one-segment path to flatten curves.
      const seg = [['M', px, py], c];
      const polys = G.flattenPath(seg, m, tol);
      if (polys.length) {
        const p = polys[0];
        for (let i = 2; i < p.length; i++) cur.push(p[i]);
      } else {
        const end = c[0] === 'L' ? [c[1], c[2]] : null;
        if (end) {
          const p = G.apply(m, end[0], end[1]);
          cur.push(p[0], p[1]);
        }
      }
      if (c[0] === 'L') {
        px = c[1];
        py = c[2];
      } else if (c[0] === 'Q') {
        px = c[3];
        py = c[4];
      } else if (c[0] === 'C') {
        px = c[5];
        py = c[6];
      }
    }
  }
  flushOpen();
  return {open, closed};
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * A math renderer bound to one MathJax document (one macro context).
 */
class MathRenderer {
  /**
   * @param {object} [opts] {macros, preamble}
   */
  constructor(opts) {
    const {doc, adaptor} = createMathDocument(opts);
    this.doc = doc;
    this.adaptor = adaptor;
  }

  /**
   * Converts TeX to the MathJax SVG node and its metrics (in em).
   */
  layout(tex, display) {
    const adaptor = this.adaptor;
    const container = this.doc.convert(tex, {display: !!display});
    const svg = adaptor.firstChild(container);
    const vb = G.numbers(adaptor.getAttribute(svg, 'viewBox'));
    if (vb.length === 4) {
      return {
        svg,
        minX: vb[0],
        minY: vb[1],
        width: vb[2] / 1000,
        height: -vb[1] / 1000, // above the baseline
        depth: (vb[3] + vb[1]) / 1000, // below the baseline
        vb,
      };
    }
    // Numbered equations (\tag, align, equation) use a full-width layout
    // in MathJax: a table viewport and a label viewport that the browser
    // places with preserveAspectRatio. Rebuild that here.
    const find = (node, attr) => {
      if (adaptor.kind(node) === 'svg' && adaptor.getAttribute(node, attr) !== null &&
          adaptor.getAttribute(node, attr) !== undefined && node !== svg) return node;
      for (const c of adaptor.childNodes(node) || []) {
        if (adaptor.kind(c) === '#text') continue;
        const f = find(c, attr);
        if (f) return f;
      }
      return null;
    };
    const table = find(svg, 'data-table');
    if (!table) throw new Error('MathJax returned no viewBox');
    const labels = find(svg, 'data-labels');
    const tvb = G.numbers(adaptor.getAttribute(table, 'viewBox'));
    const lvb = labels ? G.numbers(adaptor.getAttribute(labels, 'viewBox')) : null;
    const style = adaptor.getAttribute(svg, 'style') || '';
    const mw = /min-width:\s*([\d.]+)ex/.exec(style);
    const X_HEIGHT = 442; // TeX font x-height in 1/1000 em
    const h = -tvb[1];
    const d = tvb[3] + tvb[1];
    const minWidth = mw ? parseFloat(mw[1]) * X_HEIGHT : 1000;
    return {
      full: true,
      table,
      labels,
      tvb,
      lvb,
      tableAlign: adaptor.getAttribute(table, 'preserveAspectRatio') || 'xMidYMid',
      labelAlign: labels ? adaptor.getAttribute(labels, 'preserveAspectRatio') || 'xMaxYMid' : '',
      minWidth,
      width: minWidth / 1000,
      height: h / 1000,
      depth: d / 1000,
      vb: [0, -h, minWidth, h + d],
    };
  }

  /**
   * Draws TeX centered at (cx, cy) on an existing canvas (used for icons).
   * Numbered (full-width) equations are not supported here.
   */
  drawCentered(canvas, tex, emPx, cx, cy, display) {
    const lay = this.layout(tex, display);
    if (lay.full) throw new Error('drawCentered: numbered equations are not supported');
    const k = emPx / 1000;
    const ox = cx - (lay.vb[2] * k) / 2 - lay.vb[0] * k;
    const oy = cy - (lay.vb[3] * k) / 2 - lay.vb[1] * k;
    const info = {};
    drawTree(this.adaptor, lay.svg, canvas, [k, 0, 0, k, ox, oy], info);
    return info;
  }

  /**
   * Renders TeX to an image.
   * @param {string} tex
   * @param {object} o
   * @param {boolean} [o.display] display style
   * @param {number} o.emPx size of 1 em in device pixels
   * @param {number} [o.pad] padding in pixels (default 2)
   * @param {boolean} [o.opaque] white background instead of transparent
   * @param {number} [o.dpi] optional PNG physical resolution
   * @param {number} [o.maxPixels] refuse larger images (default 8 Mpx)
   * @param {number} [o.level] deflate level 0..9 (default 6)
   * @param {number} [o.containerEm] line width for numbered equations (in em);
   *   the number is placed at the right edge, as in LaTeX
   * @returns {{ok:boolean, error?:string, png?:Uint8Array, base64?:string,
   *   width:number, height:number, ascent:number, widthEm:number,
   *   heightEm:number, depthEm:number, unsupportedText?:boolean}}
   */
  render(tex, o) {
    const emPx = o.emPx;
    const pad = o.pad === undefined ? 2 : o.pad;
    let lay;
    try {
      lay = this.layout(tex, o.display);
    } catch (e) {
      return {ok: false, error: String((e && e.message) || e), width: 0, height: 0, ascent: 0};
    }
    const k = emPx / 1000;
    if (lay.full && o.containerEm) {
      lay.vb[2] = Math.max(lay.minWidth, o.containerEm * 1000);
    }
    const W = Math.max(1, Math.ceil(lay.vb[2] * k + 2 * pad));
    const H = Math.max(1, Math.ceil(lay.vb[3] * k + 2 * pad));
    const maxPixels = o.maxPixels || 8e6;
    if (W * H > maxPixels) {
      return {ok: false, error: 'Formula is too large to render at this size', width: W, height: H, ascent: 0};
    }
    // Snap the baseline to a whole pixel for crisp alignment with text.
    const ascent = Math.round(-lay.vb[1] * k + pad);
    const originY = ascent;
    const originX = pad - lay.vb[0] * k;
    const canvas = new Canvas(W, H);
    const info = {};
    if (lay.full) {
      // Lay the table and the label out in a container of width Wc.
      const Wc = lay.vb[2];
      const offset = (align, v) =>
        align.indexOf('xMax') === 0 ? Wc - (v[0] + 1) : align.indexOf('xMin') === 0 ? -v[0] : Wc / 2 - (v[0] + 0.5);
      const place = (node, v, align) => {
        const ox = pad + offset(align, v) * k;
        const oy = pad - v[1] * k;
        drawTree(this.adaptor, node, canvas, [k, 0, 0, k, ox, oy], info);
      };
      place(lay.table, lay.tvb, lay.tableAlign);
      if (lay.labels && lay.lvb && lay.lvb.length === 4) place(lay.labels, lay.lvb, lay.labelAlign);
    } else {
      drawTree(this.adaptor, lay.svg, canvas, [k, 0, 0, k, originX, originY], info);
    }
    if (info.error) {
      return {ok: false, error: info.error, width: W, height: H, ascent};
    }
    const pixels = o.opaque ? canvas.toGray(1) : canvas.toGrayAlpha();
    const png = encodePNG(pixels, W, H, o.opaque ? 1 : 2, o.dpi, o.level);
    return {
      ok: true,
      png,
      get base64() {
        if (!this._b64) this._b64 = toBase64(png);
        return this._b64;
      },
      width: W,
      height: H,
      ascent,
      widthEm: lay.width,
      heightEm: lay.height,
      depthEm: lay.depth,
      unsupportedText: !!info.unsupportedText,
    };
  }
}

module.exports = {MathRenderer, luminance, inkGray};
