import { nativeImage } from "electron";
import { readFile } from "node:fs/promises";
import { extractPalette } from "../shared/color.ts";
import type { Decoder } from "./importer.ts";

/**
 * Reads a picture with Electron's built-in decoder: its size, a 480 px JPEG thumbnail, and a
 * colour palette from a 64 px copy. Decoding runs on the main thread, so the importer yields
 * between files to keep the window responsive.
 */
export const decode: Decoder = async (path) => {
  const bytes = await readFile(path);
  const img = nativeImage.createFromBuffer(bytes);
  if (img.isEmpty()) throw new Error("This picture couldn't be opened (it may be damaged or in an unsupported format)");
  const { width, height } = img.getSize();
  if (width < 16 || height < 16) throw new Error("This picture is too small to use as a wallpaper");
  const small = img.resize({ width: 64, height: Math.max(1, Math.round((64 * height) / width)), quality: "good" });
  const palette = extractPalette(small.toBitmap(), { bgra: true });
  const thumb = img.resize({ width: Math.min(480, width), quality: "better" }).toJPEG(82);
  await new Promise((r) => setImmediate(r));
  return { width, height, palette, thumb };
};
