const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

// Expo's default Metro config detects the pnpm workspace root automatically
// (watchFolders + nodeModulesPaths), so sibling @udyamflow/* packages and
// pnpm's nested node_modules resolve without manual overrides.
const config = getDefaultConfig(__dirname);

module.exports = withNativewind(config);
