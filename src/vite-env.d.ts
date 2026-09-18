/// <reference types="vite/client" />

/**
 * The only build-time switch in the application.
 *
 * Unset, the app builds against the fixtures and the result is the portable
 * dist/index.html that makes no network requests. Set, it builds against the
 * API at that origin. See src/data/repository.ts.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
