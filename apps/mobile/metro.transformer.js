// Metro transform-worker entry: pins lightningcss, then delegates to
// NativeWind's (react-native-css) transformer.
//
// react-native-css compiles global.css by running lightningcss with JS
// visitors, which serialises the CSS AST to JS and back. lightningcss >=1.30.2
// (Expo SDK 55's @expo/metro-config ships 1.32) cannot deserialise
// `var(--x, fallback)` after that round-trip and the bundle fails with
// "global.css: failed to deserialize; expected an object-like struct named
// Specifier". react-native-css looks lightningcss up next to
// @expo/metro-config, so we redirect every `lightningcss` resolution inside
// the transform worker to this app's own pinned copy (1.30.1, the version
// react-native-css recommends). Remove this file once lightningcss is fixed.
const Module = require('node:module');
const path = require('node:path');

const pinnedLightningcss = require.resolve('lightningcss');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, ...rest) {
  if (request === 'lightningcss') return pinnedLightningcss;
  return originalResolveFilename.call(this, request, ...rest);
};

module.exports = require(
  path.join(path.dirname(require.resolve('react-native-css/metro')), 'metro-transformer.js'),
);
