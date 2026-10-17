/* Test doubles for the Supernote host: an in-memory file system behind the
 * MathdownFiles native module, and a mock sn-plugin-lib. */
const {NativeModules} = require('react-native');

const files = new Map(); // path -> string (text) or {b64}
global.__files = files;

function dirOf(p) {
  return p.slice(0, p.lastIndexOf('/')) || '/';
}

NativeModules.MathdownFiles = {
  version: jest.fn(async () => '1.0.0'),
  readText: jest.fn(async p => {
    if (!files.has(p)) throw new Error('ENOENT ' + p);
    return files.get(p);
  }),
  writeText: jest.fn(async (p, t) => {
    files.set(p, t);
    return true;
  }),
  writeBase64: jest.fn(async (p, b) => {
    files.set(p, {b64: b});
    return true;
  }),
  exists: jest.fn(async p => files.has(p) || [...files.keys()].some(k => k.startsWith(p + '/'))),
  mkdirs: jest.fn(async () => true),
  listDir: jest.fn(async d => {
    const out = new Map();
    for (const k of files.keys()) {
      if (!k.startsWith(d + '/')) continue;
      const rest = k.slice(d.length + 1);
      const name = rest.split('/')[0];
      const isDir = rest.includes('/');
      out.set(name, {name, path: d + '/' + name, isDir, size: isDir ? 0 : String(files.get(k)).length, modified: 1700000000000});
    }
    return [...out.values()];
  }),
  listTree: jest.fn(async root => {
    const out = [];
    for (const k of files.keys()) {
      if (!k.startsWith(root + '/')) continue;
      const rel = k.slice(root.length + 1);
      if (rel.split('/').some(part => part.startsWith('.'))) continue;
      out.push({path: k, rel, name: rel.split('/').pop(), size: String(files.get(k)).length, modified: 1700000000000});
    }
    return out;
  }),
  rename: jest.fn(async (a, b) => {
    files.set(b, files.get(a));
    files.delete(a);
    return true;
  }),
  deleteFile: jest.fn(async p => files.delete(p) || true),
};

jest.mock('sn-plugin-lib', () => {
  const mock = {
    PluginManager: {
      init: jest.fn(),
      registerButton: jest.fn(async () => true),
      registerButtonListener: jest.fn(() => ({remove: jest.fn()})),
      registerConfigButton: jest.fn(async () => true),
      registerConfigButtonListener: jest.fn(() => ({remove: jest.fn()})),
      registerPluginLifeListener: jest.fn(() => ({remove: jest.fn()})),
      getPluginDirPath: jest.fn(async () => '/data/plugins/mathdown'),
      hasPermission: jest.fn(async () => 0),
      requestPermission: jest.fn(async () => 1),
      closePluginView: jest.fn(async () => true),
      showPluginView: jest.fn(async () => true),
    },
    PluginNoteAPI: {
      insertImage: jest.fn(async () => ({success: true, result: true})),
      getLassoText: jest.fn(async () => ({success: true, result: []})),
    },
    PluginCommAPI: {
      getCurrentFilePath: jest.fn(async () => ({success: true, result: '/storage/emulated/0/Note/Lecture.note'})),
      deleteLassoElements: jest.fn(async () => ({success: true, result: true})),
    },
    FileUtils: {
      exists: jest.fn(async () => false),
      makeDir: jest.fn(async () => true),
      listFiles: jest.fn(async () => []),
      deleteFile: jest.fn(async () => true),
    },
    RattaFileSelector: {selectFile: jest.fn(async () => [])},
    NativeUIUtils: {showRattaDialog: jest.fn(async () => true)},
  };
  return mock;
});
