module.exports = {
  preset: 'react-native',
  testMatch: ['<rootDir>/__tests__/**/*.test.tsx'],
  setupFiles: ['<rootDir>/__tests__/setup.js'],
  moduleNameMapper: {'\\.(ttf|otf)$': '<rootDir>/__tests__/fileStub.js'},
  testTimeout: 60000,
};
