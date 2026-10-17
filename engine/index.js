'use strict';
const {MathSession} = require('./session');
const {MathRenderer} = require('./mathrender');
const {
  parseMarkdown,
  collectMath,
  collectEmbeds,
  collectLinks,
  extractSection,
  findHeading,
  normAnchor,
  plainText,
  mathAtOffset,
  stripDelimiters,
  definesMacros,
} = require('./markdown');
const vault = require('./vault');
const {parseLinkTarget, linkLabel} = require('./obsidian');
const {encodePNG, toBase64} = require('./png');

module.exports = {
  MathSession,
  MathRenderer,
  parseMarkdown,
  collectMath,
  collectEmbeds,
  collectLinks,
  extractSection,
  findHeading,
  normAnchor,
  plainText,
  parseLinkTarget,
  linkLabel,
  buildIndex: vault.buildIndex,
  resolveLink: vault.resolveLink,
  newNotePath: vault.newNotePath,
  searchNotes: vault.searchNotes,
  mathAtOffset,
  stripDelimiters,
  definesMacros,
  encodePNG,
  toBase64,
};
