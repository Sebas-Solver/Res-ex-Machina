/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  injectGlobals: true,
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    // ts-jest cannot resolve .js extensions in TS imports; remap to .ts
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        diagnostics: {
          ignoreCodes: [2589, 151002],
        },
      },
    ],
  },
};
