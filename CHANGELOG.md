# Changelog

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
