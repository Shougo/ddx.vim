import { assertEquals, Denops, fn } from "./deps.ts";
import { Context, DdxOptions } from "./types.ts";

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
  };
}

export function defaultDdxOptions(): DdxOptions {
  return {
    name: "default",
    path: "",
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

  return Object.assign(overwritten, {});
}

function patchDdxOptions(
  a: Partial<DdxOptions>,
  b: Partial<DdxOptions>,
): Partial<DdxOptions> {
  const overwritten: Partial<DdxOptions> = { ...a, ...b };

  return overwritten;
}

// Customization by end users
class Custom {
  global: Partial<DdxOptions> = {};
  local: Record<string, Partial<DdxOptions>> = {};

  get(userOptions: Record<string, unknown>): DdxOptions {
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
  private custom: Custom = new Custom();

  async get(
    denops: Denops,
    options: Record<string, unknown>,
  ): Promise<[Context, DdxOptions]> {
    return [
      {
        ...defaultContext(),
        bufNr: await fn.bufnr(denops, "%"),
      },
      this.custom.get(options),
    ];
  }

  getGlobal(): Partial<DdxOptions> {
    return this.custom.global;
  }
  getLocal(): Record<number, Partial<DdxOptions>> {
    return this.custom.local;
  }

  setGlobal(options: Partial<DdxOptions>) {
    this.custom.setGlobal(options);
  }
  setLocal(name: string, options: Partial<DdxOptions>) {
    this.custom.setLocal(name, options);
  }

  patchGlobal(options: Partial<DdxOptions>) {
    this.custom.patchGlobal(options);
  }
  patchLocal(name: string, options: Partial<DdxOptions>) {
    this.custom.patchLocal(name, options);
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
      name: "foo",
      path: "bar",
    },
  );
});
