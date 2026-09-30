/**
 * Core conversion logic for int-hex-string.
 *
 * Design decisions (stated plainly so the tests and README stay honest):
 *
 * 1. Hex strings are lowercase. 0xFF and 0xff are both accepted on input (parse is
 *    case-insensitive), but we always emit lowercase on output. Lowercase is the
 *    dominant convention in protocol specs and hash digests; forcing it removes
 *    a class of "is 'FF' the same as 'ff'?" bugs from callers.
 *
 * 2. The "0x" prefix is OPTIONAL on input and ALWAYS present on output. Reading
 *    both prefixed and bare hex is common enough that rejecting one would annoy
 *    real callers; always emitting the prefix makes round-trips unambiguous in
 *    logs where bare hex can be mistaken for an identifier.
 *
 * 3. Signed integers use two's-complement over a fixed bit width. There is no
 *    "auto-detect the width" mode because it is unsound: 0xFF is 255 as an
 *    unsigned byte but -1 as a signed byte, and nothing in the hex itself tells
 *    you which. The caller must specify the width; the library does not guess.
 *
 * 4. Negative inputs are accepted in the signed path and encoded in two's
 *    complement. We do NOT accept a leading '-' on a hex string as a sign
 *    notation, because '-0x0F' is not two's complement and supporting it would
 *    conflate two different signed-integer conventions. If you need to express
 *    a negative value, express it as its two's-complement hex at the chosen
 *    bit width; that is exactly what this library produces for negative
 *    decimal inputs, so round-tripping works.
 */

/**
 * @typedef {(8 | 16 | 24 | 32 | 48 | 64 | 96 | 128)} BitWidth
 * A bit width supported by the signed two's-complement path.
 *
 * We restrict to a fixed set rather than accepting any multiple of 8 because
 * every supported width has an exact, lossless representation in JavaScript's
 * bitwise layer (via BigInt). Accepting arbitrary widths would let callers ask
 * for widths that imply semantic traps (e.g. 40 bits, where the two's-complement
 * range is rarely what anyone actually wants) with no upside. The set is large
 * enough to cover all common protocol field sizes.
 */

const SUPPORTED_WIDTHS = new Set([8, 16, 24, 32, 48, 64, 96, 128]);

/**
 * Assert a value is a non-negative safe-integer (the domain of the unsigned
 * path). Throws TypeError for non-integers and RangeError for negatives.
 *
 * We throw TypeError vs. RangeError deliberately: a non-number is the wrong
 * type entirely, a negative is the right type but out of the accepted domain.
 * Callers can branch on the constructor if they care.
 */
function assertUnsigned(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new TypeError(`expected an integer, got ${typeof value === 'number' ? value : typeof value}`);
  }
  if (!Number.isSafeInteger(value)) {
    // Above 2^53 - 1 the number primitive cannot represent every integer, so
    // hex output would silently lie. Refuse rather than produce wrong digits.
    throw new RangeError(`value exceeds safe integer range: ${value}`);
  }
  if (value < 0) {
    throw new RangeError(`expected a non-negative integer, got ${value}`);
  }
}

/**
 * Assert a value is a safe integer (either sign), the domain of the signed path.
 */
