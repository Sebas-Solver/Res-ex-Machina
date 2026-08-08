/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    // ts-jest cannot resolve .js extensions in TS imports; remap to .ts
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
