/* eslint-env node */

/**
 * Architecture rule #4 is partly enforced here: raw `throw new Error(...)` is
 * banned in service and route layers — those layers must throw an `AppError`
 * subclass so the central error handler can map it to an HTTP response.
 */
const NO_RAW_ERROR = [
  'error',
  {
    selector: "ThrowStatement > NewExpression[callee.name='Error']",
    message:
      'Do not throw raw Error in services/routes. Throw an AppError subclass (ValidationError, NotFoundError, UnauthorizedError, ForbiddenError, ConflictError).',
  },
  {
    selector: "NewExpression[callee.name='Error']",
    message:
      'Do not construct raw Error in services/routes. Use an AppError subclass instead.',
  },
];

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: ['dist/', 'coverage/', 'node_modules/', '*.js', '*.cjs'],
  rules: {
    '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'explicit', overrides: { constructors: 'no-public' } }],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
  },
  overrides: [
    {
      files: ['src/**/service.ts', 'src/**/routes.ts'],
      rules: {
        'no-restricted-syntax': NO_RAW_ERROR,
      },
    },
    {
      files: ['tests/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/explicit-member-accessibility': 'off',
      },
    },
  ],
};
