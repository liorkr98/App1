/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/.*|react-native-svg|react-native-purchases|react-native-mmkv)',
  ],
  // This runner is for the React Native app and nothing else. Without roots,
  // Jest walks the whole repo and picks up worker/src/**/*.test.ts, which are
  // Node ESM — they import './angles.js', and jest-expo's CommonJS resolver
  // cannot find a file that only exists as .ts. The worker has its own runner
  // (`npm run test --prefix worker`, node:test over the compiled output),
  // because it is a Node service and does not want a React Native preset.
  roots: ['<rootDir>/src'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  // Stage 0 ships no tests. Stage 1 adds the format.ts suite.
  passWithNoTests: true,
};
