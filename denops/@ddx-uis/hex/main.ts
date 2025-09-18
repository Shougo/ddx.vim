import {
  ActionFlags,
  type BaseParams,
  type Context,
  type DdxBuffer,
  type DdxOptions,
  type UiOptions,
} from "../../ddx/types.ts";
import { BaseUi, type UiActions } from "../../ddx/base/ui.ts";
import { printError } from "../../ddx/utils.ts";

import type { Denops } from "@denops/std";
import * as op from "@denops/std/option";
import * as fn from "@denops/std/function";
import { batch } from "@denops/std/batch";

export type FloatingBorder =
  | "none"
  | "single"
  | "double"
  | "rounded"
  | "solid"
  | "shadow"
  | string[];

export type HighlightGroup = {
  ascii?: string;
  control?: string;
  escape?: string;
  ff?: string;
  floating?: string;
  newLine?: string;
  null?: string;
  tab?: string;
};

export type SaveParams = {
  path?: string;
};

export type Params = {
  encoding: "utf-8";
  floatingBorder: FloatingBorder;
  highlights: HighlightGroup;
  split: "horizontal" | "vertical" | "floating" | "no";
  splitDirection: "botright" | "topleft";
  winCol: number;
  winHeight: number;
  winRow: number;
  winWidth: number;
};

export class Ui extends BaseUi<Params> {
  #buffers: Record<string, number> = {};
  #namespace: number = 0;

  override async redraw(args: {
    denops: Denops;
    context: Context;
    options: DdxOptions;
    buffer: DdxBuffer;
    uiOptions: UiOptions;
    uiParams: Params;
  }): Promise<void> {
    function arrayBufferToHex(buffer: Uint8Array) {
      return Array.prototype.map.call(
        new Uint8Array(buffer),
        (x) => ("00" + x.toString(16)).slice(-2),
      ).join(" ");
    }

    const bufferName = `ddx-ff-${args.options.name}`;
    const initialized = this.#buffers[args.options.name] ||
      (await fn.bufexists(args.denops, bufferName) &&
        await fn.bufnr(args.denops, bufferName));
    const bufnr = initialized ||
      await this.#initBuffer(args.denops, bufferName);
    const winid = await fn.bufwinid(args.denops, bufnr);

    const hasNvim = args.denops.meta.host == "nvim";
    const floating = args.uiParams.split == "floating" && hasNvim;
    if (winid < 0) {
      const direction = args.uiParams.splitDirection;
      if (args.uiParams.split == "horizontal") {
        const header = `silent keepalt ${direction} `;
        await args.denops.cmd(
          header +
            `sbuffer +resize\\ ${Number(args.uiParams.winHeight)} ${bufnr}`,
        );
      } else if (args.uiParams.split == "vertical") {
        const header = `silent keepalt vertical ${direction} `;
        await args.denops.cmd(
          header +
            `sbuffer +vertical\\ resize\\ ${args.uiParams.winWidth} ${bufnr}`,
        );
      } else if (floating) {
        await args.denops.call("nvim_open_win", bufnr, true, {
          "relative": "editor",
          "row": Number(args.uiParams.winRow),
          "col": Number(args.uiParams.winCol),
          "width": Number(args.uiParams.winWidth),
          "height": Number(args.uiParams.winHeight),
          "border": args.uiParams.floatingBorder,
        });

        await fn.setwinvar(
          args.denops,
          await fn.bufwinnr(args.denops, bufnr),
          "&winhighlight",
          `Normal:${args.uiParams.highlights?.floating ?? "NormalFloat"}`,
        );
      } else if (args.uiParams.split == "no") {
        await args.denops.cmd(`silent keepalt buffer ${bufnr}`);
      } else {
        await printError(
          args.denops,
          `Invalid split param: ${args.uiParams.split}`,
        );
        return;
      }
    }

    await this.#setDefaultParams(args.denops, args.uiParams);

    // NOTE: buffers may be restored
    if (!this.#buffers[args.options.name] || winid < 0) {
      await this.#initOptions(args.denops, args.options, args.uiParams, bufnr);
    }

    this.#buffers[args.options.name] = bufnr;

    let lnum = 1;
    let start = 0;
    const size = args.buffer.getSize();
    const length = 16;

    const modified = await fn.getbufvar(args.denops, bufnr, "&modified");

    while (start < size) {
      const bytes = args.buffer.getBytes(
        start,
        Math.min(length, size - start),
      );

      const address = start.toString(16);
      const padding = " ".repeat((16 - bytes.length) * 3);

      const ascii = (new TextDecoder().decode(bytes)).replaceAll(
        // deno-lint-ignore no-control-regex
        /[\x00-\x1f]/g,
        ".",
      );

      const addressString = ("00000000" + address).slice(-8);

      await fn.setbufline(
        args.denops,
        bufnr,
        lnum,
        `${addressString}: ${arrayBufferToHex(bytes)}${padding} |   ${ascii}`,
      );

      let row = 1;
      for (const byte of bytes) {
        let highlight = "";
        if (byte == 0x00) {
          highlight = args.uiParams.highlights.null ?? "Ignore";
        } else if (byte == 0x09) {
          highlight = args.uiParams.highlights.tab ?? "Special";
        } else if (byte == 0x0a) {
          highlight = args.uiParams.highlights.newLine ?? "Comment";
        } else if (0x01 <= byte && byte <= 0x1f) {
          highlight = args.uiParams.highlights.null ?? "Special";
        } else if (0x20 <= byte && byte <= 0x7f) {
          highlight = args.uiParams.highlights.ascii ?? "";
        } else if (0x80 <= byte && byte <= 0xfe) {
          highlight = args.uiParams.highlights.escape ?? "Statement";
        }

        if (highlight.length > 0) {
          try {
            await args.denops.call(
              "ddx#util#highlight",
              highlight,
              "ddx-byte-highlights",
              1,
              this.#namespace,
              bufnr,
              lnum,
              addressString.length + 3 * row,
              2,
            );
          } catch (_e: unknown) {
            // may be failed
            break;
          }
        }

        row += 1;
      }

      start += length;
      lnum += 1;
    }

    await fn.setbufvar(args.denops, bufnr, "&modified", modified);
  }

