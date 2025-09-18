import { assertEquals } from "@std/assert";

export class DdxBuffer {
  file: Deno.FsFile | undefined = undefined;
  offset: number = 0;
  path: string = "";
  bytes: Uint8Array = new Uint8Array();

  async open(path: string, offset: number = 0, length: number = 0) {
    if (!(await exists(path))) {
      return;
    }

    this.file = await Deno.open(path, { read: true });
    this.offset = offset;
    this.path = path;

    const stat = await Deno.stat(path);
    const fileLength = stat.size;

    if (length === 0 || offset + length > fileLength) {
      length = fileLength - offset;
    }

    if (length <= 0 || offset >= fileLength) {
      this.bytes = new Uint8Array();
      return;
    }

    await this.file.seek(offset, Deno.SeekMode.Start);

    const buf = new Uint8Array(length);
    const bytesRead = await this.file.read(buf);

    this.bytes = buf.subarray(0, bytesRead ?? 0);
  }

  insert(pos: number, bytes: Uint8Array) {
    if (pos < 0 || pos > this.bytes.length) {
      throw new RangeError("Position out of range");
    }

    const before = this.bytes.subarray(0, pos);
    const after = this.bytes.subarray(pos);

    const newBytes = new Uint8Array(
      before.length + bytes.length + after.length,
    );
    newBytes.set(before, 0);
    newBytes.set(bytes, before.length);
    newBytes.set(after, before.length + bytes.length);

    this.bytes = newBytes;
  }

  change(pos: number, value: number) {
    if (pos < 0 || pos > this.bytes.length) {
      throw new RangeError("Position out of range");
    }

    this.bytes[pos] = value;
  }

  remove(pos: number) {
    if (pos < 0 || pos > this.bytes.length) {
      throw new RangeError("Position out of range");
    }

    const newBytes = new Uint8Array(this.bytes.length - 1);
    newBytes.set(this.bytes.subarray(0, pos));
    newBytes.set(this.bytes.subarray(pos + 1), pos);

    this.bytes = newBytes;
  }

  async write(path: string = "") {
    if (path.length === 0) {
      path = this.path;
    }

    const file = await Deno.open(path, { write: true, create: true });

    await file.seek(this.offset ?? 0, Deno.SeekMode.Start);

    await file.write(this.bytes);

    file.close();
  }

  close() {
    if (!this.file) {
      return;
    }

    this.file.close();
    this.file = undefined;
    this.offset = 0;
    this.path = "";
  }

  getSize(): number {
    return this.bytes.length;
  }

  getPath(): string {
    return this.path;
  }

  getByte(pos: number): number | undefined {
    if (pos < 0 || pos >= this.bytes.length) {
      return undefined;
    }

    return this.bytes[pos];
  }

  getBytes(offset: number, length: number): Uint8Array {
    if (offset < 0 || length < 0 || offset + length > this.bytes.length) {
      return Uint8Array.from([]);
    }

    return this.bytes.subarray(offset, offset + length);
  }

  getInt8() {
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
