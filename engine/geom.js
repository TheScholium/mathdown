'use strict';
/**
 * 2D affine geometry and SVG path flattening.
 *
 * A matrix is [a, b, c, d, e, f] and maps (x, y) to
 * (a*x + c*y + e, b*x + d*y + f), the same as the SVG matrix() function.
 */

const IDENTITY = [1, 0, 0, 1, 0, 0];

function multiply(m, n) {
  // Returns m * n (apply n first, then m).
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Mean linear scale factor of a matrix (used for stroke widths and tolerances). */
function scaleOf(m) {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
}

const NUM_RE = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

function numbers(str) {
  const out = [];
  if (!str) return out;
  const found = String(str).match(NUM_RE);
  if (!found) return out;
  for (let i = 0; i < found.length; i++) out.push(parseFloat(found[i]));
  return out;
}

/** Parses an SVG transform attribute into one matrix. */
function parseTransform(str) {
  let m = IDENTITY;
  if (!str) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match;
  while ((match = re.exec(str)) !== null) {
    const kind = match[1];
    const v = numbers(match[2]);
    let t = IDENTITY;
    if (kind === 'matrix' && v.length >= 6) {
      t = [v[0], v[1], v[2], v[3], v[4], v[5]];
    } else if (kind === 'translate') {
      t = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
    } else if (kind === 'scale') {
      const sx = v.length ? v[0] : 1;
      const sy = v.length > 1 ? v[1] : sx;
      t = [sx, 0, 0, sy, 0, 0];
    } else if (kind === 'rotate') {
      const r = ((v[0] || 0) * Math.PI) / 180;
      const cos = Math.cos(r);
      const sin = Math.sin(r);
      t = [cos, sin, -sin, cos, 0, 0];
      if (v.length >= 3) {
        t = multiply(multiply([1, 0, 0, 1, v[1], v[2]], t), [1, 0, 0, 1, -v[1], -v[2]]);
      }
    } else if (kind === 'skewX') {
      t = [1, 0, Math.tan(((v[0] || 0) * Math.PI) / 180), 1, 0, 0];
    } else if (kind === 'skewY') {
      t = [1, Math.tan(((v[0] || 0) * Math.PI) / 180), 0, 1, 0, 0];
    }
    m = multiply(m, t);
  }
  return m;
}

/* ------------------------------------------------------------------ */
/* Path data parsing                                                   */
/* ------------------------------------------------------------------ */

const CMD_RE = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;

const ARG_COUNT = {M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0};

/**
 * Tokenizes path data into a list of [CMD, args...] in absolute coordinates.
 * Only M, L, C, Q, Z (absolute) are returned. H, V, S, T, A and relative
 * commands are converted.
 */
function parsePath(d) {
  const tokens = [];
  let match;
  CMD_RE.lastIndex = 0;
  while ((match = CMD_RE.exec(d)) !== null) {
    if (match[1]) tokens.push(match[1]);
    else tokens.push(parseFloat(match[2]));
  }

  const out = [];
  let i = 0;
  let cmd = null;
  let cx = 0;
  let cy = 0; // current point
  let sx = 0;
  let sy = 0; // subpath start
  let lastCtrlX = 0;
  let lastCtrlY = 0;
  let lastKind = ''; // 'C' or 'Q' for smooth continuation

  while (i < tokens.length) {
    const t = tokens[i];
    if (typeof t === 'string') {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        out.push(['Z']);
        cx = sx;
        cy = sy;
        lastKind = '';
        continue;
      }
    } else if (cmd === null) {
      i++;
      continue;
    }
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    const n = ARG_COUNT[upper];
    if (n === 0) continue;
    if (i + n > tokens.length) break;
    const a = tokens.slice(i, i + n);
    if (a.some(v => typeof v !== 'number')) {
      i++;
      continue;
    }
    i += n;

    switch (upper) {
      case 'M': {
        const x = rel ? cx + a[0] : a[0];
        const y = rel ? cy + a[1] : a[1];
        out.push(['M', x, y]);
        cx = sx = x;
        cy = sy = y;
        lastKind = '';
        // Further coordinate pairs are implicit line-tos.
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': {
        const x = rel ? cx + a[0] : a[0];
        const y = rel ? cy + a[1] : a[1];
        out.push(['L', x, y]);
        cx = x;
        cy = y;
        lastKind = '';
        break;
      }
      case 'H': {
        const x = rel ? cx + a[0] : a[0];
        out.push(['L', x, cy]);
        cx = x;
        lastKind = '';
        break;
      }
      case 'V': {
        const y = rel ? cy + a[0] : a[0];
        out.push(['L', cx, y]);
        cy = y;
        lastKind = '';
        break;
      }
      case 'C': {
        const p = rel
          ? [cx + a[0], cy + a[1], cx + a[2], cy + a[3], cx + a[4], cy + a[5]]
          : a;
        out.push(['C', p[0], p[1], p[2], p[3], p[4], p[5]]);
        lastCtrlX = p[2];
        lastCtrlY = p[3];
        cx = p[4];
        cy = p[5];
        lastKind = 'C';
        break;
      }
      case 'S': {
        const x1 = lastKind === 'C' ? 2 * cx - lastCtrlX : cx;
        const y1 = lastKind === 'C' ? 2 * cy - lastCtrlY : cy;
        const p = rel ? [cx + a[0], cy + a[1], cx + a[2], cy + a[3]] : a;
        out.push(['C', x1, y1, p[0], p[1], p[2], p[3]]);
        lastCtrlX = p[0];
        lastCtrlY = p[1];
        cx = p[2];
        cy = p[3];
        lastKind = 'C';
        break;
      }
      case 'Q': {
        const p = rel ? [cx + a[0], cy + a[1], cx + a[2], cy + a[3]] : a;
        out.push(['Q', p[0], p[1], p[2], p[3]]);
        lastCtrlX = p[0];
        lastCtrlY = p[1];
        cx = p[2];
        cy = p[3];
        lastKind = 'Q';
        break;
      }
      case 'T': {
        const x1 = lastKind === 'Q' ? 2 * cx - lastCtrlX : cx;
        const y1 = lastKind === 'Q' ? 2 * cy - lastCtrlY : cy;
        const x = rel ? cx + a[0] : a[0];
        const y = rel ? cy + a[1] : a[1];
        out.push(['Q', x1, y1, x, y]);
        lastCtrlX = x1;
        lastCtrlY = y1;
        cx = x;
        cy = y;
        lastKind = 'Q';
        break;
      }
      case 'A': {
        const x = rel ? cx + a[5] : a[5];
        const y = rel ? cy + a[6] : a[6];
        const curves = arcToCubics(cx, cy, a[0], a[1], a[2], a[3] !== 0, a[4] !== 0, x, y);
        for (const c of curves) out.push(c);
        cx = x;
        cy = y;
        lastKind = '';
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** Converts an SVG elliptical arc into cubic Bezier segments. */
function arcToCubics(x1, y1, rx, ry, angleDeg, largeArc, sweep, x2, y2) {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) {
    return [['L', x2, y2]];
  }
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (angleDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = Math.sqrt(Math.max(0, num / den));
  if (largeArc === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cxx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cyy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const angle = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    let ang = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) ang = -ang;
    return ang;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dtheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI;
  if (sweep && dtheta < 0) dtheta += 2 * Math.PI;

  const segs = Math.ceil(Math.abs(dtheta) / (Math.PI / 2));
  const delta = dtheta / segs;
  const t = (4 / 3) * Math.tan(delta / 4);
  const out = [];
  let th = theta1;
  for (let s = 0; s < segs; s++) {
    const cos1 = Math.cos(th);
    const sin1 = Math.sin(th);
    const cos2 = Math.cos(th + delta);
    const sin2 = Math.sin(th + delta);
    const ep = (cx0, cy0) => [
      cosPhi * rx * cx0 - sinPhi * ry * cy0 + cxx,
      sinPhi * rx * cx0 + cosPhi * ry * cy0 + cyy,
    ];
    const p1 = ep(cos1 - t * sin1, sin1 + t * cos1);
    const p2 = ep(cos2 + t * sin2, sin2 - t * cos2);
    const p3 = ep(cos2, sin2);
    out.push(['C', p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]]);
    th += delta;
  }
  return out;
}

/**
 * Flattens parsed path commands into closed polygons in device space.
 * @param {Array} cmds output of parsePath
 * @param {number[]} m transform to device space
 * @param {number} tol flattening tolerance in device pixels
 * @returns {number[][]} list of polygons as flat [x0, y0, x1, y1, ...]
 */
function flattenPath(cmds, m, tol) {
  const polys = [];
  let cur = null;
  let px = 0;
  let py = 0;
  let startX = 0;
  let startY = 0;
  const tol2 = Math.max(tol, 0.05);

  const push = (x, y) => {
    const p = apply(m, x, y);
    cur.push(p[0], p[1]);
  };

  for (const c of cmds) {
    const k = c[0];
    if (k === 'M') {
      if (cur && cur.length >= 6) polys.push(cur);
      cur = [];
      push(c[1], c[2]);
      px = startX = c[1];
      py = startY = c[2];
    } else if (k === 'L') {
      if (!cur) {
        cur = [];
        push(px, py);
      }
      push(c[1], c[2]);
      px = c[1];
      py = c[2];
    } else if (k === 'Q' || k === 'C') {
      if (!cur) {
        cur = [];
        push(px, py);
      }
      // Estimate the segment count from the device-space control polygon length.
      const pts = k === 'Q' ? [px, py, c[1], c[2], c[3], c[4]] : [px, py, c[1], c[2], c[3], c[4], c[5], c[6]];
      let len = 0;
      let prev = apply(m, pts[0], pts[1]);
      for (let j = 2; j < pts.length; j += 2) {
        const q = apply(m, pts[j], pts[j + 1]);
        len += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
        prev = q;
      }
      const n = Math.max(1, Math.min(64, Math.ceil(Math.sqrt(len / tol2) * 1.2)));
      for (let s = 1; s <= n; s++) {
        const t = s / n;
        const u = 1 - t;
        let x;
        let y;
        if (k === 'Q') {
          x = u * u * px + 2 * u * t * c[1] + t * t * c[3];
          y = u * u * py + 2 * u * t * c[2] + t * t * c[4];
        } else {
          x = u * u * u * px + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5];
          y = u * u * u * py + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6];
        }
        push(x, y);
      }
      px = k === 'Q' ? c[3] : c[5];
      py = k === 'Q' ? c[4] : c[6];
    } else if (k === 'Z') {
      if (cur && cur.length >= 6) polys.push(cur);
      cur = null;
      px = startX;
      py = startY;
    }
  }
  if (cur && cur.length >= 6) polys.push(cur);
  return polys;
}

module.exports = {
  IDENTITY,
  multiply,
  apply,
  scaleOf,
  numbers,
  parseTransform,
  parsePath,
  flattenPath,
};
