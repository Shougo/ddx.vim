import { Denops, fn, op, parse, toFileUrl } from "./deps.ts";
import {
  ActionFlags,
  BaseUi,
  BaseUiParams,
  DdxBuffer,
  DdxExtType,
  DdxOptions,
  UiOptions,
  UserOptions,
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
  private uis: Record<string, BaseUi<BaseUiParams>> = {};
  private aliases: Record<DdxExtType, Record<string, string>> = {
    ui: {},
  };

  private checkPaths: Record<string, boolean> = {};
  private options: DdxOptions = defaultDdxOptions();
  private userOptions: UserOptions = {};
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
        `open: ${path} failed`,
      );
      return;
    }

    const uiName = "hex";
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

    const paths = await globpath(
      denops,
      [`denops/@ddx-${type}s/`],
      names.map((file) => this.aliases[type][file] ?? file),
    );

    await Promise.all(paths.map(async (path) => {
      await this.register(type, path, parse(path).name);
    }));

    return paths;
  }

  async uiAction(
    denops: Denops,
    actionName: string,
    params: unknown,
  ): Promise<void> {
    const uiName = "hex";
    const [ui, uiOptions, uiParams] = await this.getUi(denops, uiName);
    if (!ui) {
      return;
    }

    const action = ui.actions[actionName];
    if (!action) {
      await denops.call(
        "ddx#util#print_error",
        `Invalid UI action: ${actionName}`,
      );
      return;
    }
    const flags = await action({
      denops,
      context: defaultContext(),
      options: this.options,
      buffer: this.buffer,
      uiOptions,
      uiParams,
      actionParams: params,
    });

    if (flags & ActionFlags.Redraw) {
      await ui.redraw({
        denops,
        context: defaultContext(),
        options: this.options,
        buffer: this.buffer,
        uiOptions,
        uiParams,
      });
    }
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
      BaseUi<BaseUiParams> | undefined,
      UiOptions,
      BaseUiParams,
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
  Params extends BaseUiParams,
>(
  options: DdxOptions,
  ui: BaseUi<Params>,
): [UiOptions, BaseUiParams] {
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
  ui: BaseUi<BaseUiParams>,
  denops: Denops,
  uiOptions: UiOptions,
  uiParams: BaseUiParams,
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
      `[ddx.vim] ui: ${ui.name} "onInit()" failed`,
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

async function globpath(
  denops: Denops,
  searches: string[],
  files: string[],
): Promise<string[]> {
  const runtimepath = await op.runtimepath.getGlobal(denops);

  const check: Record<string, boolean> = {};
  const paths: string[] = [];
  for (const search of searches) {
    for (const file of files) {
      const glob = await fn.globpath(
        denops,
        runtimepath,
        search + file + ".ts",
        1,
        1,
      ) as string[];

      for (const path of glob) {
        // Skip already added name.
        if (parse(path).name in check) {
          continue;
        }

        paths.push(path);
        check[parse(path).name] = true;
      }
    }
  }

  return paths;
}
