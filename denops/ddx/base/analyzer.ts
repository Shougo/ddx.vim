import type {
  BaseParams,
  AnalyzerOptions,
} from "../types.ts";

import type { Denops } from "@denops/std";

export type OnInitArguments<Params extends BaseParams> = {
  denops: Denops;
  analyzerOptions: AnalyzerOptions;
  analyzerParams: Params;
};

export abstract class BaseAnalyzer<Params extends BaseParams> {
  name = "";
  isInitialized = false;

  apiVersion = 1;

  onInit(_args: OnInitArguments<Params>): void | Promise<void> {}

  abstract params(): Params;
}

export function defaultAnalyzerOptions(): AnalyzerOptions {
  return {};
}

export function defaultAnalyzerParams(): BaseParams {
  return {};
}
