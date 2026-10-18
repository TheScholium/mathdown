'use strict';
/**
 * Rasterizes a simple SVG icon (Lucide, or Istari's hand-drawn icons) to a
 * PNG mask: gray 0 with alpha = coverage, so React Native can color it with
 * tintColor. Used at build time by tools/make-icons.js.
 */
const G = require('./geom');
const {Canvas} = require('./raster');
const {encodePNG} = require('./png');
const {drawTree} = require('./mathrender');
const {getAdaptor} = require('./mathjax-setup');

/**
 * @param {string} svg SVG source
 * @param {number} size output size in pixels (square)
 * @param {{strokeWidth?: number}} [opts] override the root stroke-width
 * @returns {Uint8Array} PNG bytes
 */
function rasterizeSvg(svg, size, opts) {
  opts = opts || {};
  const adaptor = getAdaptor();
  const doc = adaptor.parse(String(svg).replace(/<!--[\s\S]*?-->/g, ''), 'text/html');
  const root = adaptor.tags(adaptor.body(doc), 'svg')[0];
  if (!root) throw new Error('No <svg> element');
  const attr = name => adaptor.getAttribute(root, name);
  const vb = G.numbers(attr('viewBox') || '0 0 24 24');
  const k = size / Math.max(vb[2], vb[3]);
  const canvas = new Canvas(size, size);
  const sw = opts.strokeWidth !== undefined ? opts.strokeWidth : parseFloat(attr('stroke-width') || '2');
  const fill = attr('fill') || 'black';
  const stroke = attr('stroke') || 'none';
  drawTree(adaptor, root, canvas, [k, 0, 0, k, -vb[0] * k, -vb[1] * k], {}, {
    fill: fill === 'currentColor' ? 'black' : fill,
    stroke: stroke === 'currentColor' ? 'black' : stroke,
    strokeWidth: sw,
  });
  const ga = canvas.toGrayAlpha();
  for (let i = 0; i < ga.length; i += 2) ga[i] = 0; // pure mask: color comes from tintColor
  return encodePNG(ga, size, size, 2);
}

module.exports = {rasterizeSvg};
