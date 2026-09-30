const { withAndroidManifest } = require('expo/config-plugins');

// Foldable / large-screen support for Android.
//
// - `resizeableActivity` lets the app run in split-screen, freeform and
//   desktop windows and resize across fold/unfold instead of letterboxing.
// - The config changes below are handled in-process by React Native (the
//   window dimensions update and JS re-lays out), so folding or unfolding
//   the device doesn't restart the activity and lose in-memory state.
//
// The Expo template already sets most of these; this plugin just guarantees
// they stay put if another plugin rewrites the activity.
const REQUIRED_CONFIG_CHANGES = [
  'keyboard',
  'keyboardHidden',
  'orientation',
  'screenLayout',
  'screenSize',
  'smallestScreenSize',
  'uiMode',
];

module.exports = function withLargeScreenSupport(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;

    app.$['android:resizeableActivity'] = 'true';

    for (const activity of app.activity ?? []) {
      if (activity.$['android:name'] !== '.MainActivity') continue;
      activity.$['android:resizeableActivity'] = 'true';
      const current = (activity.$['android:configChanges'] ?? '').split('|').filter(Boolean);
      activity.$['android:configChanges'] = [
        ...new Set([...current, ...REQUIRED_CONFIG_CHANGES]),
      ].join('|');
    }
    return cfg;
  });
};
