/**
 * Snippet palette for typing TeX on the on-screen keyboard.
 * In "insert", the character "|" marks the cursor position after insertion
 * (the first "|" only; use "\\vert" for a literal bar in snippets).
 * If text is selected, "|" is replaced by the selection (wrap mode).
 */
export type Snippet = {label: string; insert: string};
export type SnippetGroup = {name: string; items: Snippet[]};

export const SNIPPET_GROUPS: SnippetGroup[] = [
  {
    name: 'Basic',
    items: [
      {label: '$ $', insert: '$|$'},
      {label: '$$ $$', insert: '\n$$\n|\n$$\n'},
      {label: '\\', insert: '\\|'},
      {label: '{ }', insert: '{|}'},
      {label: 'x^', insert: '^{|}'},
      {label: 'x_', insert: '_{|}'},
      {label: 'a/b', insert: '\\frac{|}{}'},
      {label: '√', insert: '\\sqrt{|}'},
      {label: '( )', insert: '\\left( | \\right)'},
      {label: '[ ]', insert: '\\left[ | \\right]'},
      {label: '&', insert: '&'},
      {label: '\\\\', insert: ' \\\\\n|'},
      {label: 'text', insert: '\\text{|}'},
      {label: 'space', insert: '\\,|'},
    ],
  },
  {
    name: 'Calculus',
    items: [
      {label: '∫', insert: '\\int_{|}^{} '},
      {label: '∮', insert: '\\oint_{|} '},
      {label: '∑', insert: '\\sum_{|}^{} '},
      {label: '∏', insert: '\\prod_{|}^{} '},
      {label: 'lim', insert: '\\lim_{| \\to } '},
      {label: '∂', insert: '\\partial '},
      {label: '∇', insert: '\\nabla '},
      {label: '∞', insert: '\\infty '},
      {label: 'd/dx', insert: '\\dv{|}{x}'},
      {label: '∂/∂x', insert: '\\pdv{|}{x}'},
      {label: 'dx', insert: '\\,\\mathrm{d}|'},
      {label: '·', insert: '\\cdot '},
      {label: '×', insert: '\\times '},
      {label: '±', insert: '\\pm '},
    ],
  },
  {
    name: 'Greek',
    items: [
      'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta',
      'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi',
      'varphi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma',
      'Phi', 'Psi', 'Omega',
    ].map(n => ({label: greekGlyph(n), insert: '\\' + n + ' '})),
  },
  {
    name: 'Relations',
    items: [
      {label: '=', insert: ' = '},
      {label: '≠', insert: ' \\neq '},
      {label: '≈', insert: ' \\approx '},
      {label: '≡', insert: ' \\equiv '},
      {label: '∝', insert: ' \\propto '},
      {label: '≤', insert: ' \\leq '},
      {label: '≥', insert: ' \\geq '},
      {label: '≪', insert: ' \\ll '},
      {label: '→', insert: ' \\to '},
      {label: '⇒', insert: ' \\implies '},
      {label: '⇔', insert: ' \\iff '},
      {label: '↦', insert: ' \\mapsto '},
      {label: '∈', insert: ' \\in '},
      {label: '⊂', insert: ' \\subset '},
      {label: '∪', insert: ' \\cup '},
      {label: '∩', insert: ' \\cap '},
      {label: '∀', insert: '\\forall '},
      {label: '∃', insert: '\\exists '},
    ],
  },
  {
    name: 'Accents',
    items: [
      {label: 'bold', insert: '\\mathbf{|}'},
      {label: 'bold sym', insert: '\\boldsymbol{|}'},
      {label: 'vec', insert: '\\vec{|}'},
      {label: 'hat', insert: '\\hat{|}'},
      {label: 'bar', insert: '\\bar{|}'},
      {label: 'dot', insert: '\\dot{|}'},
      {label: 'ddot', insert: '\\ddot{|}'},
      {label: 'tilde', insert: '\\tilde{|}'},
      {label: 'ℝ', insert: '\\mathbb{|}'},
      {label: 'cal', insert: '\\mathcal{|}'},
      {label: 'rm', insert: '\\mathrm{|}'},
      {label: 'box', insert: '\\boxed{|}'},
    ],
  },
  {
    name: 'Physics',
    items: [
      {label: '⟨ψ|', insert: '\\bra{|}'},
      {label: '|ψ⟩', insert: '\\ket{|}'},
      {label: '⟨a|b⟩', insert: '\\braket{|}{}'},
      {label: '⟨A⟩', insert: '\\expval{|}'},
      {label: '|x|', insert: '\\abs{|}'},
      {label: '‖v‖', insert: '\\norm{|}'},
      {label: 'ħ', insert: '\\hbar '},
      {label: '†', insert: '^\\dagger '},
      {label: '[A,B]', insert: '\\comm{|}{}'},
      {label: 'Tr', insert: '\\Tr '},
      {label: 'grad', insert: '\\grad '},
      {label: 'div', insert: '\\div '},
      {label: 'curl', insert: '\\curl '},
      {label: 'ce', insert: '\\ce{|}'},
    ],
  },
  {
    name: 'Blocks',
    items: [
      {label: 'aligned', insert: '\\begin{aligned}\n| &= \\\\\n &= \n\\end{aligned}'},
      {label: 'cases', insert: '\\begin{cases}\n| & \\text{if } \\\\\n & \\text{otherwise}\n\\end{cases}'},
      {label: 'pmatrix', insert: '\\begin{pmatrix}\n| & \\\\\n & \n\\end{pmatrix}'},
      {label: 'bmatrix', insert: '\\begin{bmatrix}\n| & \\\\\n & \n\\end{bmatrix}'},
      {label: 'vmatrix', insert: '\\begin{vmatrix}\n| & \\\\\n & \n\\end{vmatrix}'},
      {label: 'newcommand', insert: '\\newcommand{\\|}{}'},
      {label: 'tag', insert: '\\tag{|}'},
    ],
  },
  {
    name: 'Obsidian',
    items: [
      {label: '[[link]]', insert: '[[|]]'},
      {label: '![[embed]]', insert: '![[|]]'},
      {label: '[[#heading]]', insert: '[[#|]]'},
      {label: 'theorem', insert: '\n> [!theorem] |\n> \n'},
      {label: 'definition', insert: '\n> [!definition] |\n> \n'},
      {label: 'lemma', insert: '\n> [!lemma] |\n> \n'},
      {label: 'proof', insert: '\n> [!proof]-\n> |\n'},
      {label: 'example', insert: '\n> [!example] |\n> \n'},
      {label: 'note', insert: '\n> [!note] |\n> \n'},
      {label: 'warning', insert: '\n> [!warning] |\n> \n'},
      {label: '==mark==', insert: '==|=='},
      {label: '%%hide%%', insert: '%%|%%'},
      {label: '#tag', insert: '#|'},
      {label: 'footnote', insert: '[^|]'},
      {label: '^block', insert: ' ^|'},
      {label: 'properties', insert: '---\ntags: [|]\naliases: []\n---\n'},
    ],
  },
  {
    name: 'Markdown',
    items: [
      {label: 'H1', insert: '\n# |'},
      {label: 'H2', insert: '\n## |'},
      {label: 'H3', insert: '\n### |'},
      {label: 'bold', insert: '**|**'},
      {label: 'italic', insert: '*|*'},
      {label: 'code', insert: '`|`'},
      {label: '• list', insert: '\n- |'},
      {label: '1. list', insert: '\n1. |'},
      {label: '☐ task', insert: '\n- [ ] |'},
      {label: 'quote', insert: '\n> |'},
      {label: 'table', insert: '\n| | |\n|---|---|\n| | |\n'},
      {label: 'rule', insert: '\n---\n|'},
    ],
  },
];

