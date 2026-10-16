'use strict';
/**
 * MathJax 3 set-up for a DOM-free JavaScript runtime (Hermes on the
 * Supernote, or Node for tests). TeX input, SVG output, lite DOM adaptor.
 *
 * Every require() is static so that the Metro bundler includes the modules.
 */
const {mathjax} = require('mathjax-full/js/mathjax.js');
const {TeX} = require('mathjax-full/js/input/tex.js');
const {SVG} = require('mathjax-full/js/output/svg.js');
const {liteAdaptor} = require('mathjax-full/js/adaptors/liteAdaptor.js');
const {RegisterHTMLHandler} = require('mathjax-full/js/handlers/html.js');

// TeX extension packages (each registers itself on load).
require('mathjax-full/js/input/tex/base/BaseConfiguration.js');
require('mathjax-full/js/input/tex/ams/AmsConfiguration.js');
require('mathjax-full/js/input/tex/amscd/AmsCdConfiguration.js');
require('mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js');
require('mathjax-full/js/input/tex/configmacros/ConfigMacrosConfiguration.js');
require('mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js');
require('mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js');
require('mathjax-full/js/input/tex/braket/BraketConfiguration.js');
require('mathjax-full/js/input/tex/cancel/CancelConfiguration.js');
require('mathjax-full/js/input/tex/cases/CasesConfiguration.js');
require('mathjax-full/js/input/tex/centernot/CenternotConfiguration.js');
require('mathjax-full/js/input/tex/color/ColorConfiguration.js');
require('mathjax-full/js/input/tex/enclose/EncloseConfiguration.js');
require('mathjax-full/js/input/tex/extpfeil/ExtpfeilConfiguration.js');
require('mathjax-full/js/input/tex/gensymb/GensymbConfiguration.js');
require('mathjax-full/js/input/tex/mathtools/MathtoolsConfiguration.js');
require('mathjax-full/js/input/tex/mhchem/MhchemConfiguration.js');
require('mathjax-full/js/input/tex/physics/PhysicsConfiguration.js');
require('mathjax-full/js/input/tex/textcomp/TextcompConfiguration.js');
require('mathjax-full/js/input/tex/textmacros/TextMacrosConfiguration.js');
require('mathjax-full/js/input/tex/upgreek/UpgreekConfiguration.js');
require('mathjax-full/js/input/tex/bbox/BboxConfiguration.js');
require('mathjax-full/js/input/tex/empheq/EmpheqConfiguration.js');
require('mathjax-full/js/input/tex/verb/VerbConfiguration.js');
require('mathjax-full/js/input/tex/tagformat/TagFormatConfiguration.js');

const PACKAGES = [
  'base',
  'ams',
  'amscd',
  'newcommand',
  'configmacros',
  'noundefined',
  'boldsymbol',
  'braket',
  'cancel',
  'cases',
  'centernot',
  'color',
  'enclose',
  'extpfeil',
  'gensymb',
  'mathtools',
  'mhchem',
  'physics',
  'textcomp',
  'textmacros',
  'upgreek',
  'bbox',
  'empheq',
  'verb',
  'tagformat',
];

/** Common shortcuts. Users can add more in the settings ("preamble"). */
const DEFAULT_MACROS = {
  R: '\\mathbb{R}',
  C: '\\mathbb{C}',
  N: '\\mathbb{N}',
  Z: '\\mathbb{Z}',
  Q: '\\mathbb{Q}',
};

let adaptorSingleton = null;

function getAdaptor() {
  if (!adaptorSingleton) {
    adaptorSingleton = liteAdaptor();
    RegisterHTMLHandler(adaptorSingleton);
  }
  return adaptorSingleton;
}

/**
 * Creates a fresh MathJax document. A new document has fresh \newcommand
 * state, so call this when the document's definitions change.
 * @param {object} [opts]
 * @param {object} [opts.macros] extra macros {name: expansion}
 * @param {string} [opts.preamble] TeX with \newcommand etc. run once first
 */
function createMathDocument(opts) {
  opts = opts || {};
  const adaptor = getAdaptor();
  const tex = new TeX({
    packages: PACKAGES,
    macros: Object.assign({}, DEFAULT_MACROS, opts.macros || {}),
    tags: 'none', // like Obsidian: no automatic numbers; \tag{...} still works
    formatError: (jax, err) => jax.formatError(err),
  });
  const svg = new SVG({fontCache: 'none', exFactor: 0.5, mtextInheritFont: false});
  const doc = mathjax.document('', {InputJax: tex, OutputJax: svg});
  if (opts.preamble && opts.preamble.trim()) {
    try {
      doc.convert(opts.preamble, {display: true});
    } catch (e) {
      // A bad preamble must not stop rendering.
    }
  }
  return {doc, adaptor};
}

module.exports = {createMathDocument, getAdaptor, PACKAGES, DEFAULT_MACROS};
