# Vendored dependencies

The runtime does not download npm or JSR packages for HTML parsing.

| Package | Version | License | Source |
|---|---|---|---|
| parse5 | 7.3.0 | MIT | https://registry.npmjs.org/parse5/-/parse5-7.3.0.tgz |
| entities | 6.0.1 | BSD-2-Clause | https://registry.npmjs.org/entities/-/entities-6.0.1.tgz |

ES module distributions, package metadata and licenses are included. CommonJS
distributions and source maps are omitted. The two bare `entities/decode` and
`entities/escape` imports in parse5 are rewritten to relative paths. No other
runtime changes are made. HTML parsing is isolated behind `infrastructure/html.ts`.
