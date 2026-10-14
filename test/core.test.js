import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeFlowScalar,
  escapeFlowDoubleQuoted,
  isSafeFlowPlain,
} from '../src/index.js';

test('escapeFlowScalar passes through a simple safe plain scalar', () => {
  assert.equal(escapeFlowScalar('hello'), 'hello');
});

test('escapeFlowScalar wraps a string containing a newline in double quotes', () => {
  assert.equal(escapeFlowScalar('a\nb'), '"a\\nb"');
});

test('escapeFlowDoubleQuoted escapes backslash and quote', () => {
  assert.equal(escapeFlowDoubleQuoted('a\\b"c'), '"a\\\\b\\"c"');
});

test('escapeFlowDoubleQuoted escapes tab as \\t', () => {
  assert.equal(escapeFlowDoubleQuoted('a\tb'), '"a\\tb"');
});

test('escapeFlowDoubleQuoted normalises CRLF to \\n', () => {
  assert.equal(escapeFlowDoubleQuoted('a\r\nb'), '"a\\nb"');
});

test('escapeFlowDoubleQuoted escapes a lone CR as \\r', () => {
  assert.equal(escapeFlowDoubleQuoted('a\rb'), '"a\\rb"');
});

test('escapeFlowDoubleQuoted escapes NUL as \\0', () => {
  assert.equal(escapeFlowDoubleQuoted('a\x00b'), '"a\\0b"');
});

test('escapeFlowDoubleQuoted escapes U+2028 line separator', () => {
  assert.equal(escapeFlowDoubleQuoted('a\u2028b'), '"a\\u2028b"');
});

test('isSafeFlowPlain rejects a string containing ": " (colon-space)', () => {
  assert.equal(isSafeFlowPlain('a: b'), false);
});

test('isSafeFlowPlain rejects a string containing " #" (space-hash)', () => {
  assert.equal(isSafeFlowPlain('a #b'), false);
});

test('isSafeFlowPlain rejects a leading dash', () => {
  assert.equal(isSafeFlowPlain('- item'), false);
});

test('isSafeFlowPlain rejects a trailing colon', () => {
  assert.equal(isSafeFlowPlain('key:'), false);
});

test('isSafeFlowPlain rejects a string containing a comma', () => {
  assert.equal(isSafeFlowPlain('a,b'), false);
});

test('isSafeFlowPlain rejects an empty string', () => {
  assert.equal(isSafeFlowPlain(''), false);
});

test('isSafeFlowPlain accepts a string with an interior colon not followed by space', () => {
  assert.equal(isSafeFlowPlain('a:b'), true);
});

test('escapeFlowScalar forces quoting when plain would be unsafe', () => {
  assert.equal(escapeFlowScalar('a: b'), '"a: b"');
});

test('escapeFlowDoubleQuoted throws on non-string input', () => {
  assert.throws(() => escapeFlowDoubleQuoted(42), TypeError);
});

test('escapeFlowScalar throws on non-string input', () => {
  assert.throws(() => escapeFlowScalar(null), TypeError);
});
