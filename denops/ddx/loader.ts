import type { AnalyzerName, BaseParams, DdxExtType, UiName } from "./types.ts";
import type { BaseUi } from "./base/ui.ts";
import { importPlugin, isDenoCacheIssueError } from "./utils.ts";

import type { Denops } from "@denops/std";
import * as op from "@denops/std/option";
import * as fn from "@denops/std/function";

import { basename } from "@std/path/basename";
import { dirname } from "@std/path/dirname";
import { join } from "@std/path/join";
import { parse } from "@std/path/parse";
import { Lock } from "@core/asyncutil/lock";

type Mod = {
  // deno-lint-ignore no-explicit-any
  mod: any;
  path: string;
};

const PLUGIN_PREFIX = "@ddx";

// Pattern for directories where auto-loadable extensions are placed by type
const TYPE_DIR_PATTERN = `denops/${PLUGIN_PREFIX}-*s`;

// Structured extension module entry point file.
const EXT_ENTRY_POINT_FILE = "main.ts";

export class Loader {
  #analyzers: Record<AnalyzerName, BaseUi<BaseParams>> = {};
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
    await this.#registerLock.lock(async () => {
      try {
        await this.#register(type, path);
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

  async #register(type: DdxExtType, path: string) {
    if (path in this.#checkPaths) {
      return;
    }

    const name = parse(path).name;
    const mod: Mod = {
      mod: undefined,
      path,
    };

    // NOTE: We intentionally use Deno.stat instead of safeStat here. We expect
    // errors to be thrown when paths don't exist or are inaccessible.
    const fileInfo = await Deno.stat(path);

    if (fileInfo.isDirectory) {
      // Load structured extension module
      const entryPoint = join(path, EXT_ENTRY_POINT_FILE);
      mod.mod = await importPlugin(entryPoint);
    } else {
      // Load single-file extension module
      mod.mod = await importPlugin(path);
    }

    let add;
    switch (type) {
      case "ui":
        add = (name: string) => {
          const ui = new mod.mod.Ui();
          ui.name = name;
          this.#uis[ui.name] = ui;
        };
        break;
      case "analyzer":
        add = (name: string) => {
          const analyzer = new mod.mod.Analyzer();
          analyzer.name = name;
          this.#analyzers[analyzer.name] = analyzer;
        };
        break;
    }

    add(name);

    // Check alias
    const aliases = this.getAliasNames(type).filter(
      (k) => this.getAlias(type, k) === name,
    );
    for (const alias of aliases) {
      add(alias);
    }

    this.#checkPaths[path] = true;
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
