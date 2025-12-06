import { assertEquals } from "@std/assert";
import { bytesToCP932, bytesToUTF8 } from "./decoder.ts";

type OperationHistory =
  | ChangeHistory
  | ChangeBytesHistory
  | InsertHistory
  | RemoveHistory;

type ChangeHistory = {
  operation: "change";
  address: number;
  oldValue: number;
  newValue: number;
};

type ChangeBytesHistory = {
  operation: "changeBytes";
  address: number;
  oldValue: Uint8Array;
  newValue: Uint8Array;
};

type InsertHistory = {
  operation: "insert";
  address: number;
  newValue: Uint8Array;
};

type RemoveHistory = {
  operation: "remove";
  address: number;
  oldValue: number;
};

export type ExtractedString = {
  text: string;
  offset: number;
  encoding: string;
};

export class DdxBuffer {
  #file: Deno.FsFile | undefined = undefined;
  #offset: number = 0;
  #path: string = "";
  #bytes: Uint8Array = new Uint8Array();

  #changedAdresses: Set<number> = new Set<number>();
  #histories: OperationHistory[] = [];
  #undoHistories: OperationHistory[] = [];

  async open(path: string, offset: number = 0, length: number = 0) {
    if (!(await exists(path))) {
      return;
    }

    this.#file = await Deno.open(path, { read: true });
    this.#offset = offset;
    this.#path = path;

    const stat = await Deno.stat(path);
    const fileLength = stat.size;

    if (length === 0 || offset + length > fileLength) {
      length = fileLength - offset;
    }

    if (length <= 0 || offset >= fileLength) {
      this.#bytes = new Uint8Array();
      return;
    }

    await this.#file.seek(offset, Deno.SeekMode.Start);

    const buf = new Uint8Array(length);
    const bytesRead = await this.#file.read(buf);

    this.#bytes = buf.subarray(0, bytesRead ?? 0);

    this.#changedAdresses.clear();
    this.#histories = [];
    this.#undoHistories = [];
  }

