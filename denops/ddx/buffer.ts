import { assertEquals } from "./deps.ts";
import { readRange } from "https://deno.land/std@0.170.0/io/read_range.ts";

export class DdxBuffer {
  private path = "";
  private file: Deno.FsFile | null = null;

  async open(path: string) {
    this.close();

    this.path = path;
    this.file = await Deno.open(path, { read: true });
  }

  write() {
  }

  close() {
    if (this.file) {
      this.file.close();
    }
  }

  async getSize() {
    const stat = await Deno.stat(this.path);
    return stat.size;
  }

  getByte() {
  }

  async getBytes(start: number, length: number): Promise<Uint8Array> {
    if (!this.file) {
      return new Uint8Array();
    }

    return await readRange(this.file, { start: start, end: start + length - 1 });
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

Deno.test("buffer", async () => {
  const tempFilePath = await Deno.makeTempFile();
  await Deno.writeTextFile(tempFilePath, "Hello world!");

  const buffer = new DdxBuffer();
  await buffer.open(tempFilePath);

  assertEquals(12, await buffer.getSize());

  assertEquals(
    Uint8Array.from([72, 101, 108, 108, 111]),
    await buffer.getBytes(0, 5),
  );

  buffer.close();
});
