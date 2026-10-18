# Mathdown for Supernote

Mathdown is a Supernote plugin. It is a Markdown editor that renders TeX math on the device, with no network connection. It reads and writes the same notes as Obsidian (links, embeds, callouts, properties), and it puts typeset formulas into handwritten notes. Since 1.2 the whole plugin is set in the style of [Istari](https://github.com/TheScholium/istari), a scholarly theme for Obsidian, so a note looks the same on the Supernote and on the computer.

[![Build](https://github.com/TheScholium/mathdown/actions/workflows/build.yml/badge.svg)](https://github.com/TheScholium/mathdown/actions/workflows/build.yml)
[![Latest release](https://img.shields.io/github/v/release/TheScholium/mathdown)](https://github.com/TheScholium/mathdown/releases/latest)

**Download:** [`mathdown.snplg`](https://github.com/TheScholium/mathdown/releases/latest/download/mathdown.snplg) · Tested on a Supernote Nomad (A6 X2) with Chauvet 3.30.45.

| Istari Paper (default) | Istari Night | Split view |
|---|---|---|
| ![Istari Paper](docs/screenshot-obsidian.png) | ![Istari Night](docs/screenshot-night.png) | ![Split view](docs/screenshot-split.png) |

## Features

- **Plain `.md` files.** The math syntax is the same as in Obsidian: `$...$` for inline math and `$$...$$` for display math. `\(...\)`, `\[...\]`, ```` ```math ```` fences and `\begin{align}`-type environments also work.
- **Three views.** *Edit* (source only), *Split* (source above, live preview below), and *View* (preview only). In *View*, long-press a paragraph to go to its source line.
- **Offline TeX.** MathJax 3 converts TeX to vector shapes, and a JavaScript rasterizer turns the shapes into anti-aliased PNG images. Packages: `ams`, `mathtools`, `physics`, `mhchem`, `braket`, `cancel`, `cases`, `color`, `enclose`, `bbox`, `boldsymbol`, `upgreek`, `gensymb`, `textmacros`, `newcommand`, `empheq`, `amscd`, `extpfeil`, `centernot`, `verb`. `\R \C \N \Z \Q` are built in.
- **Macros.** Use `\newcommand` anywhere in a note; it applies to the whole note. Put global macros in *Settings > Global TeX preamble*.
- **Insert into a note.** Put the cursor in a formula (or select TeX) and tap **Insert ∑**. Mathdown inserts a sharp, transparent PNG into the current layer of the open NOTE page.
- **Render TeX from the lasso.** Type TeX into a normal NOTE text box, lasso it, and tap **Render TeX** in the lasso toolbar. The UI does not open. Mixed text such as `Area $A=\pi r^2$` also works.
- **Symbol bar** for the on-screen keyboard: structures, calculus, Greek, relations, accents, physics (`\bra`, `\ket`, `\dv`, ...), environments and Markdown.
- **Safe editing.** Undo and redo, an auto-saved draft (unsaved text comes back if the plugin closes), atomic file writes, and a prompt before you lose changes.
- **Istari style** (1.2). EB Garamond for text, Cormorant Garamond for titles, JetBrains Mono for code (bundled; they work offline). Bold and links in small caps, old-style figures in prose and lining figures in tables, an h1 rule with a gold accent, a star before each h2, booktabs tables, a diamond rule, and Istari's own hand-drawn icons. Math takes the color of the text around it.
- **Two palettes.** *Istari Paper* (default) is Istari's print palette: dark ink on white, made for paper and so for e-ink. *Istari Night* is the screen palette. No animations, large touch targets, few screen refreshes while math renders.
- **Markdown.** Headings, emphasis, strike-through, inline code, code blocks, block quotes, nested lists, task lists, tables (with alignment) and horizontal rules.
- **Obsidian-flavored Markdown** (1.1):
  - `[[wikilinks]]` with `#Heading`, `#^block` and `|alias`, and Markdown links to notes. Tap to open; **← Back** returns. Links resolve the way Obsidian resolves them (by name, shortest path, or relative path). A missing note is offered for creation; it shows dashed and gray.
  - Embeds: `![[Note]]`, `![[Note#Heading]]`, `![[Note#^id]]` (the section, with its math) and images `![[figure.png|300]]` / `![alt](path.png)`.
  - Callouts `> [!type] Title`, foldable with `+`/`-`, as Istari draws them: a gold margin rule, a small-caps title with its Lucide icon, one pigment for all types and a pale red for the warning family. Istari's mathematical vocabulary: `theorem` (`thm`), `definition` (`def`), `lemma`, `proposition`, `corollary`, `proof`, `example`, `remark`, `axiom`, `conjecture`, `intuition`, `exercise`. Titles read "Theorem: Title"; `[!theorem|plain]` drops the label. Results are in italics; a proof has an italic title and ends with ∎.
  - Properties (YAML front matter) as quiet small-caps keys with italic values, `#tags` (also nested) as small-caps labels, `==highlights==`, `%%comments%%` (hidden), block IDs `^id`, `cssclasses: vellum`.
  - Footnotes `[^1]` / `^[inline]` as **sidenotes**: tap the bare gold number and the note opens in place under its line. A note that starts with `? ` is a query, marked in verdigris. (Settings can list them at the end instead.)
  - The file name as an inline title above the note, as in Obsidian.
  - Tap a task box in the preview to tick it in the file.
- **Auto-save** for notes that have a file (like Obsidian). Untitled notes still ask for a name.

## Requirements

- Supernote Manta or Nomad with **Chauvet 3.30.45 or later** (the first stable firmware with plugins), or a plugin beta build.
- The file `mathdown.snplg` from the [latest release](https://github.com/TheScholium/mathdown/releases/latest) (or `build/outputs/` after a build).

## Install

1. Connect the Supernote to your computer (USB, Supernote Partner app, or Browse & Access).
2. Copy `mathdown.snplg` into the **MyStyle** folder on the Supernote.
3. On the Supernote, open **Settings > Apps > Plugins**.
4. Tap **Add Plugin**, select `mathdown.snplg`, and tap **Install**.
5. Open a note. Find the **Mathdown** button in the NOTE toolbar.

When Mathdown first reads or saves a file, the system asks for permission. Select **Always allow** to stop the question from coming back. If you select **Allow this time only**, the permission ends when the plugin closes.

## Use

| Task | Do this |
|---|---|
| Open the editor | Tap **Mathdown** in the NOTE or DOC toolbar. |
| Open or make a note | Tap **Files**. Tap a note to open it. Long-press a note to rename or delete it. **Browse device…** opens the system file picker. |
| Save | Tap **Save**. A new note asks for a name; the first heading is the default. |
| See the result | Tap **Split** or **View**. In *Split*, the preview updates after you stop typing (see Settings) or when you tap **Render**. |
| Type TeX quickly | Use the symbol bar. A snippet wraps the selected text if there is a selection. |
| Insert a formula into the page | Put the cursor in the formula and tap **Insert ∑**. Then move the image with the lasso. |
| Render a NOTE text box | Lasso the text box, then tap **Render TeX**. |
| Open the settings | Tap the key, or tap the settings button of Mathdown in **Settings > Apps > Plugins**. |
| Follow a link | Tap it in *Split* or *View*. **Back** returns to the note before. |
| Read a footnote | Tap its gold number. Tap again to close it. |
| Make a note from a link | Tap a gray, dashed link, then **Create**. |
| See the example note | Tap **Help**. |

### Where files go

| What | Where |
|---|---|
| Markdown notes | Your vault folder: `Document/Mathdown/` by default (change it in Settings) |
| Formula images for notes | `EXPORT/Mathdown/formula-YYYYMMDD-HHMMSS-N.png` |
| Settings, draft, recent list | The plugin's private folder (no permission needed) |

The `Document` folder syncs with Supernote Cloud and the other sync services.

### Use with Obsidian on a computer

1. Make the vault a folder that the Supernote syncs (for example `Document/Zettel` in Dropbox or Google Drive), and open that folder as a vault in Obsidian.
2. In Mathdown, set **Settings > Vault folder** to the same folder on the Supernote.
3. Recommended: use the [Istari](https://github.com/TheScholium/istari) theme in Obsidian (and the Istari Companion plugin for sidenotes). Then callouts, properties, headings and footnotes look the same on both devices.

Supernote sync is manual. Tap **Sync** on the Supernote before you edit on the computer, and let the computer sync before you edit on the Supernote; otherwise the sync service makes a conflict copy. Obsidian plugins (Dataview, Canvas, ...) are not supported; their syntax shows as plain text.

### Settings

- **Palette** (Istari Paper or Istari Night), **Inline title**, **Sidenotes** (in place or at the end), **Editor face** (EB Garamond or JetBrains Mono).
- **Vault folder**, **Auto-save**, **Text size**, **Math size in preview**.
- **Size of formulas inserted into a note** (pixels per em at 300 ppi; 64 px is about the size of handwriting).
- **Live preview** on/off and its delay.
- **Close Mathdown after inserting a formula**.
- **Lasso "Render TeX": remove the text box** (off by default).
- **Global TeX preamble**.

## Build from source

The `.snplg` file is a zip with the JavaScript bundle, `PluginConfig.json`, the icons, and `app.npk` (the compiled file module). There are two ways to build it.

### A. No Android SDK (Linux or macOS)

Requires Node.js 18+, a JDK (11 or later) and `zip`.

```bash
npm install
npm run build          # = bash tools/build-plugin.sh
```

The script runs the engine tests, bundles the JavaScript with Metro, compiles the Java file module with `javac` against small stubs (`tools/native-stubs/`), converts it to DEX, and packs `build/outputs/mathdown.snplg`. If `ANDROID_HOME` is set, the script uses the SDK's `android.jar` and `d8`. If not, it downloads `android.jar` (API 30) and the `dx` dexer (dex2jar 2.4) from GitHub one time into `tools/.cache/`.

### B. Official Supernote tool chain (Android Studio)

Set up the environment as the [Supernote plugin docs](https://docs.supernote.com/en/environment) describe, then run the template's script:

```bash
npm install
./buildPlugin.sh       # Windows: .\buildPlugin.ps1
```

`MainApplication.kt` registers `MathdownFilesPackage`, so the official script builds the native part with Gradle.

### Fonts and icons

The bundled fonts and icons are generated files. To make them again:

```bash
python3 tools/make-fonts.py                       # subsets EB Garamond, Cormorant Garamond, JetBrains Mono
npm run icons:ui -- <lucide-static>/icons <istari>/theme.css   # Lucide + Istari icons -> assets/icons, src/icons.ts
```

### Tests

```bash
npm test               # engine tests (Node) + UI tests (Jest, mocked Supernote host)
npm run typecheck
```

## How it works

```
Markdown text
  └─ markdown-it + math rules ──► block tree (engine/markdown.js)
        └─ each formula ──► MathJax 3: TeX → SVG tree (lite DOM, no browser)
              └─ rasterizer: paths → polygons → anti-aliased coverage (engine/raster.js)
                    └─ PNG encoder (fflate) ──► data: URI in the preview
                                            └─► file in EXPORT ──► PluginNoteAPI.insertImage
```

- `engine/` is plain JavaScript with no React Native code. It runs in Hermes on the device and in Node for the tests.
- `src/` is the React Native UI. `App.tsx` is the editor; `index.js` registers the buttons. `src/theme.ts` holds the two Istari palettes; `src/fonts.ts` registers the fonts at start-up through the native module (`registerFont`).
- `engine/obsidian.js` adds the Obsidian syntax to markdown-it; `engine/vault.js` resolves links against a file index.
- `android/app/src/main/java/com/mathdown/files/` is the native module. `sn-plugin-lib` has no "write text file" call, so this module adds `readText`, `writeText`, `writeBase64`, `listDir`, `listTree`, `rename`, `deleteFile`. The Supernote permission system still applies to it.

## Limits

- Characters that are not in the MathJax TeX fonts (for example CJK in `\text{}`) show as empty boxes in formulas. Normal Markdown text has no such limit.
- Equations are not numbered automatically (as in Obsidian). `\tag{...}` works.
- NOTE places an inserted image at a position that the plugin cannot choose. Move it with the lasso.
- Formulas inside headings use the body-size image, scaled.
- Links to `aliases` (from properties) do not resolve yet; link by file name. Tag search, backlinks and a quick switcher are planned.
- Istari's margin column for sidenotes needs a wide pane; on the Supernote, sidenotes open in place (Istari's mobile behavior).
- Embedded notes show two levels deep; deeper embeds show as links.

## Troubleshooting

| Problem | Cause and fix |
|---|---|
| Banner "File module not loaded" | The host did not load `app.npk`. Reinstall the plugin. If the problem continues, build with path B (Gradle). |
| "Write permission was not given" | Open **Settings > Apps > Plugins > Mathdown** and allow file access, or select **Always allow** at the next question. |
| A formula shows "TeX error: ..." | The message comes from MathJax. Correct the TeX; the rest of the note still renders. |
| **Insert ∑** says to open from a NOTE | DOC files cannot hold images. Open Mathdown from a note. |

## Contributing

Bug reports and pull requests are welcome. Please give your device model and firmware version in bug reports. Run `npm test` and `npm run typecheck` before a pull request.

## License

[MIT](LICENSE). Third-party components and their licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Mathdown is not made by or affiliated with Ratta / Supernote.
