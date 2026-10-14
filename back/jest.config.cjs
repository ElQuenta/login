module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/unit/**/*.test.cjs'],
  transform: {
    '^.+\\.ts$': ['@swc/jest', {
      jsc: { parser: { syntax: 'typescript' }, target: 'es2022' },
      module: { type: 'commonjs' },
    }],
  },
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: ['src/modules/**/*.ts', 'src/middlewares/**/*.ts', 'src/models/**/*.ts'],
  coverageDirectory: 'coverage',
};
