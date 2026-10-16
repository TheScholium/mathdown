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

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log('FAIL ' + f);
  process.exit(1);
}
