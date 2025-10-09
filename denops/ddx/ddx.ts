import type { DdxOptions, UserOptions } from "./types.ts";
import { defaultContext, defaultDdxOptions } from "./context.ts";
import type { Loader } from "./loader.ts";
import { getAnalyzer, getUi } from "./ext.ts";
import { printError } from "./utils.ts";
import { DdxBuffer } from "./buffer.ts";
import type { AnalyzeResult } from "./base/analyzer.ts";
import { foldMerge, mergeDdxOptions } from "./context.ts";

import type { Denops } from "@denops/std";

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
    userOptions: DdxOptions,
  ): Promise<void> {
    this.updateOptions(userOptions);

    if (this.#options.path.length === 0) {
      await denops.call(
        "ddx#util#print_error",
        `You must specify path option`,
      );
      return;
    }

    try {
      await this.#buffer.open(
        this.#options.path,
        Number(this.#options.offset),
        Number(this.#options.length),
      );
    } catch (e: unknown) {
      await printError(
        denops,
        e,
        `open: ${this.#options.path.length} failed`,
      );
      return;
    }

    const [ui, uiOptions, uiParams] = await getUi(
      denops,
      this.#loader,
      this.#options,
      this.#options.ui,
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

  updateOptions(userOptions: UserOptions) {
    this.#options = foldMerge(mergeDdxOptions, defaultDdxOptions, [
      this.#options,
      userOptions,
    ]);
  }

  async parse(denops: Denops): Promise<AnalyzeResult[]> {
    for (const name of this.#options.analyzers) {
      const [analyzer, analyzerOptions, analyzerParams] = await getAnalyzer(
        denops,
        this.#loader,
        this.#options,
        name,
      );

      if (!analyzer) {
        continue;
      }

      const detect = analyzer.detect({
        denops,
        context: defaultContext(),
        options: this.#options,
        buffer: this.#buffer,
        analyzerOptions,
        analyzerParams,
      });
      if (detect) {
        return analyzer.parse({
          denops,
          context: defaultContext(),
          options: this.#options,
          buffer: this.#buffer,
          analyzerOptions,
          analyzerParams,
        });
      }
    }

    return [];
  }
}
