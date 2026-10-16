/**
 * E-ink theme: pure black on white, solid borders, no shadows, no motion.
 * Gray is used only for secondary text and placeholders.
 */
import {StyleSheet} from 'react-native';

export const INK = '#000000';
export const PAPER = '#FFFFFF';
export const GRAY = '#5A5A5A';
export const LIGHT = '#D8D8D8';
export const FAINT = '#F0F0F0';

export const MONO = 'monospace';

export const S = StyleSheet.create({
  fill: {flex: 1, backgroundColor: PAPER},
  row: {flexDirection: 'row', alignItems: 'center'},
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderColor: INK,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: PAPER,
    minHeight: 52,
  },
  barTitle: {flex: 1, fontSize: 19, fontWeight: '700', color: INK, marginHorizontal: 8},
  btn: {
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 6,
    paddingHorizontal: 12,
    minHeight: 42,
    minWidth: 42,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 3,
    backgroundColor: PAPER,
  },
  btnPressed: {backgroundColor: INK},
  btnText: {fontSize: 16, fontWeight: '600', color: INK},
  btnTextPressed: {color: PAPER},
  btnDisabled: {borderColor: LIGHT},
  btnTextDisabled: {color: LIGHT},
  label: {fontSize: 16, color: INK, fontWeight: '600'},
  hint: {fontSize: 14, color: GRAY},
  input: {
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 17,
    color: INK,
    backgroundColor: PAPER,
  },
  banner: {
    borderBottomWidth: 2,
    borderColor: INK,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: FAINT,
  },
  bannerText: {fontSize: 15, color: INK},
});
