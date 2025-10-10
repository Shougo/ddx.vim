import type {
  BaseParams,
  Context,
  DdxOptions,
  UiActionCallback,
  UiOptions,
} from "../types.ts";
import type { DdxBuffer } from "../buffer.ts";

import type { Denops } from "@denops/std";

export type UiActions<Params extends BaseParams> = Record<
  string,
  UiActionCallback<Params>
>;

export type OnInitArguments<Params extends BaseParams> = {
  denops: Denops;
  uiOptions: UiOptions;
  uiParams: Params;
};

type BaseUiArguments<Params extends BaseParams> = {
  denops: Denops;
  context: Context;
  options: DdxOptions;
  uiOptions: UiOptions;
  uiParams: Params;
};

export type RedrawArguments<Params extends BaseParams> =
  & BaseUiArguments<Params>
  & {
    buffer: DdxBuffer;
  };

export type JumpArguments<Params extends BaseParams> =
  & BaseUiArguments<Params>
  & {
    address: number;
  };

export type QuitArguments<Params extends BaseParams> = BaseUiArguments<Params>;

export abstract class BaseUi<Params extends BaseParams> {
  name = "";
  isInitialized = false;

  apiVersion = 1;

  onInit(_args: OnInitArguments<Params>): void | Promise<void> {}

  redraw(_args: RedrawArguments<Params>): void | Promise<void> {}

  jump(_args: JumpArguments<Params>): void | Promise<void> {}

  quit(_args: QuitArguments<Params>): void | Promise<void> {}

  actions: UiActions<Params> = {};

  abstract params(): Params;
}

export function defaultUiOptions(): UiOptions {
  return {};
}

export function defaultUiParams(): BaseParams {
  return {};
}
