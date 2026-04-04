/**
 * withAppTrackingManifest
 *
 * Registers ForegroundAppService and required permissions in AndroidManifest.xml.
 * This runs during EAS prebuild so the service is present in the final APK.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

const withAppTrackingManifest = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application?.[0];
    if (!app) return config;

    if (!app.service) app.service = [];

    const serviceClass = 'expo.modules.apptracking.ForegroundAppService';
    const alreadyAdded = app.service.some(
      (s) => s.$?.['android:name'] === serviceClass
    );

    if (!alreadyAdded) {
      const serviceEntry = {
        $: {
          'android:name': serviceClass,
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:foregroundServiceType': 'dataSync',
        },
      };
      app.service.push(serviceEntry);
      console.log('[withAppTrackingManifest] Registered ForegroundAppService in AndroidManifest.');
    }

    const uses = manifest.manifest['uses-permission'] || [];
    const addPermission = (name) => {
      const already = uses.some((p) => p.$?.['android:name'] === name);
      if (!already) {
        uses.push({ $: { 'android:name': name } });
        console.log(`[withAppTrackingManifest] Added permission: ${name}`);
      }
    };

    addPermission('android.permission.FOREGROUND_SERVICE_DATA_SYNC');
    manifest.manifest['uses-permission'] = uses;

    return config;
  });
};

module.exports = withAppTrackingManifest;
