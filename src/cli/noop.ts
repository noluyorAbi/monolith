/**
 * Stands in for `server-only` when the library is bundled for the CLI.
 *
 * `server-only` exists to throw when server code is pulled into a client
 * bundle. A Node process is neither, and the package's default export throws
 * there, so the bundler is pointed here instead. The web build still resolves
 * the real one, so the guard it provides is not weakened where it applies.
 */
export {};
