/**
 * @module yaml_flow_scalar_escaper/core
 *
 * This module escapes strings for safe inclusion in YAML flow scalars.
 *
 * Design decision
 * ----------------
 * The YAML spec (https://yaml.org/spec/1.2.2/) is a sprawling document and "flow
 * scalar" is a broad family that includes plain scalars, double-quoted strings,
 * and single-quoted strings. We made one focused choice: we only attempt the
 * double-quoted form, plus a strict "safe plain" gate for callers who want the
 * aesthetic of a plain scalar but only when it is guaranteed to round-trip.
 *
 * Rationale for preferring double quotes:
 *   - Double-quoted scalars have the simplest escaping rule: a backslash is
 *     the universal escape introducer, and the set of characters that must be
 *     escaped is small and unambiguous.
 *   - Single-quoted scalars in YAML use doubled single quotes ('') as the
 *     escape mechanism, which is easy to get wrong and interacts awkwardly
 *     with leading-quote and trailing-quote corner cases.
 *   - Plain scalars cannot contain any of: ": " (colon-space), " #" (space-hash),
 *     leading indicators, or unbalanced/leading brackets and braces. Deciding
 *     when a plain scalar is safe requires inspecting every character; the
 *     rules are positional (first character vs interior). We provide a strict
 *     `isSafeFlowPlain` predicate for that, but do not attempt to auto-promote
 *     to plain.
 */

/**
 * The two-byte CRLF sequence. We check for this before inspecting individual
 * characters because a lone '\r' followed by something other than '\n' has a
 * different (non-normalised) meaning in YAML.
 */
const CRLF = '\r\n';

/**
 * Characters that must be backslash-escaped inside a double-quoted YAML scalar.
 * The keys are the characters; the values are the replacement sequences.
 *
 * Why this set:
 *   \\  — the escape introducer itself must always be escaped.
 *   "   — closes the double-quoted scalar.
 *   \n  — line break; YAML parsers treat raw newlines inside a quoted scalar
 *         as folding, which mangles data. We force \n.
 *   \r  — a lone CR not part of CRLF; must be escaped to avoid being folded.
 *   \t  — tab; YAML 1.2 allows raw tabs inside double-quoted scalars but many
 *         readers (and the 1.1 spec) treat them as significant whitespace in
 *         ways that surprise callers, so we escape to \t.
 *   \x00 — NUL is explicitly not allowed unescaped.
 *   \x7f — DEL is technically printable ASCII; many tools render it invisibly,
 *          so we escape it defensively. (Documented in README.)
 *   \u0085 — Next Line; YAML marks this as a non-printable line break.
 *   \u2028 — Line Separator; YAML marks this as a non-printable line break.
 *   \u2029 — Paragraph Separator; YAML marks this as a non-printable line break.
 *
 * Other C0 control characters (0x01–0x1f except those above) we pass through
 * raw. YAML 1.2 permits this and escaping them would bloat output for callers
 * embedding structured-but-binary-ish payloads.
 */
