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
          const decoder = new TextDecoder("shift-jis");
          const decoded = decoder.decode(new Uint8Array([byte1, byte2]));

          // Replace the decoded character if it's a replacement character
          if (decoded === "�") {
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

  // Determine if a byte is printable ASCII
  const isPrintableAscii = (b: number) => b >= 0x20 && b <= 0x7E;

  // Determine if a Unicode code point is printable
  const isPrintableCodePoint = (cp: number) => {
    // Control characters
    if (cp <= 0x1F || (cp >= 0x7F && cp <= 0x9F)) return false;
    // Surrogate pairs
    if (0xD800 <= cp && cp <= 0xDFFF) return false;
    // Replacement character
    if (cp === 0xFFFD) return false;
    // Out of Unicode range
    if (cp > 0x10FFFF) return false;
    return true;
  };

  while (i < buf.length) {
    const b0 = buf[i];

    // Handle ASCII fast path (1-byte sequences)
    if (b0 < 0x80) {
      out.push(isPrintableAscii(b0) ? String.fromCharCode(b0) : ".");
      i += 1;
      continue;
    }

    // Determine UTF-8 sequence length
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
      // Invalid UTF-8 leading byte
      out.push(".");
      i += 1;
      continue;
    }

    // Ensure enough bytes are available for this sequence
    if (i + expectedLen > buf.length) {
      // If incomplete, treat as error and skip just the leading byte
      out.push(".");
      i += 1;
      continue;
    }

    // Validate UTF-8 continuation bytes and decode the code point
    let valid = true;
    for (let j = 1; j < expectedLen; j++) {
      const cb = buf[i + j];
      if ((cb & 0b1100_0000) !== 0b1000_0000) { // Invalid continuation byte
        valid = false;
        break;
      }
      cp = (cp << 6) | (cb & 0x3F);
    }

    // Validate code point ranges
    if (
      !valid ||
      (expectedLen === 2 && cp < 0x80) || // Overlong 2-byte sequence
      (expectedLen === 3 && cp < 0x800) || // Overlong 3-byte sequence
      (expectedLen === 4 && cp < 0x10000) || // Overlong 4-byte sequence
      cp > 0x10FFFF // Out of valid code point range
    ) {
      // Invalid sequence: output "." for each byte in invalid sequence
      for (let k = 0; k < expectedLen; k++) {
        out.push(".");
      }
      i += expectedLen;
      continue;
    }

    // Append printable character or replace with "."
    if (isPrintableCodePoint(cp)) {
      out.push(String.fromCodePoint(cp));
    } else {
      // If non-printable, append "." for sequence length
      for (let k = 0; k < expectedLen; k++) {
        out.push(".");
      }
    }

    // Advance by sequence length
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
