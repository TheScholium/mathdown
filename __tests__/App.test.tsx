import React from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react-native';
import {Image, TextInput} from 'react-native';
import {PluginManager, PluginNoteAPI, PluginCommAPI, NativeUIUtils} from 'sn-plugin-lib';
import App from '../App';
import {renderLassoSelection, textToTeX} from '../src/note';
import {DEFAULT_SETTINGS} from '../src/storage';

const files: Map<string, any> = (global as any).__files;
const VAULT = '/storage/emulated/0/Document/Mathdown';

async function settle(ms = 3000) {
  // Let timers (preview debounce, progressive rendering) and promises run.
  for (let i = 0; i < 40; i++) {
    await act(async () => {
      await new Promise(r => setTimeout(r, ms / 40));
    });
  }
}

function mathImages() {
  return screen.UNSAFE_getAllByType(Image).filter(i => String((i.props.source || {}).uri || '').startsWith('data:image/png;base64,'));
}

beforeEach(() => {
  files.clear();
  jest.clearAllMocks();
});

test('first start shows the welcome note with rendered math', async () => {
  render(<App />);
  await settle(4000);
  expect(screen.getByText(/Welcome to Mathdown/)).toBeTruthy();
  const imgs = mathImages();
  expect(imgs.length).toBeGreaterThanOrEqual(8);
  for (const i of imgs) {
    expect(i.props.style.width).toBeGreaterThan(0);
    expect(i.props.style.height).toBeGreaterThan(0);
  }
}, 120000);

test('type, use a snippet, save as a new note', async () => {
  files.set('/data/plugins/mathdown/recent.json', JSON.stringify(['x'])); // not first run
  render(<App />);
  await settle(500);
  fireEvent.press(screen.getByText('Edit'));
  const input = screen.UNSAFE_getAllByType(TextInput)[0];
  fireEvent.changeText(input, '# Kinematics\n\nVelocity ');
  fireEvent(input, 'selectionChange', {nativeEvent: {selection: {start: 23, end: 23}}});
  fireEvent.press(screen.getByText('a/b'));
  expect(screen.UNSAFE_getAllByType(TextInput)[0].props.value).toBe('# Kinematics\n\nVelocity \\frac{}{}');
  fireEvent.press(screen.getByText('Save'));
  await settle(200);
  // The save prompt suggests the first heading as the name.
  const nameInput = screen.UNSAFE_getAllByType(TextInput).find(t => t.props.value === 'Kinematics');
  expect(nameInput).toBeTruthy();
  fireEvent.press(screen.getAllByText('Save').slice(-1)[0]);
  await settle(300);
  expect(files.get(VAULT + '/Kinematics.md')).toBe('# Kinematics\n\nVelocity \\frac{}{}');
  expect(PluginManager.requestPermission).toHaveBeenCalledWith('plugin.permission.FILE:WRITE', expect.any(String));
  expect(screen.getByText(/Saved Kinematics.md/)).toBeTruthy();
}, 60000);

test('Insert ∑ renders the formula under the cursor into the note', async () => {
  files.set('/data/plugins/mathdown/recent.json', JSON.stringify(['x']));
  render(<App />);
  await settle(500);
  fireEvent.press(screen.getByText('Edit'));
  const input = screen.UNSAFE_getAllByType(TextInput)[0];
  const text = 'Gauss: $\\oint \\vb{E}\\cdot d\\vb{A} = Q/\\varepsilon_0$ done';
  fireEvent.changeText(input, text);
  fireEvent(input, 'selectionChange', {nativeEvent: {selection: {start: 12, end: 12}}});
  fireEvent.press(screen.getByText('Insert ∑'));
  await settle(1500);
  expect(PluginNoteAPI.insertImage).toHaveBeenCalledTimes(1);
  const path = (PluginNoteAPI.insertImage as jest.Mock).mock.calls[0][0];
  expect(path).toMatch(/^\/storage\/emulated\/0\/EXPORT\/Mathdown\/formula-\d{8}-\d{6}-\d+\.png$/);
  const png = Buffer.from(files.get(path).b64, 'base64');
  expect(png.slice(1, 4).toString()).toBe('PNG');
  expect(png[25]).toBe(4); // gray + alpha
  expect(PluginManager.closePluginView).toHaveBeenCalled();
}, 60000);

