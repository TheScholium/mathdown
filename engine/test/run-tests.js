'use strict';
/* Engine tests. Run with: npm test (Node 18+). */
const assert = require('assert');
const E = require('..');

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(name + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  }
}

const isPNG = b => b && b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71;
const types = blocks => blocks.map(b => b.type).join(',');

/* ---------- Markdown + math syntax ---------- */
test('inline $ math', () => {
  const b = E.parseMarkdown('a $x^2$ b');
  assert.strictEqual(b[0].runs[1].type, 'math');
  assert.strictEqual(b[0].runs[1].tex, 'x^2');
});
test('currency is not math', () => {
  const b = E.parseMarkdown('costs $5 and $10 today');
  assert.ok(b[0].runs.every(r => r.type === 'text'));
});
test('escaped dollar', () => {
  const b = E.parseMarkdown('a \\$ b $c$');
  assert.strictEqual(b[0].runs[0].text, 'a $ b ');
  assert.strictEqual(b[0].runs[1].tex, 'c');
});
test('space after opening $ is not math', () => {
  const b = E.parseMarkdown('a $ x$ b');
  assert.ok(b[0].runs.every(r => r.type === 'text'));
});
test('display $$ multi-line', () => {
  const b = E.parseMarkdown('$$\n\\frac{a}{b}\n$$');
  assert.strictEqual(types(b), 'math');
  assert.strictEqual(b[0].tex, '\\frac{a}{b}');
});
test('display $$ one line', () => {
  assert.strictEqual(E.parseMarkdown('$$ a=b $$')[0].tex, 'a=b');
});
test('display inside paragraph splits', () => {
  assert.strictEqual(types(E.parseMarkdown('before $$x$$ after')), 'paragraph,math,paragraph');
});
test('\\[ \\] and \\( \\)', () => {
  assert.strictEqual(E.parseMarkdown('\\[ y \\]')[0].type, 'math');
  assert.strictEqual(E.parseMarkdown('a \\(z\\) b')[0].runs[1].tex, 'z');
});
test('math environments', () => {
  const b = E.parseMarkdown('\\begin{align}\na&=b\n\\end{align}');
  assert.strictEqual(b[0].type, 'math');
  assert.ok(b[0].tex.startsWith('\\begin{align}'));
});
test('math fence', () => {
  assert.strictEqual(E.parseMarkdown('```math\n\\sum\n```')[0].tex, '\\sum');
});
test('code is not math', () => {
  const b = E.parseMarkdown('`$x$`\n\n```\n$$y$$\n```');
  assert.strictEqual(b[0].runs[0].code, true);
  assert.strictEqual(b[1].type, 'code');
});
test('lists, tasks, quotes, tables', () => {
  const b = E.parseMarkdown('- [x] done $a$\n- [ ] todo\n\n> q\n\n| a | b |\n|---|:-:|\n| 1 | $2$ |');
  assert.strictEqual(types(b), 'list,quote,table');
  assert.strictEqual(b[0].items[0].task, true);
  assert.strictEqual(b[0].items[1].task, false);
  assert.strictEqual(b[2].align[1], 'center');
  assert.strictEqual(b[2].rows[0][1][0].type, 'math');
});
test('unclosed $$ stays text', () => {
  assert.strictEqual(E.parseMarkdown('$$\na+b')[0].type, 'paragraph');
});
test('collectMath counts all', () => {
  assert.strictEqual(E.collectMath(E.parseMarkdown('# $a$\n\n- $b$\n\n$$c$$\n\n| $d$ |\n|---|\n| $e$ |')).length, 5);
});
test('mathAtOffset and stripDelimiters', () => {
  assert.deepStrictEqual(E.mathAtOffset('see $a+b$ here', 6), {tex: 'a+b', display: false, start: 4, end: 9});
  assert.strictEqual(E.mathAtOffset('x $$\nq\n$$ y', 5).display, true);
  assert.strictEqual(E.mathAtOffset('no math', 3), null);
  assert.strictEqual(E.stripDelimiters(' $$x$$ '), 'x');
  assert.strictEqual(E.stripDelimiters('\\(y\\)'), 'y');
  assert.strictEqual(E.stripDelimiters('```math\nz\n```'), 'z');
  assert.strictEqual(E.stripDelimiters('\\frac12'), '\\frac12');
});

