/**
 * Istari's typefaces: EB Garamond (text), Cormorant Garamond (titles) and
 * JetBrains Mono (code), registered with React Native at start-up from the
 * plugin's own files. If anything fails, the system serif and monospace
 * fonts are used instead.
 */
import {Image, NativeModules} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';

export type Fonts = {serif: string; title: string; mono: string; loaded: boolean};

export const FALLBACK_FONTS: Fonts = {serif: 'serif', title: 'serif', mono: 'monospace', loaded: false};

// Typeface styles: 0 normal, 1 bold, 2 italic, 3 bold italic.
const FILES: {family: string; style: number; asset: number}[] = [
  {family: 'IstariSerif', style: 0, asset: require('../assets/fonts/IstariSerif-Regular.ttf')},
  {family: 'IstariSerif', style: 1, asset: require('../assets/fonts/IstariSerif-SemiBold.ttf')},
  {family: 'IstariSerif', style: 2, asset: require('../assets/fonts/IstariSerif-Italic.ttf')},
  {family: 'IstariSerif', style: 3, asset: require('../assets/fonts/IstariSerif-SemiBoldItalic.ttf')},
  {family: 'IstariTitle', style: 0, asset: require('../assets/fonts/IstariTitle-Medium.ttf')},
  {family: 'IstariTitle', style: 1, asset: require('../assets/fonts/IstariTitle-Medium.ttf')},
  {family: 'IstariTitle', style: 2, asset: require('../assets/fonts/IstariTitle-MediumItalic.ttf')},
  {family: 'IstariTitle', style: 3, asset: require('../assets/fonts/IstariTitle-MediumItalic.ttf')},
  {family: 'IstariMono', style: 0, asset: require('../assets/fonts/IstariMono-Regular.ttf')},
  {family: 'IstariMono', style: 1, asset: require('../assets/fonts/IstariMono-Regular.ttf')},
];

let result: Promise<Fonts> | null = null;

/** Candidate file paths for a bundled asset (next to the JS bundle, then the plugin folder). */
function candidates(asset: number, pluginDir: string | null): string[] {
  const out: string[] = [];
  try {
    const src = Image.resolveAssetSource(asset as any);
    if (src && src.uri) {
      out.push(src.uri);
      const name = src.uri.split('/').pop() || '';
      const base = /\.ttf$/i.test(name) ? name : name + '.ttf';
      if (pluginDir) out.push(pluginDir + '/raw/' + base);
    }
  } catch {
    // ignore
  }
  return out;
}

async function register(): Promise<Fonts> {
  const m = (NativeModules as any).MathdownFiles;
  if (!m || typeof m.registerFont !== 'function') return FALLBACK_FONTS;
  let pluginDir: string | null = null;
  try {
    pluginDir = ((await PluginManager.getPluginDirPath()) || '').replace(/\/+$/, '') || null;
  } catch {
    pluginDir = null;
  }
  const ok: {[family: string]: boolean} = {IstariSerif: true, IstariTitle: true, IstariMono: true};
  for (const f of FILES) {
    let done = false;
    for (const path of candidates(f.asset, pluginDir)) {
      try {
        if (await m.registerFont(f.family, path, f.style)) {
          done = true;
          break;
        }
      } catch {
        // try the next path
      }
    }
    if (!done) ok[f.family] = false;
  }
  return {
    serif: ok.IstariSerif ? 'IstariSerif' : 'serif',
    title: ok.IstariTitle ? 'IstariTitle' : ok.IstariSerif ? 'IstariSerif' : 'serif',
    mono: ok.IstariMono ? 'IstariMono' : 'monospace',
    loaded: ok.IstariSerif,
  };
}

/** Registers the fonts once per plugin session. */
export function loadFonts(): Promise<Fonts> {
  if (!result) result = register().catch(() => FALLBACK_FONTS);
  return result;
}
