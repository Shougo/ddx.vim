import { Denops } from "./deps.ts";
import { readRange } from "https://deno.land/std@0.147.0/io/files.ts";

export class Ddx {
  async start(
    denops: Denops,
    path: string,
  ): Promise<void> {
    const file = await Deno.open(path, { read: true });
    const bytes = await readRange(file, { start: 0, end: 15 });

    function arrayBufferToHex(buffer: Uint8Array) {
      return Array.prototype.map.call(
        new Uint8Array(buffer),
        x => ('00' + x.toString(16)).slice(-2)).join('');
    }

    console.log(arrayBufferToHex(bytes));
  }
}
