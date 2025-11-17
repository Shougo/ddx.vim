import { assertEquals } from "@std/assert";

const CP932_LABELS = [
  "windows-31j", // recommended label
  "cp932",
  "shift_jis",
  "shift-jis",
  "sjis",
];

function getCp932Decoder(): TextDecoder {
  for (const label of CP932_LABELS) {
    try {
      // Per WHATWG Encoding specification, TextDecoder will throw for unknown labels.
      // Use non-fatal (default) mode so invalid sequences become U+FFFD.
      return new TextDecoder(label);
    } catch (_e) {
      // try next label
    }
  }
  // Fallback to default decoder (UTF-8) if none available.
  // This will likely produce incorrect results for CP932 input, but avoids throwing.
  return new TextDecoder();
}

export function bytesToCP932(buf: Uint8Array): string {
  const decoder = getCp932Decoder();
  const decoded = decoder.decode(buf); // decode whole buffer; invalid sequences -> U+FFFD

  const out: string[] = [];

  const isPrintableAscii = (cp: number) => cp >= 0x20 && cp <= 0x7E;
  const isPrintableCodePoint = (cp: number) => {
    if (cp <= 0x1F) return false;
    if (cp === 0x7F) return false;
    // Surrogate halves are invalid in Unicode scalar values
    if (0xD800 <= cp && cp <= 0xDFFF) return false;
    // U+FFFD replacement character: treat as not printable here
    if (cp === 0xFFFD) return false;
    // Restrict to Unicode valid range
    if (cp > 0x10FFFF) return false;
    return true;
  };

  // Iterate by Unicode characters (for..of yields full code points)
  for (const ch of decoded) {
    const cp = ch.codePointAt(0) ?? 0;
    if (isPrintableAscii(cp)) {
      out.push(ch);
    } else if (isPrintableCodePoint(cp)) {
      out.push(ch);
    } else {
      out.push(".");
    }
  }

  return out.join("");
}

export function bytesToUTF8(buf: Uint8Array): string {
  const out: string[] = [];
  let i = 0;

  const isPrintableAscii = (b: number) => b >= 0x20 && b <= 0x7E;
  const isPrintableCodePoint = (cp: number) => {
    if (cp <= 0x1F) return false;
    if (cp === 0x7F) return false;
    // Surrogate halves are invalid in Unicode scalar values
    if (0xD800 <= cp && cp <= 0xDFFF) return false;
    // U+FFFD replacement character: treat as not printable here
    if (cp === 0xFFFD) return false;
    // Restrict to Unicode valid range
    if (cp > 0x10FFFF) return false;
    return true;
  };

  while (i < buf.length) {
    const b0 = buf[i];

    // ASCII fast path (single byte)
    if (b0 < 0x80) {
      out.push(isPrintableAscii(b0) ? String.fromCharCode(b0) : ".");
      i += 1;
      continue;
    }

    // Determine expected length from leading byte
    let expectedLen = 0;
    let cp = 0;

    if ((b0 & 0b1110_0000) === 0b1100_0000) {
      expectedLen = 2;
      cp = b0 & 0x1F;
    } else if ((b0 & 0b1111_0000) === 0b1110_0000) {
      expectedLen = 3;
      cp = b0 & 0x0F;
    } else if ((b0 & 0b1111_1000) === 0b1111_0000) {
      expectedLen = 4;
      cp = b0 & 0x07;
    } else {
      // Invalid leading byte (including continuation bytes 0x80..0xBF)
      out.push(".");
      i += 1;
      continue;
    }

    // Not enough bytes left -> treat as invalid (emit '.' and advance by 1)
    if (i + expectedLen > buf.length) {
      out.push(".");
      i += 1;
      continue;
    }

    // Validate continuation bytes and build code point
    let valid = true;
    for (let k = 1; k < expectedLen; k++) {
      const cb = buf[i + k];
      if ((cb & 0b1100_0000) !== 0b1000_0000) {
        valid = false;
        break;
      }
      cp = (cp << 6) | (cb & 0x3F);
    }

    // Reject overlong encodings, surrogates, out-of-range code points
    if (valid) {
      if (
        (expectedLen === 2 && cp < 0x80) ||
        (expectedLen === 3 && cp < 0x800) ||
        (expectedLen === 4 && cp < 0x10000) ||
        (0xD800 <= cp && cp <= 0xDFFF) ||
        cp > 0x10FFFF
      ) {
        valid = false;
      }
    }

    if (!valid) {
      out.push(".");
      i += 1; // resynchronize by one byte
      continue;
    }

    // Valid code point: push printable or '.' otherwise
    if (isPrintableCodePoint(cp)) {
      out.push(String.fromCodePoint(cp));
    } else {
      out.push(".");
    }

    i += expectedLen;
  }

  return out.join("");
}

const enc = new TextEncoder();

Deno.test("ascii printable", () => {
  const bytes = enc.encode("Hello, world!");
  assertEquals(bytesToUTF8(bytes), "Hello, world!");
});

Deno.test("ascii control bytes become dots", () => {
  const bytes = new Uint8Array([0x00, 0x1f, 0x7f]);
  assertEquals(bytesToUTF8(bytes), "...");
});

Deno.test("mixed ascii and control", () => {
  const bytes = new Uint8Array([0x41, 0x00, 0x42]); // "A", NUL, "B"
  assertEquals(bytesToUTF8(bytes), "A.B");
});

Deno.test("japanese utf8 decoding", () => {
  const s = "こんにちは";
  const bytes = enc.encode(s);
  assertEquals(bytesToUTF8(bytes), s);
});

Deno.test("invalid/incomplete multibyte sequences", () => {
  // Start of a 3-byte sequence but truncated
  const bytes = new Uint8Array([0xE3, 0x81]); // incomplete
  assertEquals(bytesToUTF8(bytes), "..");
});

Deno.test("overlong sequence treated as invalid", () => {
  // Overlong encoding of U+0001 (invalid)
  const bytes = new Uint8Array([0xC0, 0x81]);
  assertEquals(bytesToUTF8(bytes), "..");
});

Deno.test("mixed multibyte and ascii", () => {
  const s = "AあB"; // 'あ' is U+3042
  const bytes = enc.encode(s);
  assertEquals(bytesToUTF8(bytes), s);
});