test('file browser lists and opens notes', async () => {
  files.set(VAULT + '/Waves.md', '# Waves\n\n$$\\omega = ck$$');
  files.set(VAULT + '/Old.md', 'old');
  files.set(VAULT + '/image.png', 'x');
  files.set('/data/plugins/mathdown/recent.json', JSON.stringify(['x']));
  render(<App />);
  await settle(300);
  fireEvent.press(screen.getByText('Files'));
  await settle(300);
  expect(screen.getByText('Waves.md')).toBeTruthy();
  expect(screen.queryByText('image.png')).toBeNull();
  fireEvent.press(screen.getByText('Waves.md'));
  await settle(2500);
  expect(screen.getByText('Waves.md')).toBeTruthy(); // title bar
  expect(PluginManager.requestPermission).toHaveBeenCalledWith('plugin.permission.FILE:READ', expect.any(String));
}, 60000);

test('settings persist in the plugin folder', async () => {
  files.set('/data/plugins/mathdown/recent.json', JSON.stringify(['x']));
  render(<App />);
  await settle(300);
  fireEvent.press(screen.getByText('⚙'));
  await settle(100);
  fireEvent.press(screen.getAllByText('+')[0]); // text size 18 -> 19
  fireEvent.press(screen.getByText('Save'));
  await settle(200);
  const saved = JSON.parse(files.get('/data/plugins/mathdown/settings.json'));
  expect(saved.fontSize).toBe(19);
}, 60000);

test('unsaved text is restored from the draft', async () => {
  files.set('/data/plugins/mathdown/draft.json', JSON.stringify({path: null, text: 'draft $y$', dirty: true, savedAt: 1}));
  render(<App />);
  await settle(300);
  expect(screen.getByText(/Restored unsaved changes/)).toBeTruthy();
  fireEvent.press(screen.getByText('Edit'));
  expect(screen.UNSAFE_getAllByType(TextInput)[0].props.value).toBe('draft $y$');
}, 60000);

test('lasso Render TeX inserts an image from a text box', async () => {
  (PluginNoteAPI.getLassoText as jest.Mock).mockResolvedValueOnce({success: true, result: [{textContentFull: 'Area $A = \\pi r^2$'}]});
  await renderLassoSelection({...DEFAULT_SETTINGS, removeTextAfterRender: true});
  expect(PluginCommAPI.deleteLassoElements).toHaveBeenCalled();
  expect(PluginNoteAPI.insertImage).toHaveBeenCalledTimes(1);
  expect(NativeUIUtils.showRattaDialog).not.toHaveBeenCalled();
});

test('lasso Render TeX reports TeX errors and keeps the text', async () => {
  (PluginNoteAPI.getLassoText as jest.Mock).mockResolvedValueOnce({success: true, result: [{textContentFull: '\\frac{1}{'}]});
  await renderLassoSelection({...DEFAULT_SETTINGS, removeTextAfterRender: true});
  expect(PluginCommAPI.deleteLassoElements).not.toHaveBeenCalled();
  expect(PluginNoteAPI.insertImage).not.toHaveBeenCalled();
  expect(NativeUIUtils.showRattaDialog).toHaveBeenCalled();
});

test('textToTeX mixes prose and math', () => {
  expect(textToTeX('\\alpha + 1')).toEqual({tex: '\\alpha + 1', display: true});
  expect(textToTeX('$$x$$')).toEqual({tex: 'x', display: true});
  expect(textToTeX('Area $A$ here').tex).toBe('\\text{Area }{A}\\text{ here}');
});