/* ---------- Rendering ---------- */
const S = new E.MathSession();
S.setContext([], '');
const corpus = [
  '\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}',
  '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}',
  '\\begin{aligned}a&=b\\\\c&=d\\end{aligned}',
  '\\ce{H2O -> H2 + 1/2 O2}',
  '\\dv{f}{x} \\pdv{f}{y} \\bra{a}\\ket{b} \\abs{x} \\norm{v}',
  '\\cancel{x}\\boxed{y}\\enclose{circle}{z}',
  '\\color{red}{x}\\colorbox{yellow}{y}',
  '\\begin{array}{c|c}a&b\\\\\\hline c&d\\end{array}',
  '\\overbrace{a+b}^{n} \\underbrace{c}_{m} \\overrightarrow{AB}',
  '\\R \\C \\N \\Z \\Q',
  '\\mathbb{R} \\mathcal{L} \\mathfrak{g} \\mathscr{F} \\boldsymbol{\\alpha}',
  '\\xrightarrow[a]{b} \\tag{1}',
];
corpus.forEach((tex, i) => {
  test('render #' + i + ' ' + tex.slice(0, 30), () => {
    const r = S.preview(tex, true, 36);
    assert.ok(r.ok, r.error);
    assert.ok(r.uri.startsWith('data:image/png;base64,iVBOR'));
    assert.ok(r.width > 5 && r.height > 5 && r.ascent > 0 && r.ascent <= r.height);
  });
});
test('note export is transparent PNG', () => {
  const r = S.forNote('E=mc^2', true, 80, 300);
  assert.ok(r.ok);
  assert.ok(isPNG(r.png));
  assert.strictEqual(r.png[25], 4); // color type gray+alpha
});
test('TeX errors are reported', () => {
  const r = S.preview('\\frac{1}{', true, 36);
  assert.strictEqual(r.ok, false);
  assert.ok(/brace/i.test(r.error));
});
test('undefined macro renders (noundefined)', () => {
  const r = S.preview('\\notamacro x', false, 36);
  assert.ok(r.ok);
});
test('document macros apply everywhere', () => {
  const blocks = E.parseMarkdown('Use $\\vv{x}$ here.\n\n$$\\newcommand{\\vv}[1]{\\mathbf{#1}}$$');
  const s = new E.MathSession();
  assert.strictEqual(s.setContext(blocks, ''), true);
  assert.strictEqual(s.setContext(blocks, ''), false);
  const a = s.preview('\\vv{x}', false, 36);
  const plain = s.preview('\\mathbf{x}', false, 36);
  assert.ok(a.ok);
  assert.strictEqual(a.uri, plain.uri);
});
test('global preamble applies', () => {
  const s = new E.MathSession();
  s.setContext([], '\\newcommand{\\ip}[2]{\\langle #1,#2\\rangle}');
  assert.strictEqual(s.preview('\\ip{a}{b}', false, 36).uri, s.preview('\\langle a,b\\rangle', false, 36).uri);
});
test('cache returns same object', () => {
  assert.strictEqual(S.preview('x', false, 36), S.preview('x', false, 36));
});
test('unsupported characters flagged', () => {
  assert.strictEqual(S.preview('\\text{世}', false, 36).unsupportedText, true);
});
test('base64 round trip', () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253]);
  assert.strictEqual(E.toBase64(bytes), Buffer.from(bytes).toString('base64'));
});

