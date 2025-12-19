import {
  ActionFlags,
  type AnalyzerOptions,
  type BaseParams,
  type Context,
  type DdxOptions,
  type UiOptions,
} from "./types.ts";
import { type BaseUi, defaultUiOptions, defaultUiParams } from "./base/ui.ts";
import {
  type BaseAnalyzer,
  defaultAnalyzerOptions,
  defaultAnalyzerParams,
} from "./base/analyzer.ts";
import {
  foldMerge,
  mergeAnalyzerOptions,
  mergeParams,
  mergeUiOptions,
} from "./context.ts";
import type { Loader } from "./loader.ts";
import { printError } from "./utils.ts";
import type { DdxBuffer } from "./buffer.ts";

import type { Denops } from "@denops/std";

export async function uiAction(
  denops: Denops,
  loader: Loader,
  context: Context,
  options: DdxOptions,
  buffer: DdxBuffer,
  anotherBuffer: DdxBuffer,
  actionName: string,
  params: BaseParams,
): Promise<void> {
  const [ui, uiOptions, uiParams] = await getUi(
    denops,
    loader,
    options,
    options.ui,
  );
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
    context,
    options,
    buffer,
    uiOptions,
    uiParams,
    actionParams: params,
  });

  if (flags & ActionFlags.Redraw) {
    await ui.redraw({
      denops,
      context,
      options,
      buffer,
      anotherBuffer,
      uiOptions,
      uiParams,
    });
  }
}

export async function getUi(
  denops: Denops,
  loader: Loader,
  options: DdxOptions,
  name: string,
): Promise<
  [
    BaseUi<BaseParams> | undefined,
    UiOptions,
    BaseParams,
  ]
> {
  await loader.autoload(denops, "ui", name);
  const ui = loader.getUi(name);
  if (!ui) {
    const message = `Invalid ui: "${name}"`;
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

  const [uiOptions, uiParams] = uiArgs(options, ui);
  await checkUiOnInit(ui, denops, uiOptions, uiParams);

  return [ui, uiOptions, uiParams];
}

function uiArgs<
  Params extends BaseParams,
>(
  options: DdxOptions,
  ui: BaseUi<Params>,
): [UiOptions, BaseParams] {
  const o = foldMerge(
    mergeUiOptions,
    defaultUiOptions,
    [
      options.uiOptions["_"],
      options.uiOptions[ui.name],
    ],
  );
  const p = foldMerge(mergeParams, defaultUiParams, [
    ui.params(),
    options.uiParams["_"],
    options.uiParams[ui.name],
  ]);
  return [o, p];
}

async function checkUiOnInit(
  ui: BaseUi<BaseParams>,
  denops: Denops,
  uiOptions: UiOptions,
  uiParams: BaseParams,
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
    await printError(
      denops,
      e,
      `[ddx.vim] ui: ${ui.name} "onInit()" failed`,
    );
  }
}

export async function getAnalyzer(
  denops: Denops,
  loader: Loader,
  options: DdxOptions,
  name: string,
): Promise<
  [
    BaseAnalyzer<BaseParams> | undefined,
    AnalyzerOptions,
    BaseParams,
  ]
> {
  await loader.autoload(denops, "analyzer", name);
  const analyzer = loader.getAnalyzer(name);
  if (!analyzer) {
    const message = `Invalid analyzer: "${name}"`;
    await denops.call(
      "ddx#util#print_error",
      message,
    );
    return [
      undefined,
      defaultAnalyzerOptions(),
      defaultAnalyzerParams(),
    ];
  }

  const [analyzerOptions, analyzerParams] = analyzerArgs(options, analyzer);
  await checkAnalyzerOnInit(analyzer, denops, analyzerOptions, analyzerParams);

  return [analyzer, analyzerOptions, analyzerParams];
}

function analyzerArgs<
  Params extends BaseParams,
>(
  options: DdxOptions,
  analyzer: BaseAnalyzer<Params>,
): [AnalyzerOptions, BaseParams] {
  const o = foldMerge(
    mergeAnalyzerOptions,
    defaultAnalyzerOptions,
    [
      options.analyzerOptions["_"],
      options.analyzerOptions[analyzer.name],
    ],
  );
  const p = foldMerge(mergeParams, defaultAnalyzerParams, [
    analyzer.params(),
    options.analyzerParams["_"],
    options.analyzerParams[analyzer.name],
  ]);
  return [o, p];
}

async function checkAnalyzerOnInit(
  analyzer: BaseAnalyzer<BaseParams>,
  denops: Denops,
  analyzerOptions: AnalyzerOptions,
  analyzerParams: BaseParams,
) {
  if (analyzer.isInitialized) {
    return;
  }

  try {
    await analyzer.onInit({
      denops,
      analyzerOptions,
      analyzerParams,
    });

    analyzer.isInitialized = true;
  } catch (e: unknown) {
    await printError(
      denops,
      e,
      `[ddx.vim] analyzer: ${analyzer.name} "onInit()" failed`,
    );
  }
}
