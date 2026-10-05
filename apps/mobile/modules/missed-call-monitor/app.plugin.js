/*
 * Code Attribution
 * Expo. 2026. Expo documentation. Available at: https://docs.expo.dev/ [Accessed 5 September 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 */
/**
 * Adds READ_CALL_LOG ONLY when building the admin work-device variant
 * (HYDRA_ENABLE_MISSED_CALL_MONITOR=true, see eas.json "admin-device" profile). Public store builds
 * for customers/electricians never request call-log access (least privilege / Play policy).
 */
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

module.exports = function withMissedCallMonitor(config) {
  if (process.env.HYDRA_ENABLE_MISSED_CALL_MONITOR !== 'true') return config;
  return withAndroidManifest(config, (cfg) => {
    AndroidConfig.Permissions.ensurePermissions(cfg.modResults, ['android.permission.READ_CALL_LOG']);
    return cfg;
  });
};