/* ---------- Obsidian-flavored Markdown ---------- */
const find = (blocks, type) => blocks.find(b => b.type === type);
test('front matter becomes properties, line numbers kept', () => {
  const b = E.parseMarkdown('---\ntags: [physics, "quantum mechanics"]\naliases:\n  - Ladder\nstatus: draft\n---\n# Title\n\ntags: no\n---\n');
  const p = b[0];
  assert.strictEqual(p.type, 'properties');
  assert.deepStrictEqual(p.props[0], {key: 'tags', value: ['physics', 'quantum mechanics']});
  assert.deepStrictEqual(p.props[1], {key: 'aliases', value: ['Ladder']});
  assert.strictEqual(p.props[2].value, 'draft');
  assert.strictEqual(b[1].type, 'heading');
  assert.strictEqual(b[1].line, 6);
});
test('front matter not closed is plain text', () => {
  assert.notStrictEqual(E.parseMarkdown('---\ntags: x\n')[0].type, 'properties');
});
test('wikilinks with heading, block and alias', () => {
  const runs = E.parseMarkdown('See [[Note]], [[Note#Part 2|alias]], [[#Local]] and [[Note#^abc]].')[0].runs;
  const links = runs.filter(r => r.link);
  assert.strictEqual(links.length, 4);
  assert.deepStrictEqual(links[0].link, {page: 'Note', sub: null, alias: null});
  assert.strictEqual(links[1].text, 'alias');
  assert.deepStrictEqual(links[2].link, {page: '', sub: 'Local', alias: null});
  assert.strictEqual(links[2].text, 'Local');
  assert.strictEqual(links[3].link.sub, '^abc');
});
test('escaped pipe in a table wikilink', () => {
  const t = E.parseMarkdown('| a | b |\n|---|---|\n| [[Note\\|shown]] | x |')[0];
  const r = t.rows[0][0].find(x => x.link);
  assert.ok(r, 'link in cell');
  assert.strictEqual(r.link.page, 'Note');
});
test('markdown links to notes are internal, URLs are external', () => {
  const runs = E.parseMarkdown('[a](Other%20Note.md#Sec) [b](https://x.org)')[0].runs;
  assert.deepStrictEqual(runs[0].link, {page: 'Other Note.md', sub: 'Sec', alias: null});
  assert.strictEqual(runs[2].href, 'https://x.org');
});
test('embeds split paragraphs', () => {
  const b = E.parseMarkdown('Before ![[fig.png|300]] after\n\n![[Note#Sec]]\n\n![x|200](a/b%201.png)');
  assert.deepStrictEqual(b.map(x => x.type), ['paragraph', 'embed', 'paragraph', 'embed', 'embed']);
  assert.strictEqual(b[1].target.alias, '300');
  assert.strictEqual(b[3].target.sub, 'Sec');
  assert.strictEqual(b[4].target.page, 'a/b 1.png');
  assert.strictEqual(b[4].target.alias, '200');
});
test('tags', () => {
  const runs = E.parseMarkdown('A #physics/qm tag, #2026 no, C# no, (#yes) and `#code`.')[0].runs;
  const tags = runs.filter(r => r.type === 'tag').map(r => r.tag);
  assert.deepStrictEqual(tags, ['physics/qm', 'yes']);
});
test('highlight, comments', () => {
  const runs = E.parseMarkdown('==hi *there*== x %%secret%% y')[0].runs;
  assert.strictEqual(runs[0].mark, true);
  assert.strictEqual(runs[1].italic && runs[1].mark, true);
  assert.ok(!JSON.stringify(runs).includes('secret'));
  assert.ok(JSON.stringify(runs).includes(' x y'));
  assert.deepStrictEqual(E.parseMarkdown('a\n\n%%\nhidden\nblock\n%%\n\nb').map(x => x.runs[0].text), ['a', 'b']);
});
test('callouts: kind, fold, title, body, math', () => {
  const b = E.parseMarkdown('> [!Theorem]- Spectral theorem for $A$\n> Every $A = A^*$ is diagonalizable.\n>\n> $$\\sigma(A)\\subset\\R$$');
  const c = b[0];
  assert.strictEqual(c.type, 'callout');
  assert.strictEqual(c.kind, 'theorem');
  assert.strictEqual(c.fold, '-');
  assert.strictEqual(c.title.find(r => r.type === 'math').tex, 'A');
  assert.deepStrictEqual(c.children.map(x => x.type), ['paragraph', 'math']);
  assert.strictEqual(E.collectMath(b).length, 3);
  const plain = E.parseMarkdown('> [!note]\n> body')[0];
  assert.strictEqual(plain.title, null);
  assert.strictEqual(E.parseMarkdown('> just a quote')[0].type, 'quote');
  const nested = E.parseMarkdown('> [!example] Outer\n> > [!proof]\n> > Inner')[0];
  assert.strictEqual(nested.children[0].type, 'callout');
});
test('block IDs', () => {
  const b = E.parseMarkdown('Claim here ^c1\n\n- item ^li\n\n| t |\n|---|\n\n^tbl');
  assert.strictEqual(b[0].id, 'c1');
  assert.strictEqual(b[0].runs[0].text, 'Claim here');
  assert.strictEqual(b[1].items[0].children[0].id, 'li');
  assert.strictEqual(b[2].id, 'tbl');
});
test('footnotes', () => {
  const b = E.parseMarkdown('Text[^a] and ^[inline $x$].\n\n[^a]: Note A.');
  assert.deepStrictEqual(b[0].runs.filter(r => r.type === 'fnref').map(r => r.n), [1, 2]);
  const f = b[b.length - 1];
  assert.strictEqual(f.type, 'footnotes');
  assert.strictEqual(f.items.length, 2);
  assert.strictEqual(E.collectMath(b).length, 1);
});
test('tasks keep their source line', () => {
  const l = E.parseMarkdown('# T\n\n- [ ] one\n- [x] two\n> - [ ] quoted')
  assert.strictEqual(l[1].items[1].line, 3);
  assert.strictEqual(l[1].items[1].taskChar, 'x');
  assert.strictEqual(l[2].children[0].items[0].line, 4);
});
test('sections for embeds', () => {
  const b = E.parseMarkdown('# A\n\nx\n\n## B: part\n\ny ^id1\n\n### C\n\nz\n\n## D\n\nw');
  assert.deepStrictEqual(E.extractSection(b, 'B: part').map(x => x.type), ['heading', 'paragraph', 'heading', 'paragraph']);
  assert.deepStrictEqual(E.extractSection(b, 'A#B part').length, 4);
  assert.strictEqual(E.extractSection(b, '^id1')[0].runs[0].text, 'y');
  assert.strictEqual(E.extractSection(b, 'Nope'), null);
});
test('collectLinks finds links, embeds and tags', () => {
  const r = E.collectLinks(E.parseMarkdown('---\ntags: [a, b]\n---\n[[X]] #c ![[Y]]'));
  assert.deepStrictEqual(r.links.map(l => l.page).sort(), ['X', 'Y']);
  assert.deepStrictEqual(r.tags.sort(), ['a', 'b', 'c']);
});

