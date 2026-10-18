import React from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react-native';
import {Image, StyleSheet, TextInput} from 'react-native';
import App, {toggleTaskLine} from '../App';
import {calloutLook} from '../src/Preview';

const files: Map<string, any> = (global as any).__files;
const V = '/storage/emulated/0/Document/Mathdown';

async function settle(ms = 1500) {
  for (let i = 0; i < 30; i++) {
    await act(async () => {
      await new Promise(r => setTimeout(r, ms / 30));
    });
  }
}

function openWith(path: string, text: string, extra: [string, string][] = []) {
  files.clear();
  files.set('/data/plugins/mathdown/recent.json', JSON.stringify([path]));
  files.set('/data/plugins/mathdown/draft.json', JSON.stringify({path, text, dirty: false, savedAt: 1}));
  files.set(path, text);
  for (const [p, t] of extra) files.set(p, t);
}

beforeEach(() => jest.clearAllMocks());

/** Text of the title in the top bar (the note name, without ".md"). */
function titleText(): string {
  const collect = (x: any): string =>
    typeof x === 'string' ? x : Array.isArray(x) ? x.map(collect).join('') : x && x.props ? collect(x.props.children) : '';
  return collect(screen.getByTestId('note-title').props.children).replace(' •', '');
}

test('toggleTaskLine handles lists, numbers and callouts', () => {
  expect(toggleTaskLine('- [ ] a\n- [x] b', 0)).toBe('- [x] a\n- [x] b');
  expect(toggleTaskLine('- [ ] a\n- [x] b', 1)).toBe('- [ ] a\n- [ ] b');
  expect(toggleTaskLine('> 1. [ ] q', 0)).toBe('> 1. [x] q');
  expect(toggleTaskLine('plain', 0)).toBeNull();
});

test('tap a wikilink opens the note at the heading; Back returns', async () => {
  openWith(V + '/QM/Oscillator.md', '# Oscillator\n\nSee [[Commutators#Canonical]] for $[x,p]$.', [
    [V + '/QM/Commutators.md', '# Commutators\n\n## Canonical\n\n$$[x,p]=i\\hbar$$'],
  ]);
  render(<App />);
  await settle();
  fireEvent.press(screen.getByText('View'));
  await settle(800);
  fireEvent.press(screen.getByText('Commutators'));
  await settle(1500);
  expect(titleText()).toBe('QM › Commutators'); // folder breadcrumb, small caps
  expect(screen.getByText('Canonical')).toBeTruthy();
  fireEvent.press(screen.getByText('Back'));
  await settle(1000);
  expect(titleText()).toBe('QM › Oscillator');
  expect(screen.queryByText('Back')).toBeNull();
}, 60000);

test('a dirty note is saved before following a link', async () => {
  openWith(V + '/A.md', 'Go to [[B]].', [[V + '/B.md', '# B']]);
  render(<App />);
  await settle();
  fireEvent.press(screen.getByText('Edit'));
  fireEvent.changeText(screen.UNSAFE_getAllByType(TextInput)[0], 'Go to [[B]]. Edited.');
  fireEvent.press(screen.getByText('View'));
  await settle(600);
  fireEvent.press(screen.getByText('B'));
  await settle(1200);
  expect(files.get(V + '/A.md')).toBe('Go to [[B]]. Edited.');
  expect(titleText()).toBe('B');
}, 60000);

test('an unresolved link offers to create the note', async () => {
  openWith(V + '/A.md', 'Idea: [[Brand new idea]]');
  render(<App />);
  await settle();
  fireEvent.press(screen.getByText('View'));
  await settle(600);
  fireEvent.press(screen.getByText('Brand new idea'));
  await settle(300);
  expect(screen.getByText('Create "Brand new idea"?')).toBeTruthy();
  fireEvent.press(screen.getByText('Create'));
  await settle(1000);
  expect(files.get(V + '/Brand new idea.md')).toBe('');
  expect(titleText()).toBe('Brand new idea');
}, 60000);

test('tap a task box toggles it in the file (auto-save)', async () => {
  openWith(V + '/T.md', '# Tasks\n\n- [ ] read Lee ch. 3\n- [x] problem set');
  render(<App />);
  await settle();
  fireEvent.press(screen.getByText('View'));
  await settle(800);
  const boxes = screen.UNSAFE_root.findAll((n: any) => n.props && n.props.hitSlop === 10 && typeof n.props.onPress === 'function');
  expect(boxes.length).toBeGreaterThanOrEqual(2);
  fireEvent.press(boxes[0]);
  await settle(3500);
  expect(files.get(V + '/T.md')).toBe('# Tasks\n\n- [x] read Lee ch. 3\n- [x] problem set');
}, 60000);

