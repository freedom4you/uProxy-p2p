/**
 * background.ts
 *
 * This is the background page for the Extension. It maintains a chrome runtime
 * connection with the App, consistent state changes with the UI (see ui.js).
 */
// Assumes that core_stub.ts has been loaded.
// UserInterface is defined in 'generic_ui/scripts/ui.ts'.

import * as background_ui from '../../../generic_ui/scripts/background_ui';
import * as chrome_panel_connector from './chrome_panel_connector';
import ChromeBrowserApi from './chrome_browser_api';
import ChromeCoreConnector from './chrome_core_connector';
import ChromeTabAuth from './chrome_tab_auth';
import * as Constants from '../../../generic_ui/scripts/constants';
import CoreConnector from '../../../generic_ui/scripts/core_connector';
import * as user_interface from '../../../generic_ui/scripts/ui';

import compareVersion = require('compare-version');
import * as uproxy_core_api from '../../../interfaces/uproxy_core_api';

// --------------------- Communicating with the App ----------------------------

export const browserApi = new ChromeBrowserApi();

// way for ui to speak to a uProxy.CoreApi
export const browserConnector = new ChromeCoreConnector({
  name: 'uproxy-extension-to-app-port'
});
browserConnector.onUpdate(uproxy_core_api.Update.LAUNCH_UPROXY,
    browserApi.bringUproxyToFront);

// way for ui to speak to a uProxy.CoreApi
export const core = new CoreConnector(browserConnector);

export const backgroundUi = new background_ui.BackgroundUi(
    new chrome_panel_connector.ChromePanelConnector(),
    core);

const oAuth = new ChromeTabAuth();

browserConnector.onUpdate(uproxy_core_api.Update.GET_CREDENTIALS,
                         oAuth.login.bind(oAuth));

/*
 * TODO: this is a separate user_interface object from the one we refer to
 * elsewhere in the code.  It will register listeners for all events and
 * commands, however, these listeners will immediately be unbound after the
 * panel is opened for the first time.  Its version of any data should not be
 * relied upon as canonical and no updates made to data here should be expected
 * to persist within the general UI.
 */
const ui = new user_interface.UserInterface(core, browserApi, backgroundUi);

// Chrome Window ID of the window used to launch uProxy,
// i.e. the window where the extension icon was clicked
// or the window where the user is completing the install flow.
chrome.runtime.onSuspend.addListener(() => {
  console.log('onSuspend');
  //proxyConfig.stopUsingProxy();
});

chrome.runtime.onMessage.addListener((request :any, sender: chrome.runtime.MessageSender, sendResponse :Function) => {
  if (!request) {
    return;
  }

  // handle requests from other pages (i.e. copypaste.html) to bring the
  // chrome popup to the front
  if (request.openWindow) {
    browserApi.bringUproxyToFront();
  }

  if (request.globalSettingsRequest) {
    ui.handleGlobalSettingsRequest(sendResponse);
    return true;
  }

  if (request.translationsRequest) {
    ui.handleTranslationsRequest(request.translationsRequest, sendResponse);
    return true;
  }
});

chrome.runtime.onMessageExternal.addListener((request :any, sender :chrome.runtime.MessageSender, sendResponse :Function) => {
  // Reply to pings from the uproxy website that are checking if the
  // extension is installed.
  if (request) {
    if (request.checkIfInstalled) {
      sendResponse({ extensionInstalled: true });
    } else if (request.openWindow) {
      browserApi.bringUproxyToFront();
      sendResponse({ launchedUproxy: true });
    } else if (request.promoId) {
      browserApi.emit('promoIdDetected', request.promoId);
    }
  }
  return true;
});

chrome.runtime.onUpdateAvailable.addListener((updateInfo) => {
  console.log('Update available');

  core.getVersion().then(function(versions) {
    if (compareVersion(updateInfo.version, versions.version) > 0) {
      // Only update if the new version is the same as or older than the app
      // version.  If we are not able to update now, this will be taken care of
      // by restarting at the same time as the core update.
      return;
    }

    chrome.proxy.settings.get({}, (proxyInfo) => {
      if (proxyInfo.levelOfControl === 'controlled_by_this_extension') {
        return;
      }

      // At this point, the core supports the update and we are not currently
      // proxying, let's do the update!
      chrome.runtime.reload();
    });
  });
});

/**
 * Primary initialization of the Chrome Extension. Installs hooks so that
 * updates from the Chrome App side propogate to the UI.
 */

// TODO (lucyhe): Make sure that the "install" event isn't missed if we
// are adding the listener after the event is fired.
chrome.runtime.onInstalled.addListener((details :chrome.runtime.InstalledDetails) => {
  if (details.reason !== 'install') {
    // we only want to launch the window on the first install
    return;
  }
  browserConnector.onceConnected.then(() => {
    browserApi.hasInstalledThenLoggedIn = false;
    chrome.browserAction.setIcon({
      path: {
        '19' : 'icons/19_' + Constants.DEFAULT_ICON,
        '38' : 'icons/38_' + Constants.DEFAULT_ICON,
      }
    });
  });

  chrome.tabs.query({currentWindow: true, active: true}, function(tabs){
      // Do not open the extension when it's installed if the user is
      // going through the inline install flow.
      if ((tabs[0].url.indexOf('uproxysite.appspot.com/install') == -1) &&
          (tabs[0].url.indexOf('uproxy.org/install') == -1)) {
        browserApi.bringUproxyToFront();
      }
  });
});

chrome.browserAction.onClicked.addListener((tab) => {
  // When the extension icon is clicked, open uProxy.
  browserApi.bringUproxyToFront();
});

chrome.webRequest.onBeforeRequest.addListener(
    function(details) {
      browserApi.emit('inviteUrlData', details.url);
      // TODO: If there are duplicate emits of this, consider the de-dupe logic
      // used by the listener for copypaste links below.
      return {
          redirectUrl: chrome.extension.getURL('generic_ui/invite-received.html')
      };
    },
    { urls: ['https://www.uproxy.org/invite*'] },
    ['blocking']
    );

chrome.webRequest.onBeforeRequest.addListener(
    function() {
        return { cancel: true };
    },
    { urls: ['https://www.uproxy.org/oauth-redirect-uri*',
        'https://www.uproxy.org/autoclose*'] },
    ['blocking']
    );

chrome.tabs.onUpdated.addListener((tabId :number,
    changeInfo :chrome.tabs.TabChangeInfo, tab :chrome.tabs.Tab) => {
  if (tab.url.indexOf('https://www.uproxy.org/autoclose') === 0) {
    chrome.tabs.remove(tabId);
    browserApi.bringUproxyToFront();
  }
});
