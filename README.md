# int-hex-string

Converts unsigned integers to and from hexadecimal strings, with a separate
signed path that does fixed-width two's-complement encoding and decoding.

## Usage

```js
import { toHex, parseHex, toHexSigned, parseHexSigned } from 'int-hex-string';

toHex(255);              // '0xff'
toHex(255, 4);          // '0x00ff'
parseHex('0xff');       // 255
parseHex('ff');          // 255 (prefix optional on input)

toHexSigned(-1, 8);             // '0xff'
toHexSigned(127, 8);            // '0x7f'
parseHexSigned('0xff', 8);      // -1
parseHexSigned('0xffffffff', 32); // -1 (returns Number for widths <= 32)
parseHexSigned('0xffffffffffffffff', 64); // -1n (returns BigInt for widths > 32)
```

For values beyond JavaScript's safe-integer range (above 2^53 - 1), use the
BigInt exports:

```js
import { parseHexToBigInt, bigIntToHex } from 'int-hex-string';
parseHexToBigInt('0xffffffffffffffff'); // 18446744073709551615n
bigIntToHex(18446744073709551615n);     // '0xffffffffffffffff'
```

## Exported names

- `parseHex(hex: string): number`
- `toHex(value: number, minHexDigits?: number): string`
- `parseHexToBigInt(hex: string): bigint`
- `bigIntToHex(value: bigint, minHexDigits?: number): string`
- `toHexSigned(value: number, width: number): string`
- `parseHexSigned(hex: string, width: number): number | bigint`

## Why this exists

The thing this library actually solves is the signed case. Converting an
unsigned integer to hex is a one-liner in any language; the awkward part is
two's-complement at a chosen bit width, where the same hex digits mean
different things depending on width (`0xff` is 255 unsigned, -1 as int8, 255
as int16) and where widths above 32 bits exceed what JavaScript's bitwise
operators can handle.

The trade-off: `parseHexSigned` returns a `number` for widths up to 32 and a
`bigint` for wider widths. A uniform return type would mean either losing
precision on 64-bit+ values or forcing every 8-bit decode through BigInt. The
split is explicit and documented; callers know the width they asked for.

`toHexSigned` takes a `number`, which caps its input range at the safe-integer
limit (2^53 - 1). Encoding an arbitrary 64-bit value from a number is not
supported because a number cannot represent one faithfully. Use `bigIntToHex`
with a pre-masked BigInt if you need that.

## Edges you will hit

- **`0x` prefix is optional on input, always present on output.** This is
  deliberate; if your pipeline emits bare hex, prepend nothing and slice the
  `0x` off the output yourself.
- **`toHex` does not truncate.** If you ask for `toHex(0xffff, 2)` you get
  `'0xffff'`, not `'0xff'`. Padding is a minimum, not a fixed width.
- **`parseHexSigned` masks, it does not validate length.** Reading `0xffff`
as int8 takes the low byte and yields `-1`. This is so a 32-bit field can be
read as int8 by the caller without the library throwing. Detect overflow
upstream if you need to.
- **`toHexSigned` refuses values outside the signed range for the width.**
  `toHexSigned(128, 8)` throws `RangeError`. It does not silently wrap.
- **Supported signed widths are 8, 16, 24, 32, 48, 64, 96, 128.** Other widths
  throw. The set is deliberately small to avoid implying semantic correctness
  for widths nobody uses in practice.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

