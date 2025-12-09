import type {
  AnalyzerOptions,
  BaseParams,
  Context,
  DdxOptions,
  UiOptions,
  UserOptions,
} from "./types.ts";

import { assertEquals } from "@std/assert";
import type { Denops } from "@denops/std";
import * as fn from "@denops/std/function";

// where
// T: Object
// partialMerge: PartialMerge
// partialMerge(partialMerge(a, b), c) == partialMerge(a, partialMerge(b, c))
type PartialMerge<T> = (a: Partial<T>, b: Partial<T>) => Partial<T>;
type Merge<T> = (a: T, b: Partial<T>) => T;
type Default<T> = () => T;

function partialOverwrite<T>(a: Partial<T>, b: Partial<T>): Partial<T> {
  return { ...a, ...b };
}

function overwrite<T>(a: T, b: Partial<T>): T {
  return { ...a, ...b };
}

export const mergeUiOptions: Merge<UiOptions> = overwrite;
export const mergeAnalyzerOptions: Merge<AnalyzerOptions> = overwrite;

export const mergeParams: Merge<BaseParams> = overwrite;

export function foldMerge<T>(
  merge: Merge<T>,
  def: Default<T>,
  partials: (null | undefined | Partial<T>)[],
): T {
  return partials.map((x) => x || {}).reduce(merge, def());
}

export function defaultContext(): Context {
  return {
    bufNr: 0,
    winId: 0,
  };
}

export function defaultDdxOptions(): DdxOptions {
  return {
    analyzers: [],
    analyzerOptions: {},
    analyzerParams: {},
    length: 1 * 1024 * 1024,
    name: "default",
    offset: 0,
    path: "",
    ui: "",
    uiOptions: {},
    uiParams: {},
  };
}

function migrateEachKeys<T>(
  merge: PartialMerge<T>,
  a: null | undefined | Record<string, Partial<T>>,
  b: null | undefined | Record<string, Partial<T>>,
): null | Record<string, Partial<T>> {
  if (!a && !b) return null;
  const ret: Record<string, Partial<T>> = {};
  if (a) {
    for (const key in a) {
      ret[key] = a[key];
    }
  }
  if (b) {
    for (const key in b) {
      if (key in ret) {
        ret[key] = merge(ret[key], b[key]);
      } else {
        ret[key] = b[key];
      }
    }
  }
  return ret;
}

export function mergeDdxOptions(
  a: DdxOptions,
  b: Partial<DdxOptions>,
): DdxOptions {
  const overwritten: DdxOptions = overwrite(a, b);
  const partialMergeUiOptions = partialOverwrite;
  const partialMergeUiParams = partialOverwrite;

  return Object.assign(overwritten, {
    uiOptions: migrateEachKeys(
      partialMergeUiOptions,
      a.uiOptions,
      b.uiOptions,
    ) || {},
    uiParams: migrateEachKeys(
      partialMergeUiParams,
      a.uiParams,
      b.uiParams,
    ) || {},
  });
}

function patchDdxOptions(
  a: Partial<DdxOptions>,
  b: Partial<DdxOptions>,
): Partial<DdxOptions> {
  const overwritten: Partial<DdxOptions> = { ...a, ...b };

  const uo = migrateEachKeys(
    partialOverwrite,
    a.uiOptions,
    b.uiOptions,
  );
  if (uo) overwritten.uiOptions = uo;

  const up = migrateEachKeys(partialOverwrite, a.uiParams, b.uiParams);
  if (up) overwritten.uiParams = up;

  return overwritten;
}

// Customization by end users
class Custom {
  global: Partial<DdxOptions> = {};
  local: Record<string, Partial<DdxOptions>> = {};

  get(userOptions: UserOptions): DdxOptions {
    const options = foldMerge(mergeDdxOptions, defaultDdxOptions, [
      this.global,
      userOptions,
    ]);
    const name = options.name;
    const local = this.local[name] || {};
    return foldMerge(mergeDdxOptions, defaultDdxOptions, [
      this.global,
      local,
      userOptions,
    ]);
  }

  setGlobal(options: Partial<DdxOptions>): Custom {
    this.global = options;
    return this;
  }
  setLocal(name: string, options: Partial<DdxOptions>): Custom {
    this.local[name] = options;
    return this;
  }
  patchGlobal(options: Partial<DdxOptions>): Custom {
    this.global = patchDdxOptions(this.global, options);
    return this;
  }
  patchLocal(name: string, options: Partial<DdxOptions>): Custom {
    this.local[name] = patchDdxOptions(
      this.local[name] || {},
      options,
    );
    return this;
  }
}

export class ContextBuilder {
  #custom: Custom = new Custom();

  async get(
    denops: Denops,
    options: UserOptions,
  ): Promise<[Context, DdxOptions]> {
    const userOptions = this.#custom.get(options);

    await this.validate(denops, "options", userOptions, defaultDdxOptions());

    return [
      {
        ...defaultContext(),
        bufNr: await fn.bufnr(denops, "%"),
        winId: await fn.win_getid(denops) as number,
      },
      userOptions,
    ];
  }

  async validate(
    denops: Denops,
    name: string,
    options: Record<string, unknown>,
    defaults: Record<string, unknown>,
  ) {
    for (const key in options) {
      if (!(key in defaults)) {
        await denops.call(
          "ddx#util#print_error",
          `Invalid ${name}: "${key}"`,
        );
      }
    }
  }

  getGlobal(): Partial<DdxOptions> {
    return this.#custom.global;
  }
  getLocal(): Record<number, Partial<DdxOptions>> {
    return this.#custom.local;
  }

  setGlobal(options: Partial<DdxOptions>) {
    this.#custom.setGlobal(options);
  }
  setLocal(name: string, options: Partial<DdxOptions>) {
    this.#custom.setLocal(name, options);
  }

  patchGlobal(options: Partial<DdxOptions>) {
    this.#custom.patchGlobal(options);
  }
  patchLocal(name: string, options: Partial<DdxOptions>) {
    this.#custom.patchLocal(name, options);
  }
}

Deno.test("patchDdxOptions", () => {
  const custom = (new Custom())
    .setGlobal({
      name: "foo",
      path: "",
    })
    .patchGlobal({
      name: "piyo",
    });
  assertEquals(custom.global, {
    name: "piyo",
    path: "",
  });
});

Deno.test("mergeDdxOptions", () => {
  const custom = (new Custom())
    .setGlobal({
      name: "foo",
      path: "",
    })
    .setLocal("foo", {
      path: "bar",
    })
    .patchLocal("foo", {});
  assertEquals(
    custom.get({
      name: "foo",
    }),
    {
      analyzers: [],
      analyzerOptions: {},
      analyzerParams: {},
      length: 1048576,
      name: "foo",
      offset: 0,
      path: "bar",
      ui: "",
      uiOptions: {},
      uiParams: {},
    },
  );
});
