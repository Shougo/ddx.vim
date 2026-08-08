import { assertEquals } from "@std/assert";
import EncodingLib from "@encoding-japanese";

const CP932_LABELS = [
  "windows-31j",
  "cp932",
  "shift_jis",
  "shift-jis",
  "sjis",
];

function getCp932Decoder(): TextDecoder {
  for (const label of CP932_LABELS) {
    try {
      // Per WHATWG Encoding specification, TextDecoder will throw for unknown
      // labels. Use non-fatal (default) mode so invalid sequences become
      // U+FFFD.
      return new TextDecoder(label);
    } catch (_e) {
      // try next label
    }
  }
  // Fallback to default decoder (UTF-8) if none available.
  // This will likely produce incorrect results for CP932 input, but avoids
  // throwing.
  return new TextDecoder();
}

// Memoized CP932 decoder: constructed once, reused for every multibyte pair.
// TextDecoder.decode() without the `stream` option resets any internal state
// after each call, so reusing the instance is safe in a single-threaded
// JavaScript runtime (Deno does not share module-scope state across Workers).
const CP932_DECODER = getCp932Decoder();

export function bytesToCP932(buf: Uint8Array): string {
  const out: string[] = [];
  let i = 0;

  // Check if a byte is printable ASCII
  const isPrintableAscii = (b: number) => b >= 0x20 && b <= 0x7E;

  // Check if two bytes represent a valid CP932 multibyte sequence
  const isValidShiftJisMultibyte = (byte1: number, byte2: number): boolean => {
    return (
      (0x81 <= byte1 && byte1 <= 0x9F && 0x40 <= byte2 && byte2 <= 0xFC &&
        byte2 !== 0x7F) ||
      (0xE0 <= byte1 && byte1 <= 0xEF && 0x40 <= byte2 && byte2 <= 0xFC &&
        byte2 !== 0x7F)
    );
  };

  // Process each byte or pair of bytes in the input buffer
  while (i < buf.length) {
    const byte1 = buf[i];

    // Handle printable ASCII characters
    if (byte1 < 0x80) {
      out.push(isPrintableAscii(byte1) ? String.fromCharCode(byte1) : ".");
      i++;
      continue;
    }

    // Handle potential 2-byte sequences
    if (i + 1 < buf.length) { // Ensure there are 2 bytes to process
      const byte2 = buf[i + 1];

      if (isValidShiftJisMultibyte(byte1, byte2)) {
        try {
          const decoded = CP932_DECODER.decode(new Uint8Array([byte1, byte2]));

          // Replace the decoded character if it's a replacement character
          if (decoded.includes("�")) {
            out.push("..");
          } else {
            out.push(decoded);
          }
        } catch {
          // If decoding fails, replace with ".."
          out.push("..");
        }
        i += 2;
        continue;
      }
    }

    // Replace single invalid byte with "."
    out.push(".");
    i++;
  }

  return out.join("");
}

export function bytesToUTF8(buf: Uint8Array): string {
  const out: string[] = [];
  let i = 0;

  // Set of specific invisible Unicode characters to replace with "."
  const invisibleUnicode = new Set([
    0x180E,
    0x200B,
    0x200C,
    0x200D,
    0x200E,
    0x200F,
    0xFEFF,
  ]);

  const isPrintableAscii = (b: number) => b >= 0x20 && b <= 0x7E;

  const isPrintableCodePoint = (cp: number) => {
    if (cp <= 0x1F || (cp >= 0x7F && cp <= 0x9F)) return false;
    if (0xD800 <= cp && cp <= 0xDFFF) return false; // surrogate area
    if (cp === 0xFFFD) return false;
    if (cp > 0x10FFFF) return false;
    if (invisibleUnicode.has(cp)) return false;
    // Exclude U+E0100..U+E010F (Variation Selectors Supplement)
    if (cp >= 0xE0100 && cp <= 0xE010F) return false;
    return true;
  };

  while (i < buf.length) {
    const b0 = buf[i];

    // ASCII fast path
    if (b0 < 0x80) {
      out.push(isPrintableAscii(b0) ? String.fromCharCode(b0) : ".");
      i++;
      continue;
    }

    // Determine sequence length and per-RFC constraints
    let expectedLen = 0;
    let cp = 0;
    let minSecond: number | undefined;
    let maxSecond: number | undefined;

    if (b0 >= 0xC2 && b0 <= 0xDF) {
      expectedLen = 2;
      cp = b0 & 0x1F;
    } else if (b0 === 0xE0) {
      expectedLen = 3;
      cp = b0 & 0x0F;
      minSecond = 0xA0;
    } else if (b0 >= 0xE1 && b0 <= 0xEC) {
      expectedLen = 3;
      cp = b0 & 0x0F;
      minSecond = 0x80;
    } else if (b0 === 0xED) {
      expectedLen = 3;
      cp = b0 & 0x0F;
      maxSecond = 0x9F;
    } else if (b0 >= 0xEE && b0 <= 0xEF) {
      expectedLen = 3;
      cp = b0 & 0x0F;
      minSecond = 0x80;
    } else if (b0 === 0xF0) {
      expectedLen = 4;
      cp = b0 & 0x07;
      minSecond = 0x90;
    } else if (b0 >= 0xF1 && b0 <= 0xF3) {
      expectedLen = 4;
      cp = b0 & 0x07;
      minSecond = 0x80;
    } else if (b0 === 0xF4) {
      expectedLen = 4;
      cp = b0 & 0x07;
      maxSecond = 0x8F;
    } else {
      // invalid leading byte (includes 0xC0/0xC1, 0xF5..0xFF, etc.)
      out.push(".");
      i++;
      continue;
    }

    // Not enough bytes for full sequence -> treat remaining bytes as invalid
    if (i + expectedLen > buf.length) {
      const remaining = buf.length - i;
      for (let k = 0; k < remaining; k++) out.push(".");
      break;
    }

    // Validate continuation bytes and second-byte constraints
    let valid = true;
    for (let j = 1; j < expectedLen; j++) {
      const cb = buf[i + j];
      if ((cb & 0xC0) !== 0x80) {
        valid = false;
        break;
      }
      if (j === 1) {
        if (minSecond !== undefined && cb < minSecond) {
          valid = false;
          break;
        }
        if (maxSecond !== undefined && cb > maxSecond) {
          valid = false;
          break;
        }
      }
      cp = (cp << 6) | (cb & 0x3F);
    }

    if (!valid) {
      // Sequence invalid -> emit '.' for each byte in the sequence and consume them
      for (let j = 0; j < expectedLen; j++) out.push(".");
      i += expectedLen;
      continue;
    }

    // Overlong / out-of-range checks
    if (
      (expectedLen === 2 && cp < 0x80) ||
      (expectedLen === 3 && cp < 0x800) ||
      (expectedLen === 4 && cp < 0x10000) ||
      cp > 0x10FFFF
    ) {
      for (let j = 0; j < expectedLen; j++) out.push(".");
      i += expectedLen;
      continue;
    }

    // Valid code point: if printable, append the character once; otherwise '.' per byte
    if (isPrintableCodePoint(cp)) {
      out.push(String.fromCodePoint(cp));
    } else {
      for (let j = 0; j < expectedLen; j++) out.push(".");
    }

    i += expectedLen;
  }

  return out.join("");
}

