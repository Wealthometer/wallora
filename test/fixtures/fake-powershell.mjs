#!/usr/bin/env node
// Stands in for powershell.exe in tests: speaks the helper's line protocol.
import { createInterface } from "node:readline";
const MARK = "@@WALLORA ";
const mode = process.env.FAKE_PS_MODE ?? "ok";
const say = (o) => process.stdout.write("noise before\r\n" + MARK + JSON.stringify(o) + "\r\n");
if (mode === "nostart") {
  process.stderr.write('#< CLIXML\r\n<Objs Version="1.1.0.1" xmlns="http://schemas.microsoft.com/powershell/2004/04"><S S="Error">Add-Type : Cannot add type._x000D__x000A_</S><S S="Error">Compilation failed_x000D__x000A_</S></Objs>');
  process.exit(1);
}
say({ id: 0, ok: true, data: "ready" });
const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const cmd = JSON.parse(line);
  if (cmd.op === "set" && mode === "crash") process.exit(3);
  if (cmd.op === "set" && mode === "hang") return;
  if (cmd.op === "set" && cmd.items.some((i) => i.path.includes("bad"))) return say({ id: cmd.id, ok: false, error: "The parameter is incorrect." });
  if (cmd.op === "list") return say({ id: cmd.id, ok: true, data: [{ id: "\\\\?\\DISPLAY#A", left: 0, top: 0, right: 1920, bottom: 1080 }] });
  say({ id: cmd.id, ok: true, data: { echo: cmd } });
});
