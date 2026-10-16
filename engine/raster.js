'use strict';
/**
 * Anti-aliased scanline polygon rasterizer (non-zero winding rule) on a
 * grayscale + alpha canvas. Pure JavaScript: no DOM, no native code.
 *
 * Coverage uses SUB vertical sub-scanlines per pixel row and exact
 * horizontal span coverage. Interior pixels are accumulated with a
 * difference array, so the cost per span is O(1). This matters because
 * Hermes on the device has no JIT.
 */

const SUB = 4;

class Canvas {
  constructor(width, height) {
    this.width = Math.max(1, Math.ceil(width));
    this.height = Math.max(1, Math.ceil(height));
    const n = this.width * this.height;
    this.alpha = new Float32Array(n); // coverage
    this.ink = new Float32Array(n); // premultiplied gray (gray * alpha)
    // Scratch buffers reused between fills.
    this._cov = new Float32Array(this.width + 2);
    this._delta = new Float32Array(this.width + 2);
  }

  /**
   * Fills polygons (flat [x0,y0,x1,y1,...] arrays, device pixels) with the
   * non-zero rule and composites them with "source over".
   * @param {number[][]} polys
   * @param {number} gray 0 = black ink, 1 = white
   * @param {number} [opacity] 0..1
   * @param {{x0:number,y0:number,x1:number,y1:number}} [clip] device-space clip box
   */
  fill(polys, gray, opacity, clip) {
    if (opacity === undefined || opacity === null) opacity = 1;
    let count = 0;
    for (let p = 0; p < polys.length; p++) count += polys[p].length >> 1;
    if (count < 3) return;

    const ya = new Float64Array(count);
    const yb = new Float64Array(count);
    const x0a = new Float64Array(count);
    const dxdy = new Float64Array(count);
    const dir = new Int8Array(count);
    let ne = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let p = 0; p < polys.length; p++) {
      const pt = polys[p];
      const n = pt.length;
      if (n < 6) continue;
      for (let i = 0; i < n; i += 2) {
        const xA = pt[i];
        const yA = pt[i + 1];
        const j = i + 2 < n ? i + 2 : 0;
        const xB = pt[j];
        const yB = pt[j + 1];
        if (xA < minX) minX = xA;
        if (xA > maxX) maxX = xA;
        if (yA < minY) minY = yA;
        if (yA > maxY) maxY = yA;
        if (yA === yB) continue;
        if (yA < yB) {
          ya[ne] = yA;
          yb[ne] = yB;
          x0a[ne] = xA;
          dxdy[ne] = (xB - xA) / (yB - yA);
          dir[ne] = 1;
        } else {
          ya[ne] = yB;
          yb[ne] = yA;
          x0a[ne] = xB;
          dxdy[ne] = (xA - xB) / (yA - yB);
          dir[ne] = -1;
        }
        ne++;
      }
    }
    if (ne === 0) return;

    const W = this.width;
    const H = this.height;
    let cy0 = -Infinity;
    let cy1 = Infinity;
    let cx0 = -Infinity;
    let cx1 = Infinity;
    if (clip) {
      cy0 = clip.y0;
      cy1 = clip.y1;
      cx0 = clip.x0;
      cx1 = clip.x1;
      if (minY < cy0) minY = cy0;
      if (maxY > cy1) maxY = cy1;
      if (minX < cx0) minX = cx0;
      if (maxX > cx1) maxX = cx1;
    }
    if (cx0 < 0) cx0 = 0;
    if (cx1 > W) cx1 = W;
    const rowStart = Math.max(0, Math.floor(minY));
    const rowEnd = Math.min(H - 1, Math.ceil(maxY));
    if (rowStart > rowEnd || minX >= W || maxX <= 0) return;

    // Sort edge indices by top y.
    const order = new Int32Array(ne);
    for (let i = 0; i < ne; i++) order[i] = i;
    const sorted = Array.prototype.slice.call(order).sort((a, b) => ya[a] - ya[b]);

    const active = new Int32Array(ne);
    let nActive = 0;
    let next = 0;
    const xs = new Float64Array(ne);
    const ds = new Int8Array(ne);
    const w = 1 / SUB;
    const cov = this._cov;
    const delta = this._delta;
    const alpha = this.alpha;
    const ink = this.ink;