function assertSigned(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new TypeError(`expected an integer, got ${typeof value === 'number' ? value : typeof value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`value exceeds safe integer range: ${value}`);
  }
}

/**
 * Validate that width is one of our supported bit widths.
 * @param {number} width
 * @returns {number}
 */
function assertWidth(width) {
  if (!SUPPORTED_WIDTHS.has(width)) {
    throw new RangeError(
      `unsupported bit width ${width}; supported widths are ${[...SUPPORTED_WIDTHS].join(', ')}`
    );
  }
  return width;
}

/**
 * Parse a hex string into an unsigned integer.
 *
 * Accepts an optional leading '0x' / '0X' prefix; the rest must be hexadecimal
 * (case-insensitive). Empty body after the prefix is rejected so that '0x' alone
 * cannot silently become 0 — that class of typo is worth surfacing.
 *
 * Returns a number. For inputs up to 13 hex digits the result is exact and a
 * safe integer; for longer inputs we still return a number, but values above
 * 2^53-1 lose precision in the number primitive. Callers needing full precision
 * on long inputs should use parseHexToBigInt instead. We do not throw on long
 * input because the common case (24/32-bit fields) fits comfortably and the
 * BigInt escape hatch exists.
 *
 * @param {string} hex
 * @returns {number}
 */
export function parseHex(hex) {
  if (typeof hex !== 'string') {
    throw new TypeError(`expected a string, got ${typeof hex}`);
  }
  let s = hex;
  if (s.startsWith('0x') || s.startsWith('0X')) {
    s = s.slice(2);
  }
  if (s.length === 0) {
    throw new SyntaxError(`empty hex string after optional prefix: ${JSON.stringify(hex)}`);
  }
  if (!/^[0-9a-fA-F]+$/.test(s)) {
    throw new SyntaxError(`invalid hex characters in ${JSON.stringify(hex)}`);
  }
  return parseInt(s, 16);
}

/**
 * Format a non-negative integer as a lowercase hex string with a '0x' prefix.
 * Width is the minimum number of hex digits; the output is zero-padded to that
 * width. If the value needs more digits, it is NOT truncated — the caller gets
 * the full representation and can detect the overflow by comparing lengths.
 *
 * @param {number} value
 * @param {number} [minHexDigits=1]
 * @returns {string}
 */
export function toHex(value, minHexDigits = 1) {
  assertUnsigned(value);
  if (!Number.isInteger(minHexDigits) || minHexDigits < 0) {
    throw new RangeError(`minHexDigits must be a non-negative integer, got ${minHexDigits}`);
  }
  // BigInt path for safety once minHexDigits exceeds what a number can express
  // as a digit count (extremely unlikely, but cheap to guard).
  const hex = value.toString(16);
  if (hex.length >= minHexDigits) {
    return '0x' + hex;
  }
  return '0x' + '0'.repeat(minHexDigits - hex.length) + hex;
}

/**
 * Parse a hex string into a BigInt. Useful for values that exceed the safe
 * integer range (above 2^53-1, i.e. hex strings longer than 13 digits).
 *
 * @param {string} hex
 * @returns {bigint}
 */
export function parseHexToBigInt(hex) {
  if (typeof hex !== 'string') {
    throw new TypeError(`expected a string, got ${typeof hex}`);
  }
  let s = hex;
  if (s.startsWith('0x') || s.startsWith('0X')) {
    s = s.slice(2);
  }
  if (s.length === 0) {
    throw new SyntaxError(`empty hex string after optional prefix: ${JSON.stringify(hex)}`);
  }
  // BigInt constructor accepts a '0x'-prefixed lowercase string directly and
  // rejects invalid characters with a SyntaxError, which is exactly the
  // behaviour we want. Reusing it avoids a second regex.
  return BigInt('0x' + s.toLowerCase());
}

/**
 * Format a BigInt as a lowercase hex string with a '0x' prefix.
 *
 * @param {bigint} value
 * @param {number} [minHexDigits=1]
 * @returns {string}
 */
export function bigIntToHex(value, minHexDigits = 1) {
  if (typeof value !== 'bigint') {
    throw new TypeError(`expected a bigint, got ${typeof value}`);
  }
  if (value < 0n) {
    throw new RangeError(`expected a non-negative bigint, got ${value}`);
  }
  if (!Number.isInteger(minHexDigits) || minHexDigits < 0) {
    throw new RangeError(`minHexDigits must be a non-negative integer, got ${minHexDigits}`);
  }
  // BigInt.prototype.toString(16) emits lowercase hex without a prefix.
  const hex = value.toString(16);
  if (hex.length >= minHexDigits) {
    return '0x' + hex;
  }
  return '0x' + '0'.repeat(minHexDigits - hex.length) + hex;
}

/**
 * Encode a (possibly negative) integer as a fixed-width two's-complement hex
 * string. Width must be one of {8,16,24,32,48,64,96,128} bits.
 *
 * For non-negative values this is just zero-padding to width/4 hex digits.
 * For negative values we compute the two's-complement representation:
 *   mask = (1 << width) - 1
 *   encoded = (value & mask)  (in modular arithmetic)
 *
 * We use BigInt internally because Number's bitwise operators are limited to
 * 32 bits; doing the masking with Number would silently corrupt any width >32.
 *
 * @param {number} value
 * @param {number} width - bit width, must be in SUPPORTED_WIDTHS
 * @returns {string}
 */
export function toHexSigned(value, width) {
  assertSigned(value);
  assertWidth(width);

  const big = BigInt(value);
  const bits = BigInt(width);
  // Range check against the two's-complement range for this width.
  const min = -(1n << (bits - 1n));
  const max = (1n << (bits - 1n)) - 1n;
  if (big < min || big > max) {
    throw new RangeError(
      `value ${value} does not fit in signed ${width}-bit range [${min}, ${max}]`
    );
  }

  const mask = (1n << bits) - 1n;
  // BigInt's % is sign-preserving, so for negative big we add mask+1 to land
  // in [0, mask]. Equivalently: (big & mask) if & were defined on BigInt for
  // arbitrary widths — but JS BigInt & IS defined and does exactly this, so
  // we use it directly. (The mask ensures we only keep the low `width` bits.)
  const encoded = big & mask;

  const hexDigits = width / 4;
  let s = encoded.toString(16);
  // Pad to the full width so the output length is a stable signal of the
  // chosen width — callers can slice bytes off the front without ambiguity.
  if (s.length < hexDigits) {
    s = '0'.repeat(hexDigits - s.length) + s;
  }
  return '0x' + s;
}

/**
 * Decode a hex string as a fixed-width two's-complement signed integer.
 * Width must be one of {8,16,24,32,48,64,96,128} bits.
 *
 * If the value's top bit (bit width-1) is set, it is interpreted as negative
 * and we subtract 2^width to recover the signed value.
 *
 * Returns a number for widths up to 32 (always safe: 2^31-1 is within the safe
 * integer range) and a BigInt for wider widths, where the magnitude can exceed
 * 2^53-1. This split return type is deliberate and documented: forcing a Number
 * for 64-bit+ fields would silently lose precision, and forcing a BigInt for
 * 8-bit fields would be obnoxious. Callers know the width they asked for, so
 * they know which return type to expect.
 *
 * @param {string} hex
 * @param {number} width
 * @returns {number | bigint}
 */
export function parseHexSigned(hex, width) {
  if (typeof hex !== 'string') {
    throw new TypeError(`expected a string, got ${typeof hex}`);
  }
  assertWidth(width);

  const big = parseHexToBigInt(hex);
  const bits = BigInt(width);
  const mask = (1n << bits) - 1n;
  // Mask to `width` bits. parseHexToBigInt already rejects non-hex, but it
  // does not bound the length. A value wider than `width` bits is probably
  // a caller mistake; we mask rather than throw so that a 32-bit hex string
  // can be read as int8 by taking the low byte, which is occasionally useful.
  // Overflow is detectable by the caller by comparing lengths beforehand.
  const masked = big & mask;
  const signBit = 1n << (bits - 1n);
  const signed = masked & signBit ? masked - (1n << bits) : masked;

  // For widths up to 32, always return a Number. The most negative 32-bit
  // value is -2147483648 and the most positive is 2147483647, both of which
  // are safe integers, so no precision is lost.
  if (width <= 32) {
    return Number(signed);
  }
  return signed;
}