const enc = new TextEncoder();

const encodeCP932 = (s: string) => {
  const arr = EncodingLib.convert(s, {
    from: "UNICODE",
    to: "SJIS",
    type: "array",
  }) as number[];
  return Uint8Array.from(arr);
};

Deno.test("cp932 ascii printable", () => {
  const bytes = encodeCP932("Hello, world!");
  assertEquals(bytesToCP932(bytes), "Hello, world!");
});

Deno.test("cp932 ascii control bytes become dots", () => {
  const bytes = new Uint8Array([0x00, 0x1f, 0x7f]);
  assertEquals(bytesToCP932(bytes), "...");
});

Deno.test("cp932 mixed ascii and control", () => {
  const bytes = new Uint8Array([0x41, 0x00, 0x42]); // "A", NUL, "B"
  assertEquals(bytesToCP932(bytes), "A.B");
});

Deno.test("cp932 japanese string decoding", () => {
  const s = "こんにちは"; // CP932対応の日本語文字列
  const bytes = encodeCP932(s);
  assertEquals(bytesToCP932(bytes), s);
});

Deno.test("cp932 invalid/incomplete multibyte sequences", () => {
  // トリミングされたマルチバイトシーケンス
  const bytes = new Uint8Array([0x81]); // incomplete CP932
  assertEquals(bytesToCP932(bytes), ".");
});

Deno.test("cp932 overlong sequence treated as invalid", () => {
  const bytes = new Uint8Array([0xC0, 0x81]);
  assertEquals(bytesToCP932(bytes), "..");
});

Deno.test("cp932 mixed multibyte and ascii", () => {
  const s = "AあB"; // 'あ' is CP932
  const bytes = encodeCP932(s);
  assertEquals(bytesToCP932(bytes), s);
});

Deno.test("cp932 invalid bytes sequence", () => {
  const bytes = new Uint8Array([0x89, 0xc2, 0x83, 0xe2]);
  assertEquals(bytesToCP932(bytes), "可..");
});

Deno.test("cp932 invalid bytes sequence2", () => {
  const bytes = new Uint8Array([0xc2, 0x92, 0x04, 0x00]);
  assertEquals(bytesToCP932(bytes), "....");
});

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

Deno.test("invalid bytes sequence", () => {
  const bytes = new Uint8Array([0x89, 0xc2, 0x83, 0xe2]);
  assertEquals(bytesToUTF8(bytes), "....");
});

Deno.test("invalid bytes sequence2", () => {
  const bytes = new Uint8Array([0xc2, 0x92, 0x04, 0x00]);
  assertEquals(bytesToUTF8(bytes), "....");
});

Deno.test("handle special invisible Unicode characters", () => {
  const bytes = new Uint8Array([
    0xE2,
    0x80,
    0x8B, // U+200B
    0xE2,
    0x80,
    0x8C, // U+200C
    0xE2,
    0x80,
    0x8D, // U+200D
    0xEF,
    0xBB,
    0xBF, // U+FEFF
  ]);

  assertEquals(bytesToUTF8(bytes), "............");
});
