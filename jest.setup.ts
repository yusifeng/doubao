jest.mock('react-native-safe-area-context', () => {
  return require('react-native-safe-area-context/jest/mock').default;
});
