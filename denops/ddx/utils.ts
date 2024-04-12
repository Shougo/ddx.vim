import { Denops } from "./deps.ts";

export async function errorException(
  denops: Denops,
  e: unknown,
  message: string,
) {
  await denops.call(
    "ddx#util#print_error",
    message,
  );
  if (e instanceof Error) {
    await denops.call(
      "ddx#util#print_error",
      e.message,
    );
    if (e.stack) {
      await denops.call(
        "ddx#util#print_error",
        e.stack,
      );
    }
  }
}