function greekGlyph(name: string): string {
  const map: {[k: string]: string} = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
    theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
    rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ',
    Omega: 'Ω',
  };
  return map[name] || name;
}

/**
 * Applies a snippet to text with a selection.
 * @returns new text and the new cursor position
 */
export function applySnippet(
  text: string,
  sel: {start: number; end: number},
  snippet: string,
): {text: string; cursor: number; selectionEnd: number} {
  const start = Math.max(0, Math.min(sel.start, text.length));
  const end = Math.max(start, Math.min(sel.end, text.length));
  const selected = text.slice(start, end);
  const mark = snippet.indexOf('|');
  let ins: string;
  let cursor: number;
  let selectionEnd: number;
  if (mark >= 0) {
    ins = snippet.slice(0, mark) + selected + snippet.slice(mark + 1);
    cursor = start + mark;
    selectionEnd = cursor + selected.length;
    if (selected.length) {
      // Wrapped a selection: put the cursor after the wrapped text.
      cursor = selectionEnd;
    }
  } else {
    ins = snippet;
    cursor = start + ins.length;
    selectionEnd = cursor;
  }
  // Avoid a blank line at the very start of the document.
  if (start === 0 && ins.startsWith('\n')) {
    ins = ins.slice(1);
    cursor = Math.max(0, cursor - 1);
    selectionEnd = Math.max(0, selectionEnd - 1);
  }
  return {text: text.slice(0, start) + ins + text.slice(end), cursor, selectionEnd: Math.max(cursor, selectionEnd)};
}
