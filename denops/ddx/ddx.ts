import { Denops, fn, op, parse, toFileUrl } from "./deps.ts";
import {
  BaseUi,
  DdxBuffer,
  DdxExtType,
  DdxOptions,
  UiOptions,
} from "./types.ts";
import { defaultUiOptions, defaultUiParams } from "./base/ui.ts";
import {
  defaultContext,
  defaultDdxOptions,
  foldMerge,
  mergeUiOptions,
  mergeUiParams,
} from "./context.ts";

export class Ddx {
  private uis: Record<string, BaseUi<Record<string, unknown>>> = {};
  private aliases: Record<DdxExtType, Record<string, string>> = {
    ui: {},
  };

  private checkPaths: Record<string, boolean> = {};
  private options: DdxOptions = defaultDdxOptions();
  private userOptions: Record<string, unknown> = {};
  private buffer: DdxBuffer = new DdxBuffer();

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
      await this.buffer.open(path);
    } catch (e: unknown) {
      await errorException(
        denops,
        e,
        `open: ${path} is failed`,
      );
      return;
    }

    const uiName = "hex";
    await this.autoload(denops, "ui", [uiName]);

    const [ui, uiOptions, uiParams] = await this.getUi(denops, uiName);
    if (!ui) {
      return;
    }

    await ui.redraw({
      denops,
      context: defaultContext(),
      options: defaultDdxOptions(),
      buffer: this.buffer,
      uiOptions,
      uiParams,
    });
  }

  async register(type: DdxExtType, path: string, name: string) {
    if (path in this.checkPaths) {
      return;
    }
    this.checkPaths[path] = true;

    const mod = await import(toFileUrl(path).href);

    let add;
    switch (type) {
      case "ui":
        add = (name: string) => {
          const ui = new mod.Ui();
          ui.name = name;
          this.uis[ui.name] = ui;
        };
        break;
    }

    add(name);

    // Check alias
    const aliases = Object.keys(this.aliases[type]).filter(
      (k) => this.aliases[type][k] == name,
    );
    for (const alias of aliases) {
      add(alias);
    }
  }

  async autoload(
    denops: Denops,
    type: DdxExtType,
    names: string[],
  ): Promise<string[]> {
    if (names.length == 0) {
      return [];
    }

    const runtimepath = await op.runtimepath.getGlobal(denops);

    async function globpath(
      searches: string[],
      files: string[],
    ): Promise<string[]> {
      let paths: string[] = [];
      for (const search of searches) {
        for (const file of files) {
          paths = paths.concat(
            await fn.globpath(
              denops,
              runtimepath,
              search + file + ".ts",
              1,
              1,
            ) as string[],
          );
        }
      }

      return paths;
    }

    const paths = await globpath(
      [`denops/@ddx-${type}s/`],
      names.map((file) => this.aliases[type][file] ?? file),
    );

    await Promise.all(paths.map(async (path) => {
      await this.register(type, path, parse(path).name);
    }));

    return paths;
  }

  getOptions() {
    return this.options;
  }

  getUserOptions() {
    return this.userOptions;
  }

  private async getUi(
    denops: Denops,
    name: string,
  ): Promise<
    [
      BaseUi<Record<string, unknown>> | undefined,
      UiOptions,
      Record<string, unknown>,
    ]
  > {
    await this.autoload(denops, "ui", [name]);
    const ui = this.uis[name];
    if (!ui) {
      const message = `Invalid ui: "${this.options.ui}"`;
      await denops.call(
        "ddx#util#print_error",
        message,
      );
      return [
        undefined,
        defaultUiOptions(),
        defaultUiParams(),
      ];
    }

    const [uiOptions, uiParams] = uiArgs(this.options, ui);
    await checkUiOnInit(ui, denops, uiOptions, uiParams);

    return [ui, uiOptions, uiParams];
  }
}

function uiArgs<
  Params extends Record<string, unknown>,
>(
  options: DdxOptions,
  ui: BaseUi<Params>,
): [UiOptions, Record<string, unknown>] {
  const o = foldMerge(
    mergeUiOptions,
    defaultUiOptions,
    [
      options.uiOptions["_"],
      options.uiOptions[ui.name],
    ],
  );
  const p = foldMerge(mergeUiParams, defaultUiParams, [
    ui.params(),
    options.uiParams["_"],
    options.uiParams[ui.name],
  ]);
  return [o, p];
}

async function checkUiOnInit(
  ui: BaseUi<Record<string, unknown>>,
  denops: Denops,
  uiOptions: UiOptions,
  uiParams: Record<string, unknown>,
) {
  if (ui.isInitialized) {
    return;
  }

  try {
    await ui.onInit({
      denops,
      uiOptions,
      uiParams,
    });

    ui.isInitialized = true;
  } catch (e: unknown) {
    await errorException(
      denops,
      e,
      `[ddx.vim] ui: ${ui.name} "onInit()" is failed`,
    );
  }
}

async function errorException(denops: Denops, e: unknown, message: string) {
  await denops.call(
    "ddx#util#print_error",
    message,
  );
  if (e instanceof Error) {
    await denops.call(
      "ddx#util#print_error",
      e.message,
    );
    if (e.stack) {
      await denops.call(
        "ddx#util#print_error",
        e.stack,
      );
    }
  }
}
