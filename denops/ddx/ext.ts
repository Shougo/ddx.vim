import {
  ActionFlags,
  BaseParams,
  Context,
  DdxOptions,
  UiOptions,
} from "./types.ts";
import { BaseUi, defaultUiOptions, defaultUiParams } from "./base/ui.ts";
import { foldMerge, mergeUiOptions, mergeUiParams } from "./context.ts";
import { Loader } from "./loader.ts";
import { printError } from "./utils.ts";
import { DdxBuffer } from "./buffer.ts";

import type { Denops } from "jsr:@denops/std@~7.1.0";

export async function uiAction(
  denops: Denops,
  loader: Loader,
  context: Context,
  options: DdxOptions,
  buffer: DdxBuffer,
  actionName: string,
  params: unknown,
): Promise<void> {
  const uiName = "hex";
  const [ui, uiOptions, uiParams] = await getUi(
    denops,
    loader,
    options,
    uiName,
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
  const p = foldMerge(mergeUiParams, defaultUiParams, [
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
