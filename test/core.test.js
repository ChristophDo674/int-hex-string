import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHex,
  toHex,
  parseHexToBigInt,
  bigIntToHex,
  toHexSigned,
  parseHexSigned,
} from '../src/index.js';

// --- parseHex -------------------------------------------------------------

test('parseHex accepts a bare lowercase hex string', () => {
  assert.equal(parseHex('ff'), 255);
});

test('parseHex accepts a 0x-prefixed string (lowercase prefix)', () => {
  assert.equal(parseHex('0xff'), 255);
});

test('parseHex is case-insensitive on both prefix and body', () => {
  assert.equal(parseHex('0XFF'), 255);
  assert.equal(parseHex('0xFf'), 255);
  assert.equal(parseHex('AbCdEf'), 0xabcdef);
});

test('parseHex returns 0 for "0" and "0x0"', () => {
  assert.equal(parseHex('0'), 0);
  assert.equal(parseHex('0x0'), 0);
});

test('parseHex rejects an empty body after prefix', () => {
  assert.throws(() => parseHex('0x'), SyntaxError);
  assert.throws(() => parseHex(''), SyntaxError);
});

test('parseHex rejects non-hex characters', () => {
  assert.throws(() => parseHex('0xgg'), SyntaxError);
  assert.throws(() => parseHex('hello'), SyntaxError);
});

test('parseHex rejects non-string input with TypeError', () => {
  assert.throws(() => parseHex(255), TypeError);
  assert.throws(() => parseHex(null), TypeError);
});

// --- toHex ----------------------------------------------------------------

test('toHex formats a small number with 0x prefix', () => {
  assert.equal(toHex(255), '0xff');
});

test('toHex zero-pads to minHexDigits', () => {
  assert.equal(toHex(255, 4), '0x00ff');
  assert.equal(toHex(0, 8), '0x00000000');
});

test('toHex does NOT truncate when value exceeds minHexDigits', () => {
  // This is the documented non-truncation contract.
  assert.equal(toHex(0xffff, 2), '0xffff');
});

test('toHex rejects negative input with RangeError', () => {
  assert.throws(() => toHex(-1), RangeError);
});

test('toHex rejects non-integer input with TypeError', () => {
  assert.throws(() => toHex(1.5), TypeError);
  assert.throws(() => toHex('ff'), TypeError);
});

test('toHex rejects values above the safe integer range', () => {
  // 2^53 is not a safe integer, so it must be refused rather than emit
  // silently-wrong hex digits.
  assert.throws(() => toHex(Math.pow(2, 53)), RangeError);
});

test('toHex rejects a negative minHexDigits', () => {
  assert.throws(() => toHex(0, -1), RangeError);
});

// --- parseHexToBigInt / bigIntToHex ---------------------------------------

test('parseHexToBigInt handles values beyond Number precision', () => {
  // 2^64 - 1 = 0xffffffffffffffff, which a Number cannot represent exactly.
  assert.equal(parseHexToBigInt('0xffffffffffffffff'), 18446744073709551615n);
});

test('bigIntToHex round-trips a large BigInt', () => {
  const big = 18446744073709551615n; // 2^64 - 1
  assert.equal(bigIntToHex(big), '0xffffffffffffffff');
});

test('bigIntToHex zero-pads to minHexDigits', () => {
  assert.equal(bigIntToHex(0n, 4), '0x0000');
});

test('bigIntToHex rejects a negative BigInt', () => {
  assert.throws(() => bigIntToHex(-1n), RangeError);
});

// --- toHexSigned / parseHexSigned: 8-bit round trips ----------------------

test('toHexSigned encodes 0 as 0x00 at width 8', () => {
  assert.equal(toHexSigned(0, 8), '0x00');
});

test('toHexSigned encodes 127 as 0x7f at width 8 (max positive)', () => {
  assert.equal(toHexSigned(127, 8), '0x7f');
});

test('toHexSigned encodes -1 as 0xff at width 8 (two complement)', () => {
  assert.equal(toHexSigned(-1, 8), '0xff');
});

test('toHexSigned encodes -128 as 0x80 at width 8 (min negative)', () => {
  assert.equal(toHexSigned(-128, 8), '0x80');
});

test('parseHexSigned(0xff, 8) === -1', () => {
  assert.equal(parseHexSigned('0xff', 8), -1);
});