const DOUBLE_QUOTED_ESCAPES = {
  '\\': '\\\\',
  '"': '\\"',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\x00': '\\0',
  '\x7f': '\\x7f',
  '\u0085': '\\u0085',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/**
 * Characters that disqualify a string from being a plain flow scalar regardless
 * of position. Their presence forces `isSafeFlowPlain` to return false.
 */
const PLAIN_FORBIDDEN_CHARS = new Set([
  '\n', '\r', '\u0085', '\u2028', '\u2029', // line breaks
  '\t',                                  // tab is ambiguous in plain scalars
  ',', '[', ']', '{', '}',               // flow indicators
]);

/**
 * Characters that disqualify a plain flow scalar ONLY when they appear in the
 * first column (i.e. as the first character). Positional rules like this are
 * why we don't try to auto-promote to plain — getting the positional logic
 * right for every case is the entire difficulty.
 */
const PLAIN_FORBIDDEN_FIRST_CHARS = new Set([
  '#', '&', '*', '!', '|', '>', '%', '@', '`',
  '-', '?',
  '"', "'",
  ' ',
]);

/**
 * Escape a string so it can be safely embedded inside a YAML double-quoted
 * flow scalar (e.g. as a mapping value: `key: "value"`).
 *
 * The returned value includes the surrounding double quotes — callers should
 * not add them. This is a deliberate choice: keeping the quoting visible at
 * the call site makes it obvious that the string has been escaped, which
 * avoids the classic bug of double-quoting an already-quoted string.
 *
 * @param {string} value - The string to escape.
 * @returns {string} A double-quoted YAML scalar literal, including quotes.
 * @throws {TypeError} If `value` is not a string.
 */
export function escapeFlowDoubleQuoted(value) {
  if (typeof value !== 'string') {
    throw new TypeError('escapeFlowDoubleQuoted expects a string');
  }

  let out = '"';
  for (let i =  0; i < value.length; i++) {
    const ch = value[i];
    // Check the two-byte CRLF sequence before considering `ch` alone. We use
    // String.prototype.includes with a start position to avoid slicing.
    if (ch === '\r' && i + 1 < value.length && value[i + 1] === '\n') {
      out += '\\n';
      i++; // consume the '\n' half of the CRLF pair
      continue;
    }
    const esc = DOUBLE_QUOTED_ESCAPES[ch];
    if (esc !== undefined) {
      out += esc;
    } else {
      out += ch;
    }
  }
  out += '"';
  return out;
}

/**
 * Predicate: can `value` be safely emitted as a YAML plain (unquoted) flow
 * scalar?
 *
 * We are deliberately strict. A plain scalar is safe here only if:
 *   1. The string is non-empty.
 *   2. It contains no forbidden interior characters (line breaks, tab, flow
 *      indicators, or the ':' value indicator which is risky anywhere).
 *   3. It does not start with a reserved indicator.
 *   4. It does not end with a space (a trailing space is invisible and many
 *      parsers strip it silently).
 *   5. It does not contain the sequences ": " or " #" anywhere — these are the
 *      canonical value-indicator and comment-introducer sequences.
 *   6. It does not end with ':' (a trailing colon is ambiguous against the
 *      mapping value indicator).
 *
 * This is intentionally conservative; false negatives (declaring a string
 * unsafe when it could in fact be plain) are acceptable, false positives are
 * not.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isSafeFlowPlain(value) {
  if (typeof value !== 'string' || value.length === 0) return false;

  if (PLAIN_FORBIDDEN_FIRST_CHARS.has(value[0])) return false;

  if (value[value.length - 1] === ' ') return false;
  if (value[value.length - 1] === ':') return false;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (PLAIN_FORBIDDEN_CHARS.has(ch)) return false;
    // Positional check: ": " only matters after the first character, but since
    // the first-char set already blocks a leading ':', we can check uniformly.
    if (ch === ':' && i + 1 < value.length && value[i + 1] === ' ') return false;
    if (ch === ' ' && i + 1 < value.length && value[i + 1] === '#') return false;
  }

  return true;
}

/**
 * Escape a string for inclusion in a YAML flow scalar, choosing the form
 * automatically.
 *
 * Decision rule:
 *   - If `value` is safe as a plain scalar, return it unchanged.
 *   - Otherwise, return a double-quoted, escaped form (including quotes).
 *
 * This is the main entry point. Callers who want to force a particular form
 * should call `escapeFlowDoubleQuoted` or check `isSafeFlowPlain` themselves.
 *
 * @param {string} value
 * @returns {string}
 * @throws {TypeError} If `value` is not a string.
 */
export function escapeFlowScalar(value) {
  if (typeof value !== 'string') {
    throw new TypeError('escapeFlowScalar expects a string');
  }
  if (isSafeFlowPlain(value)) {
    return value;
  }
  return escapeFlowDoubleQuoted(value);
}
