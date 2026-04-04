// Ensure EXPO_ROUTER_APP_ROOT is defined in every Babel transform worker.
// Metro workers are separate Node processes — they don't inherit env vars set
// in metro.config.js or eas.json, so we set the fallback here directly.
process.env.EXPO_ROUTER_APP_ROOT = process.env.EXPO_ROUTER_APP_ROOT || 'app';

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
