/**
 * The expect@1 matchers this tree's specs actually use, implemented locally so
 * the Node test runner (scripts/run-node-tests.js) needs no package that is
 * not installed. The spec files `import expect from 'expect'`; the runner
 * resolves that specifier here.
 *
 * Matchers are the historical mjackson/expect v1 API (`toBe`, `toExist`,
 * `toNotContain`, …), not jest's — the assertions in src were written against
 * it and are not rewritten to suit a runner.
 */

'use strict';

const isEqual = require('lodash/isEqual');

const stringify = (value) => {
  try {
    if (typeof value === 'string') {
      return JSON.stringify(value);
    }
    if (value instanceof Error) {
      return String(value);
    }
    return JSON.stringify(value, (_k, v) => (
      typeof v === 'number' && !isFinite(v) ? String(v) : v
    ));
  } catch (e) {
    return String(value);
  }
};

const fail = (message) => {
  const error = new Error(message);
  error.name = 'ExpectationError';
  throw error;
};

/** Partial deep match (tmatch semantics): every key/index the pattern states
 *  must match; the actual value may carry more. */
const matchesPattern = (actual, pattern) => {
  if (pattern instanceof RegExp) {
    return typeof actual === 'string' && pattern.test(actual);
  }
  if (Array.isArray(pattern)) {
    return Array.isArray(actual) &&
      pattern.every((entry, i) => matchesPattern(actual[i], entry));
  }
  if (pattern !== null && typeof pattern === 'object') {
    if (actual === pattern) {
      return true;
    }
    if (actual === null || typeof actual !== 'object') {
      return false;
    }
    return Object.keys(pattern).every(
      (key) => matchesPattern(actual[key], pattern[key]),
    );
  }
  return actual === pattern;
};

const contains = (haystack, needle) => {
  if (typeof haystack === 'string') {
    return haystack.indexOf(needle) !== -1;
  }
  if (Array.isArray(haystack)) {
    return haystack.some((item) => isEqual(item, needle));
  }
  fail(`toContain expects a string or an array, got ${stringify(haystack)}`);
  return false;
};

class Expectation {
  constructor(actual) {
    this.actual = actual;
  }

  toBe(expected) {
    if (this.actual !== expected) {
      fail(`Expected ${stringify(this.actual)} to be ${stringify(expected)}`);
    }
    return this;
  }

  toNotBe(expected) {
    if (this.actual === expected) {
      fail(`Expected ${stringify(this.actual)} to not be ${stringify(expected)}`);
    }
    return this;
  }

  toEqual(expected) {
    if (!isEqual(this.actual, expected)) {
      fail(
        `Expected ${stringify(this.actual)} to equal ${stringify(expected)}`,
      );
    }
    return this;
  }

  toNotEqual(expected) {
    if (isEqual(this.actual, expected)) {
      fail(`Expected ${stringify(this.actual)} to not equal ${stringify(expected)}`);
    }
    return this;
  }

  toExist() {
    if (this.actual === undefined || this.actual === null) {
      fail(`Expected ${stringify(this.actual)} to exist`);
    }
    return this;
  }

  toNotExist() {
    if (this.actual !== undefined && this.actual !== null) {
      fail(`Expected ${stringify(this.actual)} to not exist`);
    }
    return this;
  }

  toBeTruthy() {
    if (!this.actual) {
      fail(`Expected ${stringify(this.actual)} to be truthy`);
    }
    return this;
  }

  toBeFalsy() {
    if (this.actual) {
      fail(`Expected ${stringify(this.actual)} to be falsy`);
    }
    return this;
  }

  toBeLessThan(expected) {
    if (!(this.actual < expected)) {
      fail(`Expected ${stringify(this.actual)} to be less than ${stringify(expected)}`);
    }
    return this;
  }

  toBeGreaterThan(expected) {
    if (!(this.actual > expected)) {
      fail(`Expected ${stringify(this.actual)} to be greater than ${stringify(expected)}`);
    }
    return this;
  }

  // expect@1 alias for toBeGreaterThan.
  toBeMoreThan(expected) {
    return this.toBeGreaterThan(expected);
  }

  toContain(needle) {
    if (!contains(this.actual, needle)) {
      fail(`Expected ${stringify(this.actual)} to contain ${stringify(needle)}`);
    }
    return this;
  }

  toNotContain(needle) {
    if (contains(this.actual, needle)) {
      fail(`Expected ${stringify(this.actual)} to not contain ${stringify(needle)}`);
    }
    return this;
  }

  // expect@1 aliases for toContain / toNotContain.
  toInclude(needle) {
    return this.toContain(needle);
  }

  toExclude(needle) {
    return this.toNotContain(needle);
  }

  // expect@1's toMatch is tmatch-style: a RegExp (or source string) against a
  // string, or a partial deep pattern against an object/array.
  toMatch(pattern) {
    if (typeof this.actual === 'string') {
      const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
      if (!re.test(this.actual)) {
        fail(`Expected ${stringify(this.actual)} to match ${pattern}`);
      }
      return this;
    }
    if (!matchesPattern(this.actual, pattern)) {
      fail(
        `Expected ${stringify(this.actual)} to match ${stringify(pattern)}`,
      );
    }
    return this;
  }

  toBeA(expected) {
    if (typeof expected === 'string') {
      if (typeof this.actual !== expected) {
        fail(`Expected ${stringify(this.actual)} to be a ${expected}`);
      }
    } else if (!(this.actual instanceof expected)) {
      fail(`Expected ${stringify(this.actual)} to be a ${expected && expected.name}`);
    }
    return this;
  }
}

const expect = (actual) => new Expectation(actual);

module.exports = expect;
// `import expect from 'expect'` under esModuleInterop.
module.exports.default = expect;
