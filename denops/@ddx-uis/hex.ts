import {
  ActionFlags,
  BaseUi,
  Context,
  DdxBuffer,
  DdxOptions,
  UiActions,
  UiOptions,
} from "../ddx/types.ts";
import { Denops } from "../ddx/deps.ts";

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
    const bytes = await args.buffer.getBytes();

    function arrayBufferToHex(buffer: Uint8Array) {
      return Array.prototype.map.call(
        new Uint8Array(buffer),
        (x) => ("00" + x.toString(16)).slice(-2),
      ).join("");
    }

    console.log(arrayBufferToHex(bytes));
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
