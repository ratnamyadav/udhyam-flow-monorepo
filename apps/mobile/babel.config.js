module.exports = (api) => {
  api.cache(true);
  // NativeWind v5 hooks `className` in via Metro (react-native-css), so no
  // JSX import source or NativeWind Babel preset is needed.
  return {
    presets: ['babel-preset-expo'],
  };
};