  insert(pos: number, bytes: Uint8Array) {
    this.#histories.push({
      operation: "insert",
      address: pos,
      newValue: bytes,
    });
    this.#undoHistories = [];
    this.#changedAdresses.clear();

    // NOTE: mark all addresses from pos .. pos + bytes.length - 1 as changed
    for (let i = 0; i < bytes.length; i++) {
      this.#changedAdresses.add(pos + i);
    }

    this.#insert(pos, bytes);
  }
  #insert(pos: number, bytes: Uint8Array) {
    if (pos < 0 || pos > this.#bytes.length) {
      throw new RangeError("Position out of range");
    }

    const before = this.#bytes.subarray(0, pos);
    const after = this.#bytes.subarray(pos);

    const newBytes = new Uint8Array(
      before.length + bytes.length + after.length,
    );
    newBytes.set(before, 0);
    newBytes.set(bytes, before.length);
    newBytes.set(after, before.length + bytes.length);

    this.#bytes = newBytes;
  }

  change(pos: number, value: number) {
    this.#histories.push({
      operation: "change",
      address: pos,
      oldValue: this.getByte(pos) ?? -1,
      newValue: value,
    });
    this.#undoHistories = [];

    this.#changedAdresses.add(pos);

    this.#change(pos, value);
  }
  #change(pos: number, value: number) {
    if (pos < 0 || pos > this.#bytes.length) {
      throw new RangeError("Position out of range");
    }

    this.#bytes[pos] = value;
  }

  changeBytes(pos: number, bytes: Uint8Array) {
    this.#histories.push({
      operation: "changeBytes",
      address: pos,
      oldValue: this.getBytes(pos, bytes.length),
      newValue: bytes,
    });
    this.#undoHistories = [];

    // NOTE: mark all addresses from pos .. pos + bytes.length - 1 as changed
    for (let i = 0; i < bytes.length; i++) {
      this.#changedAdresses.add(pos + i);
    }

    this.#changeBytes(pos, bytes);
  }
  #changeBytes(pos: number, bytes: Uint8Array) {
    if (pos < 0 || pos > this.#bytes.length) {
      throw new RangeError("Position out of range");
    }
    if (bytes.length === 0) {
      return;
    }

    const end = pos + bytes.length;
    if (end <= this.#bytes.length) {
      // Fits in existing buffer: overwrite in-place.
      this.#bytes.set(bytes, pos);
    } else {
      // Need to extend the buffer.
      const newBuf = new Uint8Array(end);
      if (pos > 0) {
        newBuf.set(this.#bytes.subarray(0, pos), 0);
      }
      newBuf.set(bytes, pos);
      this.#bytes = newBuf;
    }
  }

  remove(pos: number, length: number = 1) {
    this.#histories.push({
      operation: "remove",
      address: pos,
      oldValue: this.getByte(pos) ?? -1,
    });
    this.#undoHistories = [];
    this.#changedAdresses.clear();

    this.#remove(pos, length);
  }
  #remove(pos: number, length: number = 1) {
    if (pos < 0 || pos + length > this.#bytes.length) {
      throw new RangeError("Position out of range");
    }

    const newBytes = new Uint8Array(this.#bytes.length - length);
    newBytes.set(this.#bytes.subarray(0, pos));
    newBytes.set(this.#bytes.subarray(pos + length), pos);

    this.#bytes = newBytes;
  }

  async write(path: string = "") {
    if (path.length === 0) {
      path = this.#path;
    }

    const file = await Deno.open(path, { write: true, create: true });

    await file.seek(this.#offset ?? 0, Deno.SeekMode.Start);

    await file.write(this.#bytes);

    file.close();
  }

  redo(): number {
    const history = this.#undoHistories.pop();
    if (!history) {
      return this.#undoHistories.length;
    }

    this.#undoOperation(
      this.#histories,
      history,
    );

    return this.#undoHistories.length;
  }

  undo(): number {
    const history = this.#histories.pop();
    if (!history) {
      return this.#histories.length;
    }

    this.#undoOperation(
      this.#undoHistories,
      history,
    );

    return this.#histories.length;
  }

  #undoOperation(
    histories: OperationHistory[],
    history: OperationHistory,
  ) {
    switch (history.operation) {
      case "change":
        histories.push({
          operation: "change",
          address: history.address,
          oldValue: this.getByte(history.address) ?? -1,
          newValue: history.oldValue,
        });

        this.#changedAdresses.delete(history.address);

        this.#change(history.address, history.oldValue);

        break;
      case "changeBytes":
        histories.push({
          operation: "changeBytes",
          address: history.address,
          oldValue: history.newValue,
          newValue: history.oldValue,
        });

        for (let i = 0; i < history.oldValue.length; i++) {
          this.#changedAdresses.delete(history.address + i);
        }

        this.#changeBytes(history.address, history.oldValue);

        break;
      case "insert":
        histories.push({
          operation: "remove",
          address: history.address,
          oldValue: this.getByte(history.address) ?? -1,
        });

        this.#remove(history.address, history.newValue.length);

        break;
      case "remove":
        histories.push({
          operation: "insert",
          address: history.address,
          newValue: Uint8Array.from([history.oldValue]),
        });

        this.#insert(
          history.address,
          Uint8Array.from([history.oldValue]),
        );

        break;
    }
  }

  search(pos: number, bytes: Uint8Array): number {
    // Empty pattern -> treat as found at pos if within buffer range
    if (bytes.length === 0) {
      if (pos < this.#offset) return this.#offset;
      if (pos >= this.#offset + this.#bytes.length) return -1;
      return pos;
    }

    const hay = this.#bytes;
    const pat = bytes;
    const n = hay.length;
    const m = pat.length;

    if (n === 0 || pos >= this.#offset + n) {
      return -1;
    }

    // start index inside buffer (clamp to 0)
    let startIndex = pos - this.#offset;
    if (startIndex < 0) startIndex = 0;

    // If pattern is single byte, use a simple loop (fast path)
    if (m === 1) {
      const v = pat[0];
      for (let i = startIndex; i < n; i++) {
        if (hay[i] === v) return this.#offset + i;
      }
      return -1;
    }

    // Boyer-Moore-Horspool preprocessing
    const skip = new Uint32Array(256);
    skip.fill(m);
    for (let i = 0; i < m - 1; i++) {
      skip[pat[i]] = m - i - 1;
    }

    let i = startIndex;
    const last = m - 1;
    while (i <= n - m) {
      let j = last;
      // compare from end of pattern
      while (j >= 0 && hay[i + j] === pat[j]) {
        j--;
      }
      if (j < 0) {
        return this.#offset + i; // match found
      }
      const skipVal = skip[hay[i + last]];
      // ensure at least one step forward
      i += skipVal > 0 ? skipVal : 1;
    }

    return -1;
  }

  /**
   * Extract readable strings from the underlying byte buffer and return them
   * together with their byte offsets so callers can jump to the location
   * later.
   *
   * Supported encodings:
   * - "ascii"
   * - "utf8" / "utf-8"
   * - "utf16le" / "utf-16le"
   * - "utf16be" / "utf-16be"
   *
   * Returns an array of { text, offset } in the order they appear.
   *
   * @param encoding Encoding name
   * @param minLen Minimum number of printable characters to accept as a string
   * (default 4)
   */
  searchStrings(encoding: string, minLen = 4): ExtractedString[] {
    const enc = (encoding || "utf-8").toLowerCase();
    switch (enc) {
      case "ascii":
        return this.#searchAscii(minLen);
      case "utf8":
      case "utf-8":
        return this.#searchUtf8(minLen);
      case "utf16le":
      case "utf-16le":
        return this.#searchUtf16(false, minLen);
      case "utf16be":
      case "utf-16be":
        return this.#searchUtf16(true, minLen);
      default:
        throw new Error(`Unsupported encoding "${encoding}".`);
    }
  }

  #decodeNonFatal(buf: Uint8Array, label: string): string {
    try {
      return new TextDecoder(label, { fatal: false }).decode(buf);
    } catch {
      return new TextDecoder("utf-8", { fatal: false }).decode(buf);
    }
  }

  #tryDecodeFatal(buf: Uint8Array, label: string): string | null {
    try {
      return new TextDecoder(label, { fatal: true }).decode(buf);
    } catch {
      return null;
    }
  }

  #isAsciiPrintable(b: number): boolean {
    return (b >= 0x20 && b <= 0x7e) || b === 0x09 || b === 0x0a || b === 0x0d;
  }

  #searchAscii(minLen: number): ExtractedString[] {
    const out: ExtractedString[] = [];
    const bytes = this.#bytes;
    const n = bytes.length;
    if (n === 0) return out;

    let i = 0;
    while (i < n) {
      while (i < n && !this.#isAsciiPrintable(bytes[i])) i++;
      if (i >= n) break;
      const start = i;
      while (i < n && this.#isAsciiPrintable(bytes[i])) i++;
      const len = i - start;
      if (len >= minLen) {
        const slice = bytes.subarray(start, i);
        const s = this.#decodeNonFatal(slice, "utf-8");
        out.push({
          text: s,
          offset: start,
          encoding: "utf-8",
        });
      }
    }
    return out;
  }

  #searchUtf8(minLen: number): ExtractedString[] {
    const out: ExtractedString[] = [];
    const bytes = this.#bytes;
    const n = bytes.length;
    if (n === 0) return out;

    const isUtf8Start = (b: number) => !(b >= 0x80 && b <= 0xbf);
    let i = 0;
    const fatalDecoderSupported = (() => {
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array());
        return true;
      } catch {
        return false;
      }
    })();

    while (i < n) {
      if (!isUtf8Start(bytes[i])) {
        i++;
        continue;
      }

      let lastGood = -1;
      for (let j = i; j < n; j++) {
        const slice = bytes.subarray(i, j + 1);
        if (fatalDecoderSupported) {
          const decoded = this.#tryDecodeFatal(slice, "utf-8");
          if (decoded === null) break;
          lastGood = j;
        } else {
          const decoded = this.#decodeNonFatal(slice, "utf-8");
          if (decoded.indexOf("\ufffd") !== -1) break;
          lastGood = j;
        }
      }

      if (lastGood >= i) {
        const validSlice = bytes.subarray(i, lastGood + 1);
        const decoded = this.#decodeNonFatal(validSlice, "utf-8");
        // Count non-control/non-separator characters
        const printableChars = decoded.replace(/[\p{C}\p{Z}]/gu, "");
        if (printableChars.length >= minLen) {
          out.push({
            text: decoded,
            offset: i,
            encoding: "utf-8",
          });
        }
        i = lastGood + 1;
      } else {
        i++;
      }
    }
    return out;
  }

  #searchUtf16(isBE: boolean, minLen: number): ExtractedString[] {
    const out: ExtractedString[] = [];
    const bytes = this.#bytes;
    const n = bytes.length;
    if (n === 0) return out;

    const seen = new Set<string>();

    for (let align = 0; align <= 1; align++) {
      if (align >= n) continue;
      let i = align;
      while (i + 1 < n) {
        let lastGood = -1;
        for (let j = i + 1; j < n; j += 2) {
          const slice = bytes.subarray(i, j + 1);
          let dec: string | null = null;
          if (isBE) {
            if (slice.length % 2 !== 0) break;
            const swapped = new Uint8Array(slice.length);
            for (let k = 0; k < slice.length; k += 2) {
              swapped[k] = slice[k + 1];
              swapped[k + 1] = slice[k];
            }
            dec = this.#tryDecodeFatal(swapped, "utf-16le");
            if (dec === null) {
              const nonfatal = this.#decodeNonFatal(swapped, "utf-16le");
              dec = nonfatal.indexOf("\ufffd") !== -1 ? null : nonfatal;
            }
          } else {
            if (slice.length % 2 !== 0) break;
            dec = this.#tryDecodeFatal(slice, "utf-16le");
            if (dec === null) {
              const nonfatal = this.#decodeNonFatal(slice, "utf-16le");
              dec = nonfatal.indexOf("\ufffd") !== -1 ? null : nonfatal;
            }
          }

          if (dec === null) break;
          lastGood = j;
        }

        if (lastGood >= i) {
          const validSlice = bytes.subarray(i, lastGood + 1);
          let decoded: string;
          let encoding = "";
          if (isBE) {
            const swapped = new Uint8Array(validSlice.length);
            for (let k = 0; k < validSlice.length; k += 2) {
              swapped[k] = validSlice[k + 1];
              swapped[k + 1] = validSlice[k];
            }
            encoding = "utf-16be";
            decoded = this.#decodeNonFatal(swapped, encoding);
          } else {
            encoding = "utf-16le";
            decoded = this.#decodeNonFatal(validSlice, encoding);
          }

          const printableChars = decoded.replace(/[\p{C}\p{Z}]/gu, "");
          if (printableChars.length >= minLen) {
            const key = `${i}:${decoded}`;
            if (!seen.has(key)) {
              seen.add(key);
              out.push({
                text: decoded,
                offset: i,
                encoding,
              });
            }
          }
          // advance past this run; keep alignment by adding 2
          i = lastGood + 2;
        } else {
          i += 2;
        }
      }
    }
    return out;
  }

  close() {
    if (!this.#file) {
      return;
    }

    this.#file.close();
    this.#file = undefined;
    this.#offset = 0;
    this.#path = "";
  }

  getSize(): number {
    return this.#bytes.length;
  }

  getPath(): string {
    return this.#path;
  }

  getOffset(): number {
    return this.#offset;
  }

  getChangedAddresses(): Set<number> {
    return this.#changedAdresses;
  }

  getByte(pos: number): number | undefined {
    if (pos < 0 || pos >= this.#bytes.length) {
      return undefined;
    }

    return this.#bytes[pos];
  }

  getBytes(offset: number, length: number): Uint8Array {
    if (offset < 0 || length < 0 || offset + length > this.#bytes.length) {
      return Uint8Array.from([]);
    }

    return this.#bytes.subarray(offset, offset + length);
  }

  getChars(
    offset: number,
    length: number,
    encoding: string = "utf-8",
  ): string {
    if (offset < 0 || length < 0 || offset + length > this.#bytes.length) {
      return "";
    }

    const bytes = this.#bytes.subarray(offset, offset + length);

    if (encoding === "utf-8") {
      return bytesToUTF8(bytes);
    } else if (encoding === "cp932") {
      return bytesToCP932(bytes);
    } else {
      throw new RangeError(`Invalid encoding: ${encoding}`);
    }
  }

  getInt8(pos: number): number {
    const byte = this.getByte(pos);
    return byte !== undefined ? byte : -1;
  }

  getInt16_le() {
  }

  getInt16_be() {
  }

  getInt32_le() {
  }

  getInt32_be() {
  }
}

