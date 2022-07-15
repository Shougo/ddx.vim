import { Denops, fn, op, parse, toFileUrl } from "./deps.ts";
import { BaseUi, DdxExtType, DdxOptions } from "./types.ts";
import { defaultDdxOptions } from "./context.ts";
import { readRange } from "https://deno.land/std@0.147.0/io/files.ts";

export class Ddx {
  private uis: Record<string, BaseUi<Record<string, unknown>>> = {};
  private aliases: Record<DdxExtType, Record<string, string>> = {
    ui: {},
  };

  private checkPaths: Record<string, boolean> = {};
  private options: DdxOptions = defaultDdxOptions();
  private userOptions: Record<string, unknown> = {};

  async start(
    _denops: Denops,
    path: string,
  ): Promise<void> {
    const file = await Deno.open(path, { read: true });
    const bytes = await readRange(file, { start: 0, end: 15 });

    function arrayBufferToHex(buffer: Uint8Array) {
      return Array.prototype.map.call(
        new Uint8Array(buffer),
        (x) => ("00" + x.toString(16)).slice(-2),
      ).join("");
    }

    console.log(arrayBufferToHex(bytes));
  }

  async register(type: DdxExtType, path: string, name: string) {
    if (path in this.checkPaths) {
      return;
    }
    this.checkPaths[path] = true;

    const mod = await import(toFileUrl(path).href);

    let add;
    switch (type) {
      case "ui":
        add = (name: string) => {
          const ui = new mod.Ui();
          ui.name = name;
          this.uis[ui.name] = ui;
        };
        break;
    }

    add(name);

    // Check alias
    const aliases = Object.keys(this.aliases[type]).filter(
      (k) => this.aliases[type][k] == name,
    );
    for (const alias of aliases) {
      add(alias);
    }
  }

  async autoload(
    denops: Denops,
    type: DdxExtType,
    names: string[],
  ): Promise<string[]> {
    if (names.length == 0) {
      return [];
    }

    const runtimepath = await op.runtimepath.getGlobal(denops);

    async function globpath(
      searches: string[],
      files: string[],
    ): Promise<string[]> {
      let paths: string[] = [];
      for (const search of searches) {
        for (const file of files) {
          paths = paths.concat(
            await fn.globpath(
              denops,
              runtimepath,
              search + file + ".ts",
              1,
              1,
            ) as string[],
          );
        }
      }

      return paths;
    }

    const paths = await globpath(
      [`denops/@ddx-${type}s/`],
      names.map((file) => this.aliases[type][file] ?? file),
    );

    await Promise.all(paths.map(async (path) => {
      await this.register(type, path, parse(path).name);
    }));

    return paths;
  }

  getOptions() {
    return this.options;
  }

  getUserOptions() {
    return this.userOptions;
  }
}
