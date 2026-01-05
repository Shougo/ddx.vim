import { Ddx } from "./ddx.ts";
import type { DdxExtType, DdxOptions } from "./types.ts";
import type { ExtractedString } from "./buffer.ts";
import type { AnalyzeResult, AnalyzeValue } from "./base/analyzer.ts";
import {
  ContextBuilder,
  defaultContext,
  defaultDdxOptions,
} from "./context.ts";
import { Loader } from "./loader.ts";
import { uiAction } from "./ext.ts";
import {
  type BinaryDiff,
  calculateBinaryDiff,
  importPlugin,
  isDenoCacheIssueError,
} from "./utils.ts";

import type { Denops, Entrypoint } from "@denops/std";

import { Lock } from "@core/asyncutil/lock";
import { ensure } from "@core/unknownutil/ensure";
import { is } from "@core/unknownutil/is";

export const main: Entrypoint = (denops: Denops) => {
  const loaders: Record<string, Loader> = {};
  const ddxs: Record<string, Ddx[]> = {};
  const contextBuilder = new ContextBuilder();
  const globalAliases: Record<DdxExtType, Record<string, string>> = {
    analyzer: {},
    ui: {},
  };
  const lock = new Lock(0);

  const getDdx = (name: string) => {
    if (!ddxs[name]) {
      ddxs[name] = [];
    }
    if (ddxs[name].length == 0) {
      ddxs[name].push(new Ddx(getLoader(name)));
    }
    return ddxs[name].slice(-1)[0];
  };
  const getLoader = (name: string) => {
    if (!loaders[name]) {
      loaders[name] = new Loader();

      // Set global aliases
      for (const [type, val] of Object.entries(globalAliases)) {
        for (const [alias, base] of Object.entries(val)) {
          loaders[name].registerAlias(type as DdxExtType, alias, base);
        }
      }
    }

    return loaders[name];
  };
  const setAlias = (
    name: string,
    type: DdxExtType,
    alias: string,
    base: string,
  ) => {
    if (name === "_") {
      globalAliases[type][alias] = base;
    } else {
      const loader = getLoader(name);
      loader.registerAlias(type, alias, base);
    }
  };

  denops.dispatcher = {
    setGlobal(arg1: unknown): Promise<void> {
      const options = ensure(arg1, is.Record) as Partial<DdxOptions>;
      contextBuilder.setGlobal(options);
      return Promise.resolve();
    },
    setLocal(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensure(arg1, is.Record) as Partial<DdxOptions>;
      const name = ensure(arg2, is.String);
      contextBuilder.setLocal(name, options);
      return Promise.resolve();
    },
    patchGlobal(arg1: unknown): Promise<void> {
      const options = ensure(arg1, is.Record) as Partial<DdxOptions>;
      contextBuilder.patchGlobal(options);
      return Promise.resolve();
    },
    patchLocal(arg1: unknown, arg2: unknown): Promise<void> {
      const options = ensure(arg1, is.Record) as Partial<DdxOptions>;
      const name = ensure(arg2, is.String);
      contextBuilder.patchLocal(name, options);
      return Promise.resolve();
    },
    getGlobal(): Promise<Partial<DdxOptions>> {
      return Promise.resolve(contextBuilder.getGlobal());
    },
    getLocal(): Promise<Partial<DdxOptions>> {
      return Promise.resolve(contextBuilder.getLocal());
    },
    getCurrent(arg1: unknown): Promise<Partial<DdxOptions>> {
      const name = ensure(arg1, is.String);
      const ddx = getDdx(name);
      return Promise.resolve(ddx.getOptions());
    },
    getDefaultOptions(): Promise<Partial<DdxOptions>> {
      return Promise.resolve(defaultDdxOptions());
    },
    alias(arg1: unknown, arg2: unknown, arg3: unknown): Promise<void> {
      const extType = ensure(arg1, is.String) as DdxExtType;
      const alias = ensure(arg2, is.String);
      const base = ensure(arg3, is.String);

      globalAliases[extType][alias] = base;
      return Promise.resolve();
    },
    async loadConfig(arg1: unknown): Promise<void> {
      //const startTime = Date.now();
      await lock.lock(async () => {
        const path = ensure(arg1, is.String);

        try {
          const mod = await importPlugin(path);
          // deno-lint-ignore no-explicit-any
          const obj = new (mod as any).Config();
          await obj.config({ denops, contextBuilder, setAlias });
        } catch (e) {
          if (isDenoCacheIssueError(e)) {
            console.warn("*".repeat(80));
            console.warn(`Deno module cache issue is detected.`);
            console.warn(
              `Execute '!deno cache --reload "${path}"' and restart Vim/Neovim.`,
            );
            console.warn("*".repeat(80));
          }

          console.error(`Failed to load file '${path}': ${e}`);
          throw e;
        }
      });
      //console.log(`${Date.now() - startTime} ms`);
      return Promise.resolve();
    },
    async start(arg1: unknown): Promise<void> {
      const userOptions = ensure(arg1, is.Record) as DdxOptions;

      const [_, options] = await contextBuilder.get(denops, userOptions);

      const ddx = getDdx(options.name);

      await ddx.start(
        denops,
        options,
      );
    },
    async restart(arg1: unknown): Promise<void> {
      const name = ensure(arg1, is.String);

      const ddx = getDdx(name);

      await ddx.restart(denops);
    },
    async redraw(arg1: unknown): Promise<void> {
      const name = ensure(arg1, is.String);

      const ddx = getDdx(name);

      await ddx.redraw(denops);
    },
    async uiAction(
      arg1: unknown,
      arg2: unknown,
      arg3: unknown,
    ): Promise<void> {
      const name = ensure(arg1, is.String);
      const actionName = ensure(arg2, is.String);
      const params = ensure(arg3, is.Record);

      const ddx = getDdx(name);

      await uiAction(
        denops,
        getLoader(name),
        defaultContext(),
        ddx.getOptions(),
        ddx.getBuffer(),
        ddx.getAnotherBuffer(),
        actionName,
        params,
      );
    },
    async analyze(
      arg1: unknown,
    ): Promise<AnalyzeResult[]> {
      const name = ensure(arg1, is.String);
      if (name.length === 0) {
        return [];
      }

      const ddx = getDdx(name);

      return await ddx.analyze(denops);
    },
    change(
      arg1: unknown,
      arg2: unknown,
      arg3: unknown,
    ) {
      const name = ensure(arg1, is.String);
      const value = ensure(
        arg2,
        is.ObjectOf({
          name: is.String,
          rawType: is.String,
        }),
      ) as AnalyzeValue;
      const newValue = ensure(arg3, is.UnionOf([is.Number, is.String]));

      if (name.length === 0) {
        return;
      }

      const ddx = getDdx(name);

      ddx.change(value, newValue);
    },
    async jump(
      arg1: unknown,
      arg2: unknown,
    ): Promise<void> {
      const name = ensure(arg1, is.String);
      const address = ensure(arg2, is.Number);
      if (name.length === 0) {
        return;
      }

      const ddx = getDdx(name);

      await ddx.jump(denops, address);
    },
    getDiff(
      arg1: unknown,
    ): BinaryDiff[] {
      const name = ensure(arg1, is.String);
      if (name.length === 0) {
        return [];
      }

      const ddx = getDdx(name);
      const baseAddress = ddx.getOptions().offset;
      const size = ddx.getBuffer().getSize();
      const bytes = ddx.getBuffer().getBytes(baseAddress, size);
      const anotherBytes = ddx.getAnotherBuffer().getBytes(baseAddress, size);

      return calculateBinaryDiff(bytes, anotherBytes);
    },
    get_strings(
      arg1: unknown,
      arg2: unknown,
      arg3: unknown,
    ): ExtractedString[] {
      const name = ensure(arg1, is.String);
      const minLength = ensure(arg2, is.Number);
      const encoding = ensure(arg3, is.String);
      if (name.length === 0) {
        return [];
      }

      const ddx = getDdx(name);

      return ddx.getBuffer().searchStrings(encoding, minLength);
    },
  };
};
