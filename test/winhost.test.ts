import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { decodeClixml, parseHostLine, windowsHostScript } from "../src/main/setters/scripts.ts";
import { WinHost } from "../src/main/setters/winhost.ts";

const FAKE = fileURLToPath(new URL("./fixtures/fake-powershell.mjs", import.meta.url));

test("Windows helper script: one process, marked replies, readable errors", () => {
  const s = windowsHostScript();
  assert.match(s, /\$ProgressPreference = 'SilentlyContinue'/);
  assert.match(s, /Add-Type -TypeDefinition @'\n/);
  assert.match(s, /\n'@ \}/);
  assert.match(s, /'fill' = @\('10', '0'\)/);
  assert.match(s, /'span' = 5/);
  assert.match(s, /HKCU:\\Control Panel\\Desktop/);
  assert.ok(!s.includes("${"), "no unfilled template slots");
  assert.deepEqual(parseHostLine('junk @@WALLORA {"id":3,"ok":true,"data":1}\r'), { id: 3, ok: true, data: 1 });
  assert.equal(parseHostLine("@@WALLORA not json"), null);
  assert.equal(parseHostLine("PS C:\\>"), null);
  const clixml = '#< CLIXML\r\n<Objs Version="1.1.0.1"><S S="progress">x</S><S S="Error">Exception calling "SetWallpaper" with "2" argument(s): _x000D__x000A_</S><S S="Error">"The parameter is incorrect. (0x80070057)"_x000D__x000A_</S></Objs>';
  assert.equal(decodeClixml(clixml), 'Exception calling "SetWallpaper" with "2" argument(s): "The parameter is incorrect. (0x80070057)"');
  assert.equal(decodeClixml("plain error\n"), "plain error");
});

test("Windows helper: serial calls, errors, crashes and restarts", async () => {
  const host = new WinHost(FAKE, 2000);
  // Several calls at once are answered in order, by one process.
  const [a, b, c] = await Promise.all([
    host.call<{ echo: { op: string } }>("set", { fit: "fill", items: [{ monitor: null, path: "C:\\a.jpg" }] }),
    host.call<unknown[]>("list"),
    host.call<{ echo: { id: number } }>("ping"),
  ]);
  assert.equal(a.echo.op, "set");
  assert.equal(b.length, 1);
  assert.equal(c.echo.id, 3);
  await assert.rejects(host.call("set", { fit: "fill", items: [{ monitor: null, path: "C:\\bad.jpg" }] }), /parameter is incorrect/);
  // Still alive after an error.
  assert.ok(await host.call("ping"));
  host.stop();

  const crashy = new WinHost(FAKE, 2000);
  process.env.FAKE_PS_MODE = "crash";
  await assert.rejects(crashy.call("set", { fit: "fill", items: [] }), /helper stopped/);
  process.env.FAKE_PS_MODE = "ok";
  assert.ok(await crashy.call("ping"), "restarts after a crash");
  crashy.stop();

  process.env.FAKE_PS_MODE = "hang";
  const slow = new WinHost(FAKE, 400);
  await assert.rejects(slow.call("set", { fit: "fill", items: [] }), /too long/);
  process.env.FAKE_PS_MODE = "ok";
  assert.ok(await slow.call("ping"), "a fresh helper after a timeout");
  slow.stop();

  process.env.FAKE_PS_MODE = "nostart";
  const broken = new WinHost(FAKE, 2000);
  await assert.rejects(broken.call("ping"), /Cannot add type\. Compilation failed/);
  broken.stop();
  delete process.env.FAKE_PS_MODE;
});