    for (let row = rowStart; row <= rowEnd; row++) {
      let lo = W;
      let hi = -1;
      for (let s = 0; s < SUB; s++) {
        const sy = row + (s + 0.5) / SUB;
        while (next < ne && ya[sorted[next]] <= sy) {
          active[nActive++] = sorted[next];
          next++;
        }
        if (sy < cy0 || sy >= cy1) continue;
        // Crossings; drop finished edges.
        let m = 0;
        for (let k = nActive - 1; k >= 0; k--) {
          const e = active[k];
          if (yb[e] <= sy) {
            active[k] = active[--nActive];
            continue;
          }
          if (ya[e] > sy) continue;
          // Insertion into sorted position.
          const vx = x0a[e] + (sy - ya[e]) * dxdy[e];
          const vd = dir[e];
          let b = m - 1;
          while (b >= 0 && xs[b] > vx) {
            xs[b + 1] = xs[b];
            ds[b + 1] = ds[b];
            b--;
          }
          xs[b + 1] = vx;
          ds[b + 1] = vd;
          m++;
        }
        if (m < 2) continue;
        let wind = 0;
        let startX = 0;
        for (let a = 0; a < m; a++) {
          const prev = wind;
          wind += ds[a];
          if (prev === 0 && wind !== 0) {
            startX = xs[a];
          } else if (prev !== 0 && wind === 0) {
            let xa = startX < cx0 ? cx0 : startX;
            let xb = xs[a] > cx1 ? cx1 : xs[a];
            if (xb <= xa) continue;
            const ia = Math.floor(xa);
            const ib = Math.floor(xb);
            if (ia < lo) lo = ia;
            if (ib > hi) hi = ib;
            if (ia === ib) {
              cov[ia] += (xb - xa) * w;
            } else {
              cov[ia] += (ia + 1 - xa) * w;
              if (ib > ia + 1) {
                delta[ia + 1] += w;
                delta[ib] -= w;
              }
              if (ib < W) cov[ib] += (xb - ib) * w;
            }
          }
        }
      }
      if (hi < lo) continue;
      if (hi > W - 1) hi = W - 1;
      // Prefix-sum the interior deltas and composite.
      const base = row * W;
      let run = 0;
      for (let c = lo; c <= hi + 1 && c <= W; c++) {
        run += delta[c];
        delta[c] = 0;
        let a = cov[c] + run;
        cov[c] = 0;
        if (c > hi || a <= 0) continue;
        if (a > 1) a = 1;
        a *= opacity;
        const idx = base + c;
        alpha[idx] = a + alpha[idx] * (1 - a);
        ink[idx] = gray * a + ink[idx] * (1 - a);
      }
      // Clear any stray accumulators at the right edge.
      if (hi + 1 < W + 2) {
        cov[hi + 1] = 0;
        delta[hi + 1] = 0;
      }
    }
  }

  /** Fills an axis-aligned rectangle given in device pixels. */
  fillRect(x, y, w, h, gray, opacity) {
    this.fill([[x, y, x + w, y, x + w, y + h, x, y + h]], gray, opacity);
  }

  /** Converts to 8-bit gray+alpha, un-premultiplying the gray channel. */
  toGrayAlpha() {
    const n = this.width * this.height;
    const out = new Uint8Array(n * 2);
    const alpha = this.alpha;
    const ink = this.ink;
    for (let i = 0; i < n; i++) {
      const a = alpha[i];
      const o = i << 1;
      if (a <= 0) {
        out[o] = 255;
        continue;
      }
      const g = ink[i] / a;
      out[o] = g <= 0 ? 0 : g >= 1 ? 255 : (g * 255 + 0.5) | 0;
      out[o + 1] = a >= 1 ? 255 : (a * 255 + 0.5) | 0;
    }
    return out;
  }

  /** Converts to 8-bit opaque gray over a background gray (0..1). */
  toGray(background) {
    if (background === undefined) background = 1;
    const n = this.width * this.height;
    const out = new Uint8Array(n);
    const alpha = this.alpha;
    const ink = this.ink;
    for (let i = 0; i < n; i++) {
      const v = ink[i] + background * (1 - alpha[i]);
      out[i] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0;
    }
    return out;
  }
}

module.exports = {Canvas, SUB};