test('embeds: notes, sections and images render', async () => {
  openWith(V + '/Hub.md', '![[Defs#Group]]\n\n![[pic.png|200]]\n\n![[Gone]]', [
    [V + '/Defs.md', '# Defs\n\n## Group\n\nA set with an operation $G\\times G\\to G$.\n\n## Ring\n\nNot shown.'],
    [V + '/attachments/pic.png', 'PNG'],
  ]);
  render(<App />);
  await settle();
  fireEvent.press(screen.getByText('View'));
  await settle(2000);
  expect(screen.getByText('Defs › Group')).toBeTruthy();
  expect(screen.getByText('operation')).toBeTruthy();
  expect(screen.queryByText('Not shown.')).toBeNull();
  expect(screen.getByText('Not found: Gone')).toBeTruthy();
  const uris = screen.UNSAFE_getAllByType(Image).map((i: any) => String((i.props.source || {}).uri || ''));
  expect(uris).toContain('file:///storage/emulated/0/Document/Mathdown/attachments/pic.png');
  // math inside the embedded note was rendered too
  expect(uris.some(u => u.startsWith('data:image/png;base64,'))).toBe(true);
}, 60000);

test('callouts, properties, highlights and footnotes render', async () => {
  openWith(
    V + '/C.md',
    '---\ntags: [algebra]\n---\n> [!theorem] Lagrange\n> The order of $H$ divides $|G|$.\n\n> [!proof]-\n> Cosets partition $G$.\n\n==key== idea[^1]\n\n[^1]: A footnote.',
  );
  render(<App />);
  await settle();
  fireEvent.press(screen.getByText('View'));
  await settle(2000);
  expect(screen.getByText(/Properties/)).toBeTruthy();
  expect(screen.getByText('#algebra')).toBeTruthy();
  // Istari labels: "Theorem: Lagrange"
  expect(screen.getByText('Theorem:')).toBeTruthy();
  expect(screen.getByText('Lagrange')).toBeTruthy();
  // folded proof: "Proof:" shown, body hidden until tapped
  expect(screen.getByText('Proof:')).toBeTruthy();
  expect(screen.queryByText('Cosets')).toBeNull();
  fireEvent.press(screen.getByText('Proof:'));
  await settle(1500);
  expect(screen.getByText('Cosets')).toBeTruthy();
  expect(screen.getByLabelText('end of proof')).toBeTruthy();
  // Sidenotes: the footnote list is hidden; the bare numeral opens the note in place.
  expect(screen.queryByText('A footnote.')).toBeNull();
  fireEvent.press(screen.getByText('¹'));
  await settle(300);
  expect(screen.getByText('A footnote.')).toBeTruthy();
  fireEvent.press(screen.getByText('¹'));
  await settle(300);
  expect(screen.queryByText('A footnote.')).toBeNull();
}, 60000);

test('callout labels follow Istari: prefix, |plain, short forms, warning family', () => {
  expect(calloutLook('theorem', '', true)).toMatchObject({prefix: 'Theorem: ', icon: 'lucide-scroll-text', italicBody: true});
  expect(calloutLook('thm', '', false)).toMatchObject({prefix: 'Theorem:', italicBody: true});
  expect(calloutLook('def', '', false)).toMatchObject({prefix: 'Definition:', icon: 'lucide-book-open', italicBody: false});
  expect(calloutLook('theorem', 'plain', true).prefix).toBe('');
  expect(calloutLook('proof', '', false)).toMatchObject({prefix: 'Proof:', proof: true});
  expect(calloutLook('note', '', false)).toMatchObject({prefix: 'Note', icon: 'lucide-pencil'});
  expect(calloutLook('note', '', true).prefix).toBe('');
  expect(calloutLook('danger', '', false).warn).toBe(true);
  expect(calloutLook('tip', '', false).warn).toBe(false);
});

test('queries, inline title, tinted math and the Night palette', async () => {
  openWith(V + '/Q.md', 'Claim $x^2$ holds.^[? Does this hold in infinite-D?]');
  render(<App />);
  await settle();
  fireEvent.press(screen.getByText('View'));
  await settle(1500);
  // Inline title from the file name
  expect(screen.getAllByText('Q').length).toBeGreaterThanOrEqual(2);
  fireEvent.press(screen.getByText('¹'));
  await settle(300);
  expect(screen.getByText('Query.\u00A0')).toBeTruthy();
  expect(screen.getByText('Does this hold in infinite-D?')).toBeTruthy(); // "? " removed
  // Black math is a mask drawn in the text color
  const math = screen
    .UNSAFE_getAllByType(Image)
    .filter((i: any) => String((i.props.source || {}).uri || '').startsWith('data:image/png;base64,'));
  expect(math.length).toBe(1);
  expect(StyleSheet.flatten(math[0].props.style).tintColor).toBe('#221d16');
  // Night palette
  fireEvent.press(screen.getByLabelText('Settings'));
  await settle(200);
  fireEvent.press(screen.getByText('Night'));
  fireEvent.press(screen.getByText('Save'));
  await settle(800);
  const night = screen
    .UNSAFE_getAllByType(Image)
    .filter((i: any) => String((i.props.source || {}).uri || '').startsWith('data:image/png;base64,'));
  expect(StyleSheet.flatten(night[0].props.style).tintColor).toBe('#d6ccb4');
  expect(JSON.parse(files.get('/data/plugins/mathdown/settings.json')).theme).toBe('night');
}, 60000);
