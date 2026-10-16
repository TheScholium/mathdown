'use strict';
/* Generates the 48x48 button icons with the plugin's own renderer. */
const fs = require('fs');
const path = require('path');
const {MathRenderer} = require('../engine/mathrender');
const {Canvas} = require('../engine/raster');
const {encodePNG} = require('../engine/png');

const r = new MathRenderer({});
const out = path.join(__dirname, '..', 'assets');

function roundRect(x, y, w, h, rad, n) {
  const pts = [];
  const corners = [[x + w - rad, y + rad, -Math.PI / 2], [x + w - rad, y + h - rad, 0], [x + rad, y + h - rad, Math.PI / 2], [x + rad, y + rad, Math.PI]];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (Math.PI / 2) * (i / n);
      pts.push(cx + rad * Math.cos(a), cy + rad * Math.sin(a));
    }
  }
  return pts;
}

function frame(c, inset, stroke, rad) {
  const outer = roundRect(inset, inset, 48 - 2 * inset, 48 - 2 * inset, rad, 8);
  const innerFwd = roundRect(inset + stroke, inset + stroke, 48 - 2 * (inset + stroke), 48 - 2 * (inset + stroke), Math.max(1, rad - stroke), 8);
  const inner = [];
  for (let i = innerFwd.length - 2; i >= 0; i -= 2) inner.push(innerFwd[i], innerFwd[i + 1]);
  c.fill([outer, inner], 0, 1);
}

function save(name, c) {
  fs.writeFileSync(path.join(out, name), encodePNG(c.toGrayAlpha(), c.width, c.height, 2));
  console.log('wrote assets/' + name);
}

// Main toolbar button: framed square root of x (an editor for math).
let c = new Canvas(48, 48);
frame(c, 3, 3, 8);
r.drawCentered(c, '\\sqrt{x}', 20, 24, 25, false);
save('icon.png', c);

// Lasso button: "TeX" logo with an arrow (render the selected TeX).
c = new Canvas(48, 48);
r.drawCentered(c, '\\mathrm{T\\kern-.17em\\raise-.5ex{E}\\kern-.12em X}', 22, 24, 17, false);
r.drawCentered(c, '\\boldsymbol{\\Downarrow}', 20, 24, 37, false);
save('icon-render.png', c);

// Larger icon for the plugin list.
c = new Canvas(48, 48);
frame(c, 2, 3, 9);
r.drawCentered(c, '\\Sigma', 28, 24, 24, false);
save('plugin-icon.png', c);