const exists = async (path: string) => {
  // Note: Deno.stat() may be failed
  try {
    const stat = await Deno.stat(path);
    if (stat.isDirectory || stat.isFile || stat.isSymlink) {
      return true;
    }
  } catch (_: unknown) {
    // Ignore stat exception
  }

  return false;
};

Deno.test("buffer", async () => {
  const buffer = new DdxBuffer();

  // Check empty
  assertEquals(0, buffer.getSize());
  assertEquals(Uint8Array.from([]), buffer.getBytes(0, 10));

  // Invalid path
  await buffer.open("foo-bar-baz");
  assertEquals(0, buffer.getSize());
  assertEquals(Uint8Array.from([]), buffer.getBytes(0, 655535));

  // Valid path
  const tempFilePath = await Deno.makeTempFile();
  await Deno.writeTextFile(tempFilePath, "Hello world!");

  await buffer.open(tempFilePath);

  assertEquals(12, buffer.getSize());

  assertEquals(
    Uint8Array.from([72, 101, 108, 108, 111]),
    buffer.getBytes(0, 5),
  );

  buffer.close();
});

Deno.test("bytes insertion", async () => {
  const buffer = new DdxBuffer();

  const bytes1 = Uint8Array.from([72, 101]);
  const bytes2 = Uint8Array.from([108, 108, 111]);
  const bytes3 = Uint8Array.from([72, 101, 108, 108, 111]);

  buffer.insert(0, bytes1);
  assertEquals(2, buffer.getSize());

  buffer.insert(2, bytes2);
  assertEquals(5, buffer.getSize());

  assertEquals(
    bytes3,
    buffer.getBytes(0, 5),
  );

  // Save
  const tempFilePath = await Deno.makeTempFile();
  await buffer.write(tempFilePath);

  assertEquals(
    bytes3,
    await Deno.readFile(tempFilePath),
  );

  buffer.close();
});
