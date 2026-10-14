# yaml_flow_scalar_escaper

Escapes strings for safe inclusion in YAML flow scalars (mapping values, flow sequences), handling the special characters and indicator sequences that break naive concatenation.

## Usage

```js
import { escapeFlowScalar, escapeFlowDoubleQuoted, isSafeFlowPlain } from './src/index.js';

escapeFlowScalar('hello');              // 'hello' (plain is safe)
escapeFlowScalar('a: b');               // '"a: b"' (colon-space forces quoting)
escapeFlowDoubleQuoted('a\n"b');     // '"a\\n\"b"' (always double-quoted, escaped)
isSafeFlowPlain('a,b');               // false (comma is a flow indicator)
```

## Why this exists

Building YAML by concatenating strings is tempting and usually wrong. The YAML spec carves out a tangle of "indicators" — `: `, ` #`, leading `-`/`?`/`!`, flow brackets, line breaks — that change meaning depending on position. A string that looks harmless in one spot can silently corrupt the surrounding structure.

This library makes one focused choice: it escapes for the **double-quoted** form, and only auto-promotes to plain when a strict predicate says it is safe. It does not attempt single-quoted scalars (whose doubled-quote escaping is fiddly and easy to get wrong), and it does not attempt block scalars. The trade-off is that output is sometimes more verbose than a hand-tuned emitter would produce, in exchange for correctness you can reason about locally.

## Edge cases you will hit

- **Windows line endings (`\r\n`)** are normalised to a single `\n` escape, because a raw CRLF inside a double-quoted YAML scalar is folded, not preserved.
- **DEL (`\x7f`)** is escaped defensively. YAML 1.2 treats it as printable, but many readers render it invisibly, so we escape to avoid silent corruption. If you need byte-exact passthrough of high-bit ASCII, call `escapeFlowDoubleQuoted` and post-process, or vendor a variant.
- **Plain-scalar detection is intentionally conservative.** `isSafeFlowPlain` may return `false` for strings that a given YAML emitter would happily emit plain. False negatives are acceptable; false positives are not. Do not file bugs asking us to relax the predicate — extend it in your own wrapper if your downstream parser is more permissive.

The package exports three names: `escapeFlowScalar` (the main entry point, picks plain-or-quoted automatically), `escapeFlowDoubleQuoted` (always double-quoted, with escapes), and `isSafeFlowPlain` (the strict predicate). All expect a single string argument and throw `TypeError` on non-string input.
