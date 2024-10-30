import { DdxOptions, UserOptions } from "./types.ts";
import { defaultContext, defaultDdxOptions } from "./context.ts";
import { Loader } from "./loader.ts";
import { getUi } from "./ext.ts";
import { printError } from "./utils.ts";
import { DdxBuffer } from "./buffer.ts";

import type { Denops } from "jsr:@denops/std@~7.3.0";

export class Ddx {
  #loader: Loader;

  constructor(loader: Loader) {
    this.#loader = loader;
  }

  #options: DdxOptions = defaultDdxOptions();
  #userOptions: UserOptions = {};
  #buffer: DdxBuffer = new DdxBuffer();

  async start(
    denops: Denops,
    path: string,
  ): Promise<void> {
    if (!path) {
      await denops.call(
        "ddx#util#print_error",
        `You must specify path option`,
      );
      return;
    }

    try {
      await this.#buffer.open(path);
    } catch (e: unknown) {
      await printError(
        denops,
        e,
        `open: ${path} failed`,
      );
      return;
    }

    const uiName = "hex";
    const [ui, uiOptions, uiParams] = await getUi(
      denops,
      this.#loader,
      this.#options,
      uiName,
    );
    if (!ui) {
      return;
    }

    await ui.redraw({
      denops,
      context: defaultContext(),
      options: this.#options,
      buffer: this.#buffer,
      uiOptions,
      uiParams,
    });
  }

  getBuffer() {
    return this.#buffer;
  }

  getOptions() {
    return this.#options;
  }

  getUserOptions() {
    return this.#userOptions;
  }
}
