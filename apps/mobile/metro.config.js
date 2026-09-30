// Expo SDK 52+ configures Metro for monorepos automatically (watchFolders,
// nodeModulesPaths, pnpm symlinks, and deduping react/react-native via the
// autolinking resolver), so we only layer NativeWind on top of the defaults.
// Do NOT set `disableHierarchicalLookup` or override `nodeModulesPaths`: with
// pnpm's isolated layout, transitive deps (e.g. @expo/metro-runtime, the deps
// of @udyamflow/auth) live next to their dependents under node_modules/.pnpm
// and are only reachable via hierarchical lookup.
require('./load-root-env');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

const config = withNativewind(getDefaultConfig(__dirname));

// See metro.transformer.js — pins lightningcss for the CSS compile step.
config.transformerPath = require.resolve('./metro.transformer.js');

module.exports = config;