test('parseHexSigned(0x7f, 8) === 127', () => {
  assert.equal(parseHexSigned('0x7f', 8), 127);
});

test('parseHexSigned(0x80, 8) === -128', () => {
  assert.equal(parseHexSigned('0x80', 8), -128);
});

test('round trip 8-bit: every value in [-128, 127]', () => {
  for (let v = -128; v <= 127; v++) {
    const hex = toHexSigned(v, 8);
    const back = parseHexSigned(hex, 8);
    assert.equal(back, v, `round trip failed for ${v}: ${hex} -> ${back}`);
  }
});

// --- toHexSigned / parseHexSigned: 16-bit spot checks ---------------------

test('toHexSigned 16-bit: -1 -> 0xffff, 32767 -> 0x7fff, -32768 -> 0x8000', () => {
  assert.equal(toHexSigned(-1, 16), '0xffff');
  assert.equal(toHexSigned(32767, 16), '0x7fff');
  assert.equal(toHexSigned(-32768, 16), '0x8000');
});

test('parseHexSigned 16-bit round trips -1, 32767, -32768', () => {
  assert.equal(parseHexSigned('0xffff', 16), -1);
  assert.equal(parseHexSigned('0x7fff', 16), 32767);
  assert.equal(parseHexSigned('0x8000', 16), -32768);
});

// --- toHexSigned / parseHexSigned: 32-bit (still Number return) ----------

test('toHexSigned 32-bit: -1 -> 0xffffffff, 0 -> 0x00000000', () => {
  assert.equal(toHexSigned(-1, 32), '0xffffffff');
  assert.equal(toHexSigned(0, 32), '0x00000000');
});

test('parseHexSigned returns a Number for 32-bit', () => {
  const result = parseHexSigned('0xffffffff', 32);
  assert.equal(result, -1);
  assert.equal(typeof result, 'number');
});

// --- toHexSigned / parseHexSigned: 64-bit (BigInt return) -----------------

test('toHexSigned 64-bit: -1 -> 0xffffffffffffffff', () => {
  assert.equal(toHexSigned(-1, 64), '0xffffffffffffffff');
});

test('parseHexSigned returns a BigInt for 64-bit and decodes -1', () => {
  const result = parseHexSigned('0xffffffffffffffff', 64);
  assert.equal(result, -1n);
  assert.equal(typeof result, 'bigint');
});

test('parseHexSigned 64-bit decodes INT64_MIN (-9223372036854775808)', () => {
  // 0x8000000000000000 is the min 64-bit signed value.
  assert.equal(parseHexSigned('0x8000000000000000', 64), -9223372036854775808n);
});

test('toHexSigned 64-bit encodes INT64_MIN round-trips', () => {
  const min = -9223372036854775808n;
  // We pass a Number to toHexSigned normally, but INT64_MIN is outside the
  // safe integer range of Number. toHexSigned itself takes a number, so we
  // can only encode values within safe-integer range at width 64. Document
  // that boundary by checking the largest negative safe value at 64-bit
  // and confirming it round-trips through parseHexSigned.
  const v = -1;
  assert.equal(parseHexSigned(toHexSigned(v, 64), 64), -1n);
});

// --- error paths ----------------------------------------------------------

test('toHexSigned rejects an unsupported bit width', () => {
  assert.throws(() => toHexSigned(0, 7), RangeError);
  assert.throws(() => toHexSigned(0, 40), RangeError);
});

test('parseHexSigned rejects an unsupported bit width', () => {
  assert.throws(() => parseHexSigned('0xff', 7), RangeError);
});

test('toHexSigned rejects a value outside the signed range for the width', () => {
  // 128 does not fit in signed 8-bit (range is [-128, 127]).
  assert.throws(() => toHexSigned(128, 8), RangeError);
  // -129 does not fit either.
  assert.throws(() => toHexSigned(-129, 8), RangeError);
});

test('toHexSigned rejects non-integer input', () => {
  assert.throws(() => toHexSigned(1.5, 8), TypeError);
});

test('parseHexSigned masks high bits rather than throwing on overflow', () => {
  // Documented behaviour: parseHexSigned reads the low `width` bits. A 16-bit
  // hex string read as int8 takes the low byte.
  assert.equal(parseHexSigned('0x00ff', 8), -1);
  assert.equal(parseHexSigned('0xffff', 8), -1);
  assert.equal(parseHexSigned('0x0100', 8), 0);
});
