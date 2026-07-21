// Stand-in for the `server-only` marker under Vitest, which is neither a
// browser nor a React Server Components build. The real package throws when a
// client bundle imports a server module; that guard belongs to Next's bundler,
// not to a node test run.
export {};
