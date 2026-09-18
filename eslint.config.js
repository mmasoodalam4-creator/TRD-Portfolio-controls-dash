import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * Lint configuration.
 *
 * Type-aware rules are on: the value of TypeScript here is catching a figure
 * that cannot be what the screen claims, and the rules that do that need the
 * type information.
 */
export default tseslint.config(
  { ignores: ['dist', 'tests/output', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      // Both projects: the app's tsconfig covers src/, the server's covers
      // api/ and db/. Without the second, type-aware linting cannot parse the
      // server at all.
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.server.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Screens read through the state hooks; a direct fixture import would
      // reintroduce the second data path the repository boundary removed.
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@/data', '@/data/index', '@/data/mock/*'],
          message: 'Screens read data through @/state/DataProvider, not the fixtures directly.',
        }, {
          // The database vendor has not been chosen, and the architecture is
          // built so that it does not have to be. A vendor client imported
          // into the application would decide it silently: the provider stops
          // being a deployment detail the moment a screen imports its SDK.
          // The app speaks the HTTP contract in docs/api-contract.md; the
          // server speaks to whatever database it is pointed at.
          group: [
            '@supabase/*', 'supabase', 'firebase', 'firebase/*', '@firebase/*',
            '@planetscale/*', '@neondatabase/*', '@vercel/postgres', 'pg', 'mysql2',
            'mongodb', '@aws-sdk/*', '@azure/*',
          ],
          message:
            'No database or cloud-vendor SDK in src/. The app talks HTTP to the API '
            + '(docs/api-contract.md); the server owns the database. Keeping this true '
            + 'is what lets the provider be chosen — or changed — without touching the app.',
        }, {
          // A model SDK in the browser needs an API key in the browser, and a
          // key in the browser is a key in dist/index.html — a public file on a
          // public site. It is also a network call from a deliverable whose
          // entire promise is that it makes none. The model is reached through
          // the API, the same way the database and the .xlsx reader are.
          group: [
            '@google/generative-ai', '@google/genai', '@google-cloud/vertexai',
            'openai', '@anthropic-ai/*', '@mistralai/*', 'cohere-ai', 'langchain',
            'langchain/*', '@langchain/*',
          ],
          message:
            'No model SDK in src/. Calling a model from the browser puts its API key into '
            + 'dist/index.html and makes the offline deliverable fetch at runtime. Reach the '
            + 'model through the API (/api/ai/*), where the key stays server-side.',
        }],
      }],
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // The data and domain layers are what the boundary contains, and the state
    // layer is the one consumer allowed to cross it — that is its whole job.
    // The fixture clause is lifted for them; the vendor ban is NOT. Turning the
    // whole rule off here would have left the data layer free to import a
    // provider SDK, which is precisely the layer that must not.
    files: ['src/data/**/*.ts', 'src/domain/**/*.ts', 'src/state/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        {
          // The database vendor has not been chosen, and the architecture is
          // built so that it does not have to be. A vendor client imported
          // into the application would decide it silently: the provider stops
          // being a deployment detail the moment the app imports its SDK.
          // The app speaks the HTTP contract in docs/api-contract.md; the
          // server owns the database.
          group: [
            '@supabase/*', 'supabase', 'firebase', 'firebase/*', '@firebase/*',
            '@planetscale/*', '@neondatabase/*', '@vercel/postgres', 'pg', 'mysql2',
            'mongodb', '@aws-sdk/*', '@azure/*',
          ],
          message:
            'No database or cloud-vendor SDK in src/. The app talks HTTP to the API '
            + '(docs/api-contract.md); the server owns the database. Keeping this true '
            + 'is what lets the provider be chosen — or changed — without touching the app.',
        },
      ] }],
    },
  },
  {
    // Providers export their hooks alongside the component, and the shared UI
    // exports helpers beside it. That is idiomatic; the rule is about
    // hot-reload granularity in development, not correctness, and splitting
    // these files to satisfy it would scatter closely-related code.
    files: [
      'src/state/**/*.tsx',
      'src/components/ui/Drawer.tsx',
      'src/components/ui/Toast.tsx',
      'src/screens/shared.tsx',
    ],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // The server: Node, not a browser, and its own tsconfig. It is allowed the
    // database driver — owning that choice is its entire purpose — and it
    // legitimately logs to stdout.
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    files: ['api/**/*.ts', 'server/**/*.ts', 'db/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      parserOptions: {
        project: ['./tsconfig.server.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-console': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-console': 'off' },
  },
);