  override async quit(args: {
    denops: Denops;
    context: Context;
    options: DdxOptions;
    uiParams: Params;
  }): Promise<void> {
    // Move to the UI window.
    const bufnr = this.#buffers[args.options.name];
    if (!bufnr) {
      return;
    }

    await fn.win_gotoid(
      args.denops,
      await fn.bufwinid(args.denops, bufnr),
    );

    const prevWinnr = await fn.winnr(args.denops, "#");

    for (
      const winid of (await fn.win_findbuf(args.denops, bufnr) as number[])
    ) {
      if (winid <= 0) {
        continue;
      }

      if (
        args.uiParams.split == "no" ||
        !(prevWinnr > 0 && prevWinnr !== await fn.winnr(args.denops))
      ) {
        await fn.setwinvar(args.denops, winid, "&winfixbuf", false);

        await args.denops.cmd(
          args.context.bufNr == this.#buffers[args.options.name] ||
            args.context.bufNr <= 0
            ? "enew"
            : `buffer ${args.context.bufNr}`,
        );
      } else {
        await args.denops.cmd("silent! close!");
        await fn.win_gotoid(args.denops, args.context.winId);
      }
    }
  }

  override actions: UiActions<Params> = {
    change: async (args: {
      denops: Denops;
      context: Context;
      options: DdxOptions;
      buffer: DdxBuffer;
      uiParams: Params;
    }) => {
      // Get address
      const address = await this.#getAddress(args.denops, args.uiParams);
      if (Number.isNaN(address)) {
        await printError(
          args.denops,
          "Invalid address",
        );
        return ActionFlags.Persist;
      }

      const input = await args.denops.call(
        "ddx#ui#hex#input",
        "New value: ",
      ) as string;
      if (input == "") {
        return ActionFlags.Persist;
      }

      const value = parseStrictInt(input, 16);
      if (Number.isNaN(value)) {
        await printError(
          args.denops,
          "Invalid value",
        );
        return ActionFlags.Persist;
      }

      args.buffer.change(address, value);

      const bufnr = this.#buffers[args.options.name];
      await fn.setbufvar(args.denops, bufnr, "&modified", true);

      return ActionFlags.Redraw;
    },
    insert: async (args: {
      denops: Denops;
      context: Context;
      options: DdxOptions;
      buffer: DdxBuffer;
      uiParams: Params;
    }) => {
      // Get address
      const address = await this.#getAddress(args.denops, args.uiParams);
      if (Number.isNaN(address)) {
        await printError(
          args.denops,
          "Invalid address",
        );
        return ActionFlags.Persist;
      }

      const input = await args.denops.call(
        "ddx#ui#hex#input",
        "New value: ",
      ) as string;
      if (input == "") {
        return ActionFlags.Persist;
      }

      const value = parseStrictInt(input, 16);
      if (Number.isNaN(value)) {
        await printError(
          args.denops,
          "Invalid value",
        );
        return ActionFlags.Persist;
      }

      args.buffer.insert(address, new Uint8Array([value]));

      const bufnr = this.#buffers[args.options.name];
      await fn.setbufvar(args.denops, bufnr, "&modified", true);

      return ActionFlags.Redraw;
    },
    remove: async (args: {
      denops: Denops;
      context: Context;
      options: DdxOptions;
      buffer: DdxBuffer;
      uiParams: Params;
    }) => {
      // Get address
      const address = await this.#getAddress(args.denops, args.uiParams);
      if (Number.isNaN(address)) {
        await printError(
          args.denops,
          "Invalid address",
        );
        return ActionFlags.Persist;
      }

      args.buffer.remove(address);

      const bufnr = this.#buffers[args.options.name];
      await fn.setbufvar(args.denops, bufnr, "&modified", true);

      return ActionFlags.Redraw;
    },
    save: async (args: {
      denops: Denops;
      context: Context;
      options: DdxOptions;
      buffer: DdxBuffer;
      actionParams: BaseParams;
    }) => {
      const params = args.actionParams as SaveParams;

      await args.buffer.write(params.path ?? "");

      await args.denops.call(
        "ddx#util#print",
        `Saved to "${params.path ?? args.buffer.getPath()}"`,
      );

      const bufnr = this.#buffers[args.options.name];
      await fn.setbufvar(args.denops, bufnr, "&modified", false);

      return ActionFlags.None;
    },
    quit: async (args: {
      denops: Denops;
      context: Context;
      options: DdxOptions;
      uiParams: Params;
    }) => {
      await this.quit({
        denops: args.denops,
        context: args.context,
        options: args.options,
        uiParams: args.uiParams,
      });

      return ActionFlags.None;
    },
  };

