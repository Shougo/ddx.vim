import {
  Context,
  DdxBuffer,
  DdxOptions,
  UiActionCallback,
  UiOptions,
} from "../types.ts";
import { Denops } from "../deps.ts";

export type BaseUiParams = Record<string, unknown>;

export type UiActions<Params extends BaseUiParams> = Record<
  string,
  UiActionCallback<Params>
>;

export type OnInitArguments<Params extends BaseUiParams> = {
  denops: Denops;
  uiOptions: UiOptions;
  uiParams: Params;
};

export type RedrawArguments<Params extends BaseUiParams> = {
  denops: Denops;
  context: Context;
  options: DdxOptions;
  buffer: DdxBuffer;
  uiOptions: UiOptions;
  uiParams: Params;
};

export type QuitArguments<Params extends BaseUiParams> = {
  denops: Denops;
  context: Context;
  options: DdxOptions;
  uiOptions: UiOptions;
  uiParams: Params;
};

export abstract class BaseUi<Params extends BaseUiParams> {
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

export function defaultUiParams(): BaseUiParams {
  return {};
}
