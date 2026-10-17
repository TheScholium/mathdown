import React from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react-native';
import {Image, TextInput} from 'react-native';
import App, {toggleTaskLine} from '../App';

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
  expect(screen.getByText('Commutators.md')).toBeTruthy();
  expect(screen.getByText('Canonical')).toBeTruthy();
  fireEvent.press(screen.getByText('← Back'));
  await settle(1000);
  expect(screen.getByText('Oscillator.md')).toBeTruthy();
  expect(screen.queryByText('← Back')).toBeNull();
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
  expect(screen.getByText('B.md')).toBeTruthy();
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
  expect(screen.getByText('Brand new idea.md')).toBeTruthy();
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
  expect(screen.getByText('Defs > Group')).toBeTruthy();
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
  expect(screen.getByText(/Theorem \(/)).toBeTruthy();
  expect(screen.getByText('Lagrange')).toBeTruthy();
  // folded proof: title shown, body hidden until tapped
  expect(screen.getByText('Proof.')).toBeTruthy();
  expect(screen.queryByText('Cosets')).toBeNull();
  fireEvent.press(screen.getByText('Proof.'));
  await settle(1500);
  expect(screen.getByText('Cosets')).toBeTruthy();
  expect(screen.getByText('∎')).toBeTruthy();
  expect(screen.getByText('[1]')).toBeTruthy();
  expect(screen.getByText('A footnote.')).toBeTruthy();
}, 60000);
