import {
  ActionFlags,
  BaseUi,
  Context,
  DdxOptions,
  UiActions,
  UiOptions,
} from "../ddx/types.ts";
import { Denops } from "../ddx/deps.ts";

type Params = Record<never, never>;

export class Ui extends BaseUi<Params> {
  async redraw(_args: {
    denops: Denops;
    context: Context;
    options: DdxOptions;
    uiOptions: UiOptions;
    uiParams: Params;
  }): Promise<void> {
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
