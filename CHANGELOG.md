# Changelog

## 1.2.0

### Changed
- The whole plugin is set in the style of the [Istari](https://github.com/TheScholium/istari) theme for Obsidian:
  - EB Garamond, Cormorant Garamond and JetBrains Mono, bundled and registered at start-up (OFL-1.1).
  - Headings as in Istari: h1 with a rule and a gold accent, h2 in gold italics after a four-pointed star, h3 to h5 in small caps.
  - Bold and links in small caps; old-style figures in prose, lining figures in tables and properties.
  - Callouts with a gold margin rule, small-caps titles, Lucide icons and Istari's labels ("Theorem: Title"). New types: `thm`, `def`, `example`, `remark`, `intuition`, `exercise`. `[!type|plain]` drops the label. Warning types in pale red.
  - Properties without a box; tags as small-caps labels; booktabs tables; a diamond horizontal rule; quotes as marginal notes; gold task boxes.
  - Interface: hairline gold buttons with small-caps labels, Istari's hand-drawn icons (codex, key, scroll), a small-caps breadcrumb, quiet dialogs.
- Black math is drawn in the color of the text around it (gold in headings, italic body in results). Colored math keeps its colors.
- New notes start empty: the file name is the title.
- "Hide symbols" is now a **Symbols** toggle.

### Added
- Two palettes: **Istari Paper** (default, Istari's print palette, for e-ink) and **Istari Night** (the screen palette).
- Sidenotes: footnotes open in place under their line; `? ` marks a query.
- Inline title, editor face (Garamond or Mono) and sidenote settings.
- `cssclasses: vellum` gives a larger, airier page, as in Istari.

### Removed
- `docs/obsidian-math-callouts.css`. Use the Istari theme in Obsidian instead; Mathdown now follows it.

### Fixed
- Table columns did not line up between rows.

## 1.1.0

### Added
- Obsidian-flavored Markdown:
  - `[[wikilinks]]` (with `#Heading`, `#^block`, `|alias`) and Markdown links to notes. Tap to open, with a **← Back** history. Missing notes can be created from the link.
  - Embeds of notes, sections, blocks and images (`![[...]]`, `![](...)`).
  - Callouts, including foldable ones, with a LaTeX style for `theorem`, `lemma`, `definition`, `proof` and related types.
  - Properties (front matter), `#tags`, `==highlights==`, `%%comments%%`, block IDs and footnotes.
  - Tap a task box in the preview to tick it.
- Vault folder setting and a file index for link resolution (native `listTree`).
- Auto-save for notes that have a file (on by default).
- "Obsidian" group in the symbol bar.
- `docs/obsidian-math-callouts.css`: the same callout look in Obsidian.

### Fixed
- A note made with **Files > New note** was saved with the text of the note that was open before.
- Two spaces left where a `%%comment%%` was removed.

## 1.0.0

First release.
