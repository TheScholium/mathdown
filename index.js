/**
 * Plugin entry: initialisation, buttons and life-cycle events.
 *
 * Buttons
 *  - id 100, toolbar (NOTE and DOC): opens the Mathdown editor.
 *  - id 200, lasso toolbar (NOTE, text boxes only): "Render TeX" turns the
 *    selected text box into a rendered formula image, without opening the UI.
 *  - config button (Settings > Apps > Plugins): opens the Mathdown settings.
 */
import {AppRegistry, Image} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import App from './App';
import {name as appName} from './app.json';
import {emit} from './src/bus';
import {renderLassoSelection} from './src/note';
import {loadSettings, resetPermissionCache} from './src/storage';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

const icon = Image.resolveAssetSource(require('./assets/icon.png')).uri;
const renderIcon = Image.resolveAssetSource(require('./assets/icon-render.png')).uri;

PluginManager.registerButton(1, ['NOTE', 'DOC'], {
  id: 100,
  name: 'Mathdown',
  icon,
  showType: 1,
});

PluginManager.registerButton(2, ['NOTE'], {
  id: 200,
  name: 'Render TeX',
  icon: renderIcon,
  editDataTypes: [3],
  showType: 0,
});

let lassoBusy = false;

PluginManager.registerButtonListener({
  onButtonPress: async event => {
    if (event.id === 100) {
      emit('ui-shown');
    } else if (event.id === 200) {
      if (lassoBusy) return;
      lassoBusy = true;
      try {
        await renderLassoSelection(await loadSettings());
      } finally {
        lassoBusy = false;
      }
    }
  },
});

PluginManager.registerConfigButton()
  .then(() => {
    PluginManager.registerConfigButtonListener({
      onClick: () => {
        emit('open-settings');
        PluginManager.showPluginView();
      },
    });
  })
  .catch(() => {});

PluginManager.registerPluginLifeListener({
  onMsg: msg => {
    const state = msg && msg.state;
    if (state === 2) emit('ui-shown');
    if (state === 3 || state === 4) {
      emit('ui-hidden');
      // "Allow this time only" ends with the session; ask again next time.
      resetPermissionCache();
    }
  },
});
