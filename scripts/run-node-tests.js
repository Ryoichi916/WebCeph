/**
 * Node test runner for the pure (non-browser) spec files.
 *
 * `npm test` used to start karma, whose plugin set (karma-webpack, karma-mocha,
 * the launchers…) is not installed in this tree — so the suite that carries the
 * analyses' guard rails (tweed.test.ts's closure identity, the ANB banding
 * cases, the demo predictor's determinism) could not be *run*, only read. A
 * guard that cannot fail cannot guard.
 *
 * This runner executes every `src/**\/*.test.ts` that does not need a browser,
 * with no packages beyond what the tree already has:
 *
 *  - **ts-node** (installed) transpiles the TypeScript on require. Type
 *    checking is `npm run tsc`'s job (tsconfig excludes the test files, as it
 *    always has), so the runner registers transpile-only.
 *  - Bare imports like `analyses/helpers` resolve against `src/`, mirroring
 *    webpack's `resolve.modules` and tsconfig's `paths`.
 *  - `import expect from 'expect'` resolves to `scripts/expect-shim.js`, a
 *    small implementation of the expect@1 matchers these specs use. The real
 *    package is not installed, and installing one is not this tree's call.
 *  - `describe/it/before/after` are the usual mocha-style globals, run
 *    sequentially; async specs are awaited.
 *
 * The two WCeph case-file specs are **skipped by name, out loud**: they require
 * webpack loader syntax (`file-loader?...!./fixtures/...`), `fetch` and `File`,
 * which only the karma/browser pipeline provides (`npm run test:karma`, when
 * its plugins are present). Skipping silently is how suites rot; the runner
 * prints what it skipped and why, every run.
 */

'use strict';

const path = require('path');
const Module = require('module');
const glob = require('glob');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const EXPECT_SHIM = path.join(__dirname, 'expect-shim.js');

// Browser-only specs: webpack loader imports + fetch/File. Kept out of the run
// but reported, so their absence is a stated fact rather than a silent hole.
const BROWSER_ONLY = [
  {
    file: 'src/utils/importers/wceph/v1/import.test.ts',
    reason: 'webpack file-loader fixture + fetch/File — run via npm run test:karma',
  },
  {
    file: 'src/utils/importers/wceph/v1/export.test.ts',
    reason: 'webpack file-loader fixture + fetch/File — run via npm run test:karma',
  },
];

// ---- Module resolution ------------------------------------------------------

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    target: 'es2017',
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    jsx: 'react',
  },
});

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveWithSrc(request, ...rest) {
  if (request === 'expect') {
    return originalResolve.call(this, EXPECT_SHIM, ...rest);
  }
  try {
    return originalResolve.call(this, request, ...rest);
  } catch (error) {
    // Bare specifier ('analyses/helpers', 'utils/store') → try src/, the same
    // root webpack and tsconfig resolve against.
    if (!request.startsWith('.') && !path.isAbsolute(request)) {
      return originalResolve.call(this, path.join(SRC, request), ...rest);
    }
    throw error;
  }
};

// Build-time globals webpack's DefinePlugin injects into the bundle
// (webpack.config.js); the specs exercise modules that read them.
global.__DEBUG__ = false;
global.__VERSION__ = 'node-tests';
global.__BUILD_TIMESTAMP__ = 0;

// ---- Minimal mocha-style harness -------------------------------------------

/** @typedef {{ name: string, fn: Function }} Spec */

const rootSuite = {
  name: '', specs: [], suites: [], before: [], after: [],
  beforeEach: [], afterEach: [], parent: null,
};
let currentSuite = rootSuite;

global.describe = (name, fn) => {
  const suite = {
    name, specs: [], suites: [], before: [], after: [],
    beforeEach: [], afterEach: [], parent: currentSuite,
  };
  currentSuite.suites.push(suite);
  const previous = currentSuite;
  currentSuite = suite;
  try {
    fn();
  } finally {
    currentSuite = previous;
  }
};
global.it = (name, fn) => {
  currentSuite.specs.push({ name, fn });
};
global.xit = () => undefined;
global.xdescribe = () => undefined;
global.before = (fn) => currentSuite.before.push(fn);
global.after = (fn) => currentSuite.after.push(fn);
global.beforeEach = (fn) => currentSuite.beforeEach.push(fn);
global.afterEach = (fn) => currentSuite.afterEach.push(fn);

const failures = [];
let passed = 0;

const eachHooks = (suite, key) => {
  const chain = [];
  for (let s = suite; s !== null; s = s.parent) {
    chain.unshift(...s[key]);
  }
  return chain;
};

const runSuite = async (suite, ancestry) => {
  const label = suite.name === '' ? ancestry : `${ancestry}${suite.name} › `;
  for (const hook of suite.before) {
    await hook();
  }
  for (const spec of suite.specs) {
    const fullName = `${label}${spec.name}`;
    try {
      for (const hook of eachHooks(suite, 'beforeEach')) {
        await hook();
      }
      await spec.fn();
      for (const hook of eachHooks(suite, 'afterEach')) {
        await hook();
      }
      passed += 1;
      process.stdout.write(`  ✓ ${fullName}\n`);
    } catch (error) {
      failures.push({ name: fullName, error });
      process.stdout.write(`  ✗ ${fullName}\n    ${error && error.message}\n`);
    }
  }
  for (const child of suite.suites) {
    await runSuite(child, label);
  }
  for (const hook of suite.after) {
    await hook();
  }
};

// ---- Load and run -----------------------------------------------------------

const main = async () => {
  const skippedFiles = BROWSER_ONLY.map(({ file }) => path.join(ROOT, file));
  const testFiles = glob
    .sync('src/**/*.test.ts', { cwd: ROOT, absolute: true })
    .filter((file) => skippedFiles.indexOf(file) === -1)
    .sort();

  for (const file of testFiles) {
    process.stdout.write(`\n${path.relative(ROOT, file)}\n`);
    // Loading registers the file's suites/specs on the root suite; each file
    // is run before the next loads so its output lands under its header.
    rootSuite.suites.length = 0;
    rootSuite.specs.length = 0;
    require(file);
    await runSuite(rootSuite, '');
  }

  process.stdout.write('\n');
  BROWSER_ONLY.forEach(({ file, reason }) => {
    process.stdout.write(`  ⏭ skipped ${file} (${reason})\n`);
  });
  process.stdout.write(
    `\n${passed} passing, ${failures.length} failing, ` +
    `${BROWSER_ONLY.length} file(s) skipped as browser-only\n`,
  );
  if (failures.length > 0) {
    failures.forEach(({ name, error }) => {
      process.stdout.write(`\nFAIL ${name}\n`);
      process.stdout.write(`${(error && error.stack) || error}\n`);
    });
    process.exitCode = 1;
  }
};

main().catch((error) => {
  process.stderr.write(`${(error && error.stack) || error}\n`);
  process.exitCode = 1;
});
