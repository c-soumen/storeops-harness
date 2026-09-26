import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  // Type checking is owned by `npm run typecheck`; skipping it in the
  // transform keeps the suite fast when workers compile in parallel.
  transform: { '^.+\\.ts$': ['ts-jest', { diagnostics: false }] },
  maxWorkers: '50%',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov'],
  coverageThreshold: {
    // Overall floor.
    global: { statements: 70, branches: 70, functions: 70, lines: 70 },
    // Business logic carries the highest bar.
    './src/activities/service.ts': { statements: 80, branches: 80, functions: 80, lines: 80 },
    './src/programmes/service.ts': { statements: 80, branches: 80, functions: 80, lines: 80 },
    './src/staff/service.ts': { statements: 80, branches: 80, functions: 80, lines: 80 },
    './src/alerts/service.ts': { statements: 80, branches: 80, functions: 80, lines: 80 },
    './src/reports/service.ts': { statements: 80, branches: 80, functions: 80, lines: 80 },
    // HTTP layer.
    './src/activities/routes.ts': { statements: 70, branches: 70, functions: 70, lines: 70 },
    './src/programmes/routes.ts': { statements: 70, branches: 70, functions: 70, lines: 70 },
    './src/staff/routes.ts': { statements: 70, branches: 70, functions: 70, lines: 70 },
    './src/alerts/routes.ts': { statements: 70, branches: 70, functions: 70, lines: 70 },
    // Shared primitives.
    './src/shared/': { statements: 60, branches: 60, functions: 60, lines: 60 },
  },
};

export default config;
