import type { AnalyzerName, BaseParams, DdxExtType, UiName } from "./types.ts";
import type { BaseUi } from "./base/ui.ts";
import type { BaseAnalyzer } from "./base/analyzer.ts";
import { importPlugin, isDenoCacheIssueError } from "./utils.ts";

import type { Denops } from "@denops/std";
import * as op from "@denops/std/option";
import * as fn from "@denops/std/function";

import { basename } from "@std/path/basename";
import { dirname } from "@std/path/dirname";
import { join } from "@std/path/join";
import { parse } from "@std/path/parse";
import { Lock } from "@core/asyncutil/lock";

const PLUGIN_PREFIX = "@ddx";

// Pattern for directories where auto-loadable extensions are placed by type
const TYPE_DIR_PATTERN = `denops/${PLUGIN_PREFIX}-*s`;

// Structured extension module entry point file.
const EXT_ENTRY_POINT_FILE = "main.ts";

export class Loader {
  #analyzers: Record<AnalyzerName, BaseAnalyzer<BaseParams>> = {};
  #uis: Record<UiName, BaseUi<BaseParams>> = {};
  #aliases: Record<DdxExtType, Record<string, string>> = {
    analyzer: {},
    ui: {},
  };
  #checkPaths: Record<string, boolean> = {};
  #registerLock = new Lock(0);
  #cachedPaths = new Map<string, string>();
  #prevRuntimepath = "";

  async autoload(
    denops: Denops,
    type: DdxExtType,
    name: string,
  ) {
    const runtimepath = await op.runtimepath.getGlobal(denops);
    if (runtimepath !== this.#prevRuntimepath) {
      const cachedPaths = await createPathCache(denops, runtimepath);

      // NOTE: glob may be invalid.
      if (cachedPaths.size > 0) {
        this.#cachedPaths = cachedPaths;
        this.#prevRuntimepath = runtimepath;
      }
    }

    const key = `${PLUGIN_PREFIX}-${type}s/${
      this.getAlias(type, name) ?? name
    }`;
    const path = this.#cachedPaths.get(key);

    if (!path) {
      return this.#prevRuntimepath === "";
    }

    await this.registerPath(type, path);
    return true;
  }

  registerAlias(type: DdxExtType, alias: string, base: string) {
    this.#aliases[type][alias] = base;
  }

  async registerPath(type: DdxExtType, path: string): Promise<void> {
    // Fast-path: skip I/O if already registered.
    if (path in this.#checkPaths) {
      return;
    }

    const name = parse(path).name;

    // Perform I/O outside the lock so concurrent calls run in parallel.
    // NOTE: We intentionally use Deno.stat instead of safeStat here. We expect
    // errors to be thrown when paths don't exist or are inaccessible.
    // deno-lint-ignore no-explicit-any
    let importedMod: any;
    try {
      const fileInfo = await Deno.stat(path);
      const entryPoint = fileInfo.isDirectory
        ? join(path, EXT_ENTRY_POINT_FILE)
        : path;
      importedMod = await importPlugin(entryPoint);
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

    // Update shared state under lock; re-check to avoid duplicate registration
    // by concurrent calls that passed the fast-path check simultaneously.
    await this.#registerLock.lock(() => {
      if (path in this.#checkPaths) {
        return;
      }

      const register = (n: string) => {
        switch (type) {
          case "ui": {
            const ui = new importedMod.Ui();
            ui.name = n;
            this.#uis[n] = ui;
            break;
          }
          case "analyzer": {
            const analyzer = new importedMod.Analyzer();
            analyzer.name = n;
            this.#analyzers[n] = analyzer;
            break;
          }
        }
      };

      register(name);

      // Check alias
      const aliases = this.getAliasNames(type).filter(
        (k) => this.getAlias(type, k) === name,
      );
      for (const alias of aliases) {
        register(alias);
      }

      this.#checkPaths[path] = true;
    });
  }

  async registerPaths(type: DdxExtType, paths: string[]): Promise<void> {
    const results = await Promise.allSettled(
      paths.map((path) => this.registerPath(type, path)),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        console.error(
          `registerPaths: failed to register a path: ${result.reason}`,
        );
      }
    }
  }

  getAliasNames(type: DdxExtType) {
    return Object.keys(this.#aliases[type]);
  }
  getAlias(type: DdxExtType, name: string) {
    return this.#aliases[type][name];
  }
  getUi(name: UiName) {
    return this.#uis[name];
  }
  getAnalyzer(name: AnalyzerName) {
    return this.#analyzers[name];
  }
}

async function createPathCache(
  denops: Denops,
  runtimepath: string,
): Promise<Map<string, string>> {
  const extFileGlob = await globpath(
    denops,
    runtimepath,
    `${TYPE_DIR_PATTERN}/*.ts`,
  );
  const extDirEntryPointGlob = await globpath(
    denops,
    runtimepath,
    `${TYPE_DIR_PATTERN}/*/${EXT_ENTRY_POINT_FILE}`,
  );

  // Create key paths for both single-file and directory entry points.
  // Prioritize the first occurrence key in keyPaths.
  const keyPaths: Readonly<[key: string, path: string]>[] = [
    //   1. `{name}.ts`
    ...extFileGlob.map((extFile) => {
      const { name, dir: typeDir } = parse(extFile);
      const typeDirName = basename(typeDir);
      const key = `${typeDirName}/${name}`;
      return [key, extFile] as const;
    }),
    //   2. `{name}/main.ts`
    ...extDirEntryPointGlob.map((entryPoint) => {
      const extDir = dirname(entryPoint);
      const { base: name, dir: typeDir } = parse(extDir);
      const typeDirName = basename(typeDir);
      const key = `${typeDirName}/${name}`;
      return [key, extDir] as const;
    }),
  ];

  // Remove duplicate keys.
  // Note that `Map` prioritizes the later value, so need to reversed.
  const cache = new Map(keyPaths.toReversed());

  return cache;
}

async function globpath(
  denops: Denops,
  path: string,
  pattern: string,
): Promise<string[]> {
  return await fn.globpath(denops, path, pattern, 1, 1) as unknown as string[];
}
