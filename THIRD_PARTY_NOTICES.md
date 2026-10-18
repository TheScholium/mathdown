# Third-party software

Mathdown bundles or uses the following software. Each keeps its own license.

| Component | License | Use |
|---|---|---|
| [MathJax](https://github.com/mathjax/MathJax-src) 3.2.2 | Apache-2.0 | TeX layout and fonts (bundled) |
| [markdown-it](https://github.com/markdown-it/markdown-it) 14 | MIT | Markdown parser (bundled) |
| [markdown-it-footnote](https://github.com/markdown-it/markdown-it-footnote) 4 | MIT | Footnotes (bundled) |
| [fflate](https://github.com/101arrowz/fflate) 0.8 | MIT | PNG compression (bundled) |
| [EB Garamond](https://github.com/octaviopardo/EBGaramond12) | OFL-1.1 | Text face, subset as `assets/fonts/IstariSerif-*.ttf` (bundled). See [LICENSES/OFL-1.1.txt](LICENSES/OFL-1.1.txt) |
| [Cormorant Garamond](https://github.com/CatharsisFonts/Cormorant) | OFL-1.1 | Title face, subset as `assets/fonts/IstariTitle-*.ttf` (bundled). See [LICENSES/OFL-1.1.txt](LICENSES/OFL-1.1.txt) |
| [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) | OFL-1.1 | Code face, subset as `assets/fonts/IstariMono-Regular.ttf` (bundled). See [LICENSES/OFL-1.1.txt](LICENSES/OFL-1.1.txt) |
| [Lucide](https://lucide.dev) icons 0.460 (portions from Feather, MIT) | ISC | Callout and interface icons, rasterized to `assets/icons/lucide-*.png` (bundled). See [LICENSES/Lucide-ISC.txt](LICENSES/Lucide-ISC.txt) |
| [Istari](https://github.com/TheScholium/istari) | MIT | Design, palettes and hand-drawn icons (`assets/icons/istari-*.png`), by the same author |
| [React](https://react.dev) / [React Native](https://reactnative.dev) 0.79 | MIT | UI runtime (provided by the Supernote PluginHost) |
| [sn-plugin-lib](https://www.npmjs.com/package/sn-plugin-lib) | MIT | Supernote plugin SDK |
| [@supernote-plugin/sn-plugin-template](https://www.npmjs.com/package/@supernote-plugin/sn-plugin-template) | MIT | Project template, `buildPlugin.sh`, `android/` |
| [dex2jar](https://github.com/pxb1988/dex2jar) (dx), Android platform `android.jar` | Apache-2.0 | Build tools, downloaded by `tools/build-plugin.sh`; not bundled |