/* ---------- vault resolution ---------- */
const ROOT = '/sd/Vault';
const ix = E.buildIndex(
  ['Hamiltonian.md', 'QM/Commutators.md', 'Classical/Hamiltonian.md', 'QM/Oscillator.md', 'attachments/fig.png', 'QM/img/a b.png'].map(r => ({path: ROOT + '/' + r, rel: r})),
  ROOT,
);
const from = ROOT + '/QM/Oscillator.md';
const rel = q => {
  const e = E.resolveLink(ix, q, from);
  return e ? e.rel : null;
};
test('resolve by name, case, path, relative, attachments', () => {
  assert.strictEqual(rel('Commutators'), 'QM/Commutators.md');
  assert.strictEqual(rel('commutators.md'), 'QM/Commutators.md');
  assert.strictEqual(rel('Hamiltonian'), 'Hamiltonian.md'); // shortest path wins
  assert.strictEqual(rel('Classical/Hamiltonian'), 'Classical/Hamiltonian.md');
  assert.strictEqual(rel('../Hamiltonian'), 'Hamiltonian.md');
  assert.strictEqual(rel('fig.png'), 'attachments/fig.png');
  assert.strictEqual(rel('img/a b.png'), 'QM/img/a b.png');
  assert.strictEqual(rel('Missing'), null);
  assert.strictEqual(E.newNotePath(ix, 'New idea'), ROOT + '/New idea.md');
});
test('same folder wins over shortest path', () => {
  const i2 = E.buildIndex(['A.md', 'QM/A.md', 'QM/B.md'].map(r => ({path: ROOT + '/' + r, rel: r})), ROOT);
  assert.strictEqual(E.resolveLink(i2, 'A', ROOT + '/QM/B.md').rel, 'QM/A.md');
  assert.strictEqual(E.resolveLink(i2, 'A', ROOT + '/Other.md').rel, 'A.md');
});

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log('FAIL ' + f);
  process.exit(1);
}
