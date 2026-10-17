# Phase 0: Foundation

## npm workspaces

Workspaces let one lockfile describe all packages and allow npm to link local packages during development. They do not enforce architectural boundaries by themselves; package manifests, TypeScript references, export maps, and tests make those boundaries visible.

## ESM and `NodeNext`

Each package declares `"type": "module"`. TypeScript's `NodeNext` mode follows Node.js package and extension rules rather than pretending that TypeScript has a separate runtime module system. Future relative imports in source files must therefore use the emitted `.js` extension.

## Project references

A referenced TypeScript project is compiled before its dependents. Each publishable package is `composite` and emits declarations, which allows adapters to type-check against core's public surface. References improve build ordering but do not replace package dependencies in `package.json`; both are needed.

## Export maps and declarations

The `exports` field defines supported package entry points. Its `types` condition directs TypeScript to declarations while `import` directs ESM runtimes and bundlers to JavaScript. Restricting exports prevents accidental coupling to internal files.

## Peer dependencies

Express and NestJS are host frameworks, so their adapters declare them as peers. This avoids silently installing a second incompatible framework copy and lets the application choose a supported version. `@rqg/core` is a normal dependency because adapters require it at runtime.

## Strictness and deterministic design

Strict compiler options catch missing values, unsafe indexed access, and accidental optional-property assumptions early. Later phases will inject clocks and storage implementations where that makes behavior deterministic without adding abstraction before it is useful.

## Official references

- [Node.js packages and ESM](https://nodejs.org/api/packages.html)
- [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces)
- [TypeScript project references](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [TypeScript `NodeNext` module resolution](https://www.typescriptlang.org/tsconfig/moduleResolution.html)
- [Node.js package entry points](https://nodejs.org/api/packages.html#package-entry-points)
