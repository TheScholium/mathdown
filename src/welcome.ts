/** The example note shown on first start and from Help. */
const RAW = String.raw`# Welcome to Mathdown

Mathdown is a **Markdown** editor that renders **TeX math** on your Supernote, offline. Files are plain {BT}.md{BT}, so the same notes open in Obsidian and other editors.

## Math

Inline math goes between single dollar signs: the energy is $E = mc^2$ and $\hbar\omega$ is a photon energy. A dollar amount like $5 stays text.

Display math goes between double dollar signs:

$$
\int_{-\infty}^{\infty} e^{-x^2}\,\mathrm{d}x = \sqrt{\pi}
$$

Environments work too:

$$
\begin{aligned}
\nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} &
\nabla \times \mathbf{B} &= \mu_0 \mathbf{J} + \mu_0 \varepsilon_0 \pdv{\mathbf{E}}{t}
\end{aligned}
$$

The {BT}physics{BT}, {BT}mhchem{BT}, {BT}mathtools{BT}, {BT}braket{BT} and {BT}cancel{BT} packages are built in:

$$ \bra{\psi}\hat{H}\ket{\psi} = \expval{H}{\psi}, \qquad \ce{2H2 + O2 -> 2H2O} $$

Define your own macros once, anywhere in the note:

$$ \newcommand{\avg}[1]{\left\langle #1 \right\rangle} \avg{x^2} - \avg{x}^2 = \sigma_x^2 $$

## Markdown

- Lists, **bold**, *italic*, ~~strike~~ and {BT}code{BT}
- [x] Task lists
- [ ] Tables, quotes and code blocks

| Quantity | Symbol | Unit |
|:--|:-:|--:|
| Force | $\vb{F} = m\vb{a}$ | N |
| Charge | $q$ | C |

> Quotes can hold math too: $\oint \vb{E}\cdot \mathrm{d}\vb{A} = Q/\varepsilon_0$, and so can $\avg{x}$.

## Put formulas into a handwritten note

1. Put the cursor inside a formula (or select some TeX).
2. Tap **Insert ∑**. Mathdown renders a sharp image into the current note page.
3. Move the image with the lasso.

Or type TeX into a NOTE text box, lasso it, and tap **Render TeX** in the lasso toolbar.

## Tips

- **Split** shows the editor and the preview together. **View** shows only the preview; long-press a paragraph to jump to it in the editor.
- The snippet bar above the keyboard inserts {BT}\frac{}{}{BT}, Greek letters, matrices and more.
- Notes are saved in {BT}Document/Mathdown{BT}. Unsaved text is kept as a draft if Mathdown closes.
`;

export const WELCOME = RAW.replace(/\{BT\}/g, '`');
