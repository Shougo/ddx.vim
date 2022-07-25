import {
  ActionFlags,
  BaseUi,
  Context,
  DdxBuffer,
  DdxOptions,
  UiActions,
  UiOptions,
} from "../ddx/types.ts";
import { Denops, fn } from "../ddx/deps.ts";

type Params = Record<never, never>;

export class Ui extends BaseUi<Params> {
  async redraw(args: {
    denops: Denops;
    context: Context;
    options: DdxOptions;
    buffer: DdxBuffer;
    uiOptions: UiOptions;
    uiParams: Params;
  }): Promise<void> {
    function arrayBufferToHex(buffer: Uint8Array) {
      return Array.prototype.map.call(
        new Uint8Array(buffer),
        (x) => ("00" + x.toString(16)).slice(-2),
      ).join(" ");
    }

    let lnum = 1;
    let start = 0;
    const size = await args.buffer.getSize();
    const length = 16;

    while (start < size) {
      const bytes = await args.buffer.getBytes(
        start,
        Math.min(length, size - start) - 1,
      );

      const address = start.toString(16);
      const padding = " ".repeat((16 - bytes.length) * 3);

      await fn.setline(
        args.denops,
        lnum,
        `${("00000000" + address).slice(-8)}: ${
          arrayBufferToHex(bytes)
        }${padding} |   ${new TextDecoder().decode(bytes)}`,
      );

      start += length;
      lnum += 1;
    }
  }

  async quit(_args: {
    denops: Denops;
    context: Context;
    options: DdxOptions;
    uiParams: Params;
  }): Promise<void> {
  }

  actions: UiActions<Params> = {
    quit: async (args: {
      denops: Denops;
      context: Context;
      options: DdxOptions;
      uiParams: Params;
    }) => {
      await this.quit({
        denops: args.denops,
        context: args.context,
        options: args.options,
        uiParams: args.uiParams,
      });

      return ActionFlags.None;
    },
  };

  params(): Params {
    return {};
  }
}