  override params(): Params {
    return {
      encoding: "utf-8",
      floatingBorder: "none",
      highlights: {},
      split: "horizontal",
      splitDirection: "botright",
      winCol: 0,
      winHeight: 20,
      winRow: 0,
      winWidth: 0,
    };
  }

  async #initBuffer(
    denops: Denops,
    bufferName: string,
  ): Promise<number> {
    const bufnr = await fn.bufadd(denops, bufferName);
    await fn.bufload(denops, bufnr);

    if (denops.meta.host === "nvim") {
      this.#namespace = await denops.call(
        "nvim_create_namespace",
        "ddx-ui-hex",
      ) as number;
    }

    return bufnr;
  }

  async #initOptions(
    denops: Denops,
    options: DdxOptions,
    uiParams: Params,
    bufnr: number,
  ): Promise<void> {
    const winid = await fn.bufwinid(denops, bufnr);
    const existsWinFixBuf = await fn.exists(denops, "+winfixbuf");

    await batch(denops, async (denops: Denops) => {
      await fn.setbufvar(denops, bufnr, "ddx_ui_name", options.name);

      // Set options
      await fn.setwinvar(denops, winid, "&list", 0);
      await fn.setwinvar(denops, winid, "&colorcolumn", "");
      await fn.setwinvar(denops, winid, "&cursorline", 1);
      await fn.setwinvar(denops, winid, "&foldcolumn", 0);
      await fn.setwinvar(denops, winid, "&foldenable", 0);
      await fn.setwinvar(denops, winid, "&number", 0);
      await fn.setwinvar(denops, winid, "&relativenumber", 0);
      await fn.setwinvar(denops, winid, "&signcolumn", "no");
      await fn.setwinvar(denops, winid, "&spell", 0);
      await fn.setwinvar(denops, winid, "&wrap", 0);
      await fn.setwinvar(denops, winid, "&signcolumn", "no");
      if (existsWinFixBuf && uiParams.split !== "no") {
        await fn.setwinvar(denops, winid, "&winfixbuf", true);
      }

      await fn.setbufvar(denops, bufnr, "&bufhidden", "unload");
      await fn.setbufvar(denops, bufnr, "&buftype", "acwrite");
      await fn.setbufvar(denops, bufnr, "&filetype", "ddx-hex");
      await fn.setbufvar(denops, bufnr, "&swapfile", 0);
      await fn.setbufvar(denops, bufnr, "&modified", false);

      if (uiParams.split == "horizontal") {
        await fn.setbufvar(denops, bufnr, "&winfixheight", 1);
      } else if (uiParams.split == "vertical") {
        await fn.setbufvar(denops, bufnr, "&winfixwidth", 1);
      }
    });
  }

  async #setDefaultParams(denops: Denops, uiParams: Params) {
    if (uiParams.winRow == 0) {
      uiParams.winRow = Math.trunc(
        (await denops.call("eval", "&lines") as number) / 2 - 10,
      );
    }
    if (uiParams.winCol == 0) {
      uiParams.winCol = Math.trunc(
        (await op.columns.getGlobal(denops)) / 4,
      );
    }
    if (uiParams.winWidth == 0) {
      uiParams.winWidth = Math.trunc((await op.columns.getGlobal(denops)) / 2);
    }
  }

  async #getAddress(denops: Denops, uiParams: Params) {
    const currentLine = await fn.getline(denops, ".");
    const curText = await denops.call(
      "ddx#ui#hex#get_cur_text",
      currentLine,
      await fn.col(denops, "."),
    );
    const [_type, addressString] = await denops.call(
      "ddx#ui#hex#parse_address",
      currentLine,
      curText,
      uiParams.encoding,
    ) as string[];

    return parseStrictInt(String(addressString), 16);
  }
}

function parseStrictInt(str: string, radix: number = 10): number {
  if (typeof str !== "string" || str.trim() === "") {
    return NaN;
  }

  if (!/^-?\d+$/.test(str.trim())) {
    return NaN;
  }

  let pattern: RegExp;
  switch (radix) {
    case 2:
      pattern = /^-?[01]+$/;
      break;
    case 8:
      pattern = /^-?[0-7]+$/;
      break;
    case 10:
      pattern = /^-?\d+$/;
      break;
    case 16:
      pattern = /^-?[0-9a-fA-F]+$/;
      break;
    default:
      return NaN;
  }

  if (!pattern.test(str.trim())) {
    return NaN;
  }
  const n = parseInt(str, radix);
  return Number.isNaN(n) ? NaN : n;
}
