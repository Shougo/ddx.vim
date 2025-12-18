import type { DdxOptions, UserOptions } from "./types.ts";
import { defaultContext, defaultDdxOptions } from "./context.ts";
import type { Loader } from "./loader.ts";
import { getAnalyzer, getUi } from "./ext.ts";
import { numberToUint8Array, printError, stringToUint8Array } from "./utils.ts";
import { DdxBuffer } from "./buffer.ts";
import type { AnalyzeResult, AnalyzeValue } from "./base/analyzer.ts";
import { foldMerge, mergeDdxOptions } from "./context.ts";

import type { Denops } from "@denops/std";
import { is } from "@core/unknownutil/is";
import { ensure } from "@core/unknownutil/ensure";

export class Ddx {
  #loader: Loader;
  #options: DdxOptions = defaultDdxOptions();
  #userOptions: UserOptions = {};
  #buffer: DdxBuffer = new DdxBuffer();
  #anotherBuffer: DdxBuffer = new DdxBuffer();

  constructor(loader: Loader) {
    this.#loader = loader;
  }

  getBuffer() {
    return this.#buffer;
  }

  getAnotherBuffer() {
    return this.#anotherBuffer;
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

  async start(
    denops: Denops,
    userOptions: DdxOptions,
  ): Promise<void> {
    this.updateOptions(userOptions);

    return await this.restart(denops);
  }

  async restart(
    denops: Denops,
  ): Promise<void> {
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

    if (this.#options.anotherPath.length > 0) {
      try {
        await this.#anotherBuffer.open(
          this.#options.anotherPath,
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
    }

    await this.redraw(denops);
  }

  async redraw(
    denops: Denops,
  ) {
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

  async analyze(denops: Denops): Promise<AnalyzeResult[]> {
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

  change(value: AnalyzeValue, newValue: string | number) {
    if (value.rawType === "integer") {
      const bytes = numberToUint8Array(
        ensure(newValue, is.Number),
        value.size ?? 4,
        value.isLittle ?? true,
        false, // unsigned
      );

      this.#buffer.changeBytes(
        value.address,
        bytes,
      );
    } else {
      // string
      const bytes = stringToUint8Array(
        ensure(newValue, is.String),
        value.size,
        value.encoding ?? "utf-8",
        {
          pad: true,
          padWith: 0x00,
          truncate: true,
          nullTerminate: false,
        },
      );

      this.#buffer.changeBytes(
        value.address,
        bytes,
      );
    }
  }

  async jump(denops: Denops, address: number): Promise<void> {
    const [ui, uiOptions, uiParams] = await getUi(
      denops,
      this.#loader,
      this.#options,
      this.#options.ui,
    );
    if (!ui) {
      return;
    }

    await ui.jump({
      denops,
      context: defaultContext(),
      options: this.#options,
      uiOptions,
      uiParams,
      address,
    });
  }
}
