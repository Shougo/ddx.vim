import { readRange } from "https://deno.land/std@0.170.0/io/files.ts";

export class DdxBuffer {
  private path = "";
  private file: Deno.FsFile | null = null;

  async open(path: string) {
    this.path = path;
    this.file = await Deno.open(path, { read: true });
  }

  write() {
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

    return await readRange(this.file, { start: start, end: start + length });
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
