import {
  BaseParams,
  Context,
  DdxOptions,
  UiActionCallback,
  UiOptions,
} from "../types.ts";
import { DdxBuffer } from "../buffer.ts";

import type { Denops } from "jsr:@denops/std@~7.3.0";

export type UiActions<Params extends BaseParams> = Record<
  string,
  UiActionCallback<Params>
>;

export type OnInitArguments<Params extends BaseParams> = {
  denops: Denops;
  uiOptions: UiOptions;
  uiParams: Params;
};

export type RedrawArguments<Params extends BaseParams> = {
  denops: Denops;
  context: Context;
  options: DdxOptions;
  buffer: DdxBuffer;
  uiOptions: UiOptions;
  uiParams: Params;
};

export type QuitArguments<Params extends BaseParams> = {
  denops: Denops;
  context: Context;
  options: DdxOptions;
  uiOptions: UiOptions;
  uiParams: Params;
};

export abstract class BaseUi<Params extends BaseParams> {
  name = "";
  isInitialized = false;

  apiVersion = 1;

  onInit(_args: OnInitArguments<Params>): void | Promise<void> {}

  redraw(_args: RedrawArguments<Params>): void | Promise<void> {}

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
