/**
 * Istari theme for Mathdown (https://github.com/TheScholium/istari).
 *
 * Two palettes, both taken from the Istari stylesheet:
 *  - Paper: Istari's print palette (section 12): dark ink on white, pigments
 *    darkened to hold contrast. The default, because e-ink is paper.
 *  - Night: Istari's screen palette (section 1): parchment on near-black.
 *
 * Every color, font and shared style comes from useTheme(), so the whole UI
 * follows the palette that the user picks in Settings.
 */
import React, {createContext, useContext} from 'react';
import {StyleSheet, TextStyle} from 'react-native';
import {FALLBACK_FONTS, Fonts} from './fonts';

export type PaletteName = 'paper' | 'night';

export type Palette = {
  name: PaletteName;
  dark: boolean;
  bg: string; // page
  bg0: string; // bars, inputs
  bg3: string; // inline code, pressed states
  rule: string; // hairlines
  text: string;
  bright: string; // headings
  muted: string;
  faint: string;
  vellum: string; // body text of cssclasses: vellum
  gold: string;
  goldDim: string; // bold, rules, accents
  link: string;
  verdigris: string;
  warn: string;
  code: string; // --code-normal
  codeBg: string; // --code-background
  callout: string; // "r, g, b" for rgba()
  warnRgb: string;
  goldRgb: string;
  onAccent: string; // text on a goldDim fill
  highlight: string; // ==mark== background
  scrim: string; // behind dialogs
};

export const PAPER_PALETTE: Palette = {
  name: 'paper',
  dark: false,
  bg: '#ffffff',
  bg0: '#ffffff',
  bg3: '#f6f1e4',
  rule: '#d4cbb8',
  text: '#221d16',
  bright: '#14110b',
  muted: '#554c3e',
  faint: '#857b69',
  vellum: '#221d16',
  gold: '#7d6224',
  goldDim: '#6b5420',
  link: '#7d6224',
  verdigris: '#3c675e',
  warn: 'rgb(150, 66, 52)',
  code: '#5e4038',
  codeBg: '#f6f1e4',
  callout: '125, 98, 36',
  warnRgb: '150, 66, 52',
  goldRgb: '196, 162, 77',
  onAccent: '#ffffff',
  highlight: 'rgba(196, 162, 77, 0.28)',
  scrim: 'rgba(255, 255, 255, 0.78)',
};

export const NIGHT_PALETTE: Palette = {
  name: 'night',
  dark: true,
  bg: '#12100e',
  bg0: '#0d0c0a',
  bg3: '#1b1814',
  rule: '#2a251d',
  text: '#d6ccb4',
  bright: '#ebe1c8',
  muted: '#948b76',
  faint: '#7a7160',
  vellum: '#dcd2b8',
  gold: '#c4a24d',
  goldDim: '#8f7639',
  link: '#ddbd5e',
  verdigris: '#6d9a90',
  warn: 'rgb(213, 151, 141)',
  code: '#b7968f',
  codeBg: '#0d0c0a',
  callout: '196, 162, 77',
  warnRgb: '213, 151, 141',
  goldRgb: '196, 162, 77',
  onAccent: '#14110b',
  highlight: 'rgba(196, 162, 77, 0.2)',
  scrim: 'rgba(8, 7, 6, 0.85)',
};

export function paletteOf(name: string | undefined): Palette {
  return name === 'night' ? NIGHT_PALETTE : PAPER_PALETTE;
}

export function rgba(rgb: string, a: number): string {
  return 'rgba(' + rgb + ', ' + a + ')';
}

/* Type: the fontVariant sets that Istari uses. */
export const SMALL_CAPS: TextStyle['fontVariant'] = ['small-caps'];
export const PROSE_FIGURES: TextStyle['fontVariant'] = ['oldstyle-nums'];
export const DATA_FIGURES: TextStyle['fontVariant'] = ['lining-nums', 'tabular-nums'];

/** Letter spacing in dp for an em fraction. */
export function track(size: number, em: number): number {
  return Math.round(size * em * 100) / 100;
}

function makeStyles(p: Palette, f: Fonts) {
  return StyleSheet.create({
    fill: {flex: 1, backgroundColor: p.bg},
    row: {flexDirection: 'row', alignItems: 'center'},
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderColor: p.rule,
      paddingHorizontal: 6,
      paddingVertical: 4,
      backgroundColor: p.bg0,
      minHeight: 52,
    },
    barTitle: {
      flex: 1,
      fontFamily: f.serif,
      fontSize: 18,
      fontVariant: SMALL_CAPS,
      letterSpacing: track(18, 0.06),
      color: p.bright,
      marginHorizontal: 8,
    },
    btn: {
      borderWidth: 1,
      borderColor: p.goldDim,
      borderRadius: 2,
      paddingHorizontal: 12,
      minHeight: 42,
      minWidth: 42,
      justifyContent: 'center',
      alignItems: 'center',
      marginHorizontal: 3,
      backgroundColor: 'transparent',
    },
    btnPressed: {backgroundColor: p.goldDim},
    btnText: {
      fontFamily: f.serif,
      fontSize: 17,
      fontVariant: SMALL_CAPS,
      letterSpacing: track(17, 0.05),
      color: p.gold,
    },
    btnTextPressed: {color: p.onAccent},
    btnDisabled: {borderColor: p.rule},
    btnTextDisabled: {color: p.faint},
    label: {fontFamily: f.serif, fontSize: 17, fontVariant: SMALL_CAPS, letterSpacing: track(17, 0.05), color: p.bright},
    hint: {fontFamily: f.serif, fontSize: 15, fontStyle: 'italic', color: p.muted},
    input: {
      borderWidth: 1,
      borderColor: p.rule,
      borderRadius: 2,
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontFamily: f.serif,
      fontSize: 18,
      color: p.text,
      backgroundColor: p.bg0,
    },
    banner: {
      borderBottomWidth: 1,
      borderColor: p.goldDim,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: p.bg3,
    },
    bannerText: {fontFamily: f.serif, fontSize: 16, color: p.text},
    status: {
      fontFamily: f.serif,
      fontSize: 14,
      fontVariant: ['small-caps', 'lining-nums'],
      letterSpacing: track(14, 0.04),
      color: p.faint,
    },
  });
}

export type Theme = {p: Palette; f: Fonts; S: ReturnType<typeof makeStyles>};

const cache = new Map<string, Theme>();

export function makeTheme(palette: Palette, fonts: Fonts): Theme {
  const k = palette.name + '|' + fonts.serif + '|' + fonts.title + '|' + fonts.mono;
  let t = cache.get(k);
  if (!t) {
    t = {p: palette, f: fonts, S: makeStyles(palette, fonts)};
    cache.set(k, t);
  }
  return t;
}

export const DEFAULT_THEME = makeTheme(PAPER_PALETTE, FALLBACK_FONTS);

const ThemeContext = createContext<Theme>(DEFAULT_THEME);

export function ThemeProvider(props: {theme: Theme; children: React.ReactNode}) {
  return React.createElement(ThemeContext.Provider, {value: props.theme}, props.children);
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
