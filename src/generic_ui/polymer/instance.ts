Polymer({
  // Make GettingState enum available to polymer
  GettingState: GettingState,

  ready: function() {
    this.path = <InstancePath>{
      network : {
       name: this.network.name,
       userId: this.network.userId
      },
      userId: this.user.userId,
      instanceId: this.instance.instanceId
    };
    // Expose global ui object and UI module in this context. This allows the
    // hidden? watch for the get/give toggle to actually update.
    this.ui = ui;
    this.UI = UI;
  },

  start: function() {
    console.log('[polymer] calling core.start(', this.path, ')');
    core.start(this.path).then((endpoint) => {
      console.log('[polymer] received core.start promise fulfillment.');
      console.log('[polymer] endpoint: ' + JSON.stringify(endpoint));
      this.ui.startGettingInUiAndConfig(this.instance.instanceId, endpoint);
    }).catch((e) => {
      ui.showNotification('Unable to get access from ' + this.user.name);
      console.error('Unable to start proxying ', e);
    });
  },
  stop: function() {
    console.log('[polymer] calling core.stop()');
    core.stop();
  },

  // |action| is the string end for a uProxy.UserAction
  modifyConsent: function(action :uProxy.UserAction) {
    var command = <uProxy.ConsentCommand>{
      path: this.path,
      action: action
    };
    console.log('[polymer] consent command', command)
    core.modifyConsent(command);
  },

  // Proxy UserActions.
  request: function() { this.modifyConsent(uProxy.UserAction.REQUEST) },
  cancelRequest: function() {
    this.modifyConsent(uProxy.UserAction.CANCEL_REQUEST)
  },
  ignoreOffer: function() { this.modifyConsent(uProxy.UserAction.IGNORE_OFFER) },
  unignoreOffer: function() { this.modifyConsent(uProxy.UserAction.UNIGNORE_OFFER) },

  // Client UserActions
  offer: function() { this.modifyConsent(uProxy.UserAction.OFFER) },
  cancelOffer: function() {
    this.ui.stopGivingInUi();
    this.modifyConsent(uProxy.UserAction.CANCEL_OFFER);
  },
  ignoreRequest: function() { this.modifyConsent(uProxy.UserAction.IGNORE_REQUEST) },
  unignoreRequest: function() { this.modifyConsent(uProxy.UserAction.UNIGNORE_REQUEST) },

  getConsentState: function() : string {
    return this.instance.consent;
  },
});
