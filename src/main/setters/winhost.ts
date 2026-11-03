import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { decodeClixml, encodePowerShell, parseHostLine, windowsHostScript, type HostReply } from "./scripts.ts";

type Pending = { id: number; line: string; resolve: (v: unknown) => void; reject: (e: Error) => void; timer?: NodeJS.Timeout };

/**
 * Runs Wallora's PowerShell helper (see windowsHostScript) and talks to it one command at a time.
 * Starting PowerShell and compiling the shim takes a second or two, so the process is kept alive
 * and restarted only if it dies or stops answering.
 */
export class WinHost {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private queue: Pending[] = [];
  private current: Pending | null = null;
  private seq = 0;
  private buf = "";
  private stderr = "";
  private readonly exe: string;
  private readonly timeoutMs: number;

  constructor(exe = "powershell.exe", timeoutMs = 30_000) {
    this.exe = exe;
    this.timeoutMs = timeoutMs;
  }

  call<T>(op: string, args: Record<string, unknown> = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = ++this.seq;
      this.queue.push({ id, line: JSON.stringify({ id, op, ...args }), resolve: resolve as (v: unknown) => void, reject });
      void this.pump();
    });
  }

  stop() {
    this.proc?.kill();
    this.proc = null;
    this.ready = null;
  }

  private start(): Promise<void> {
    this.ready ??= new Promise<void>((resolve, reject) => {
      this.buf = "";
      this.stderr = "";
      const p = spawn(this.exe, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodePowerShell(windowsHostScript())], { windowsHide: true });
      this.proc = p;
      let started = false;
      const startTimer = setTimeout(() => fail(new Error("The Windows wallpaper helper took too long to start")), 45_000);
      const fail = (e: Error) => {
        clearTimeout(startTimer);
        // A helper we already replaced (after a timeout) exiting late: nothing to clean up.
        if (this.proc !== p) {
          if (!started) reject(e);
          return;
        }
        this.ready = null;
        this.proc = null;
        p.kill();
        if (!started) reject(e);
        const cur = this.current;
        this.current = null;
        if (cur) {
          clearTimeout(cur.timer);
          cur.reject(e);
        }
        void this.pump();
      };
      p.stdout.setEncoding("utf8");
      p.stderr.setEncoding("utf8");
      p.stdout.on("data", (chunk: string) => {
        this.buf += chunk;
        let nl: number;
        while ((nl = this.buf.indexOf("\n")) >= 0) {
          const line = this.buf.slice(0, nl);
          this.buf = this.buf.slice(nl + 1);
          const r = parseHostLine(line);
          if (!r) continue;
          if (r.id === 0) {
            clearTimeout(startTimer);
            if (r.ok) {
              started = true;
              resolve();
            } else fail(new Error(r.error ?? "The Windows wallpaper helper didn't start"));
            continue;
          }
          this.answer(r);
        }
      });
      p.stderr.on("data", (chunk: string) => {
        this.stderr = (this.stderr + chunk).slice(-20_000);
      });
      p.on("error", (e) => fail(new Error(`Couldn't start PowerShell: ${e.message}`)));
      p.on("exit", (code) => fail(new Error(`The Windows wallpaper helper stopped (${code ?? "killed"}). ${decodeClixml(this.stderr).slice(0, 200)}`.trim())));
    });
    return this.ready;
  }

  private answer(r: HostReply) {
    const cur = this.current;
    if (!cur || cur.id !== r.id) return;
    clearTimeout(cur.timer);
    this.current = null;
    if (r.ok) cur.resolve(r.data);
    else cur.reject(new Error(r.error ?? "Windows reported an error"));
    void this.pump();
  }

  private async pump() {
    if (this.current || !this.queue.length) return;
    const next = this.queue.shift()!;
    this.current = next;
    try {
      await this.start();
    } catch (e) {
      if (this.current === next) this.current = null;
      next.reject(e as Error);
      void this.pump();
      return;
    }
    if (this.current !== next) return;
    next.timer = setTimeout(() => {
      // No answer: restart the helper so the next command gets a fresh one.
      this.current = null;
      next.reject(new Error("Windows took too long to change the wallpaper"));
      this.stop();
      void this.pump();
    }, this.timeoutMs);
    this.proc?.stdin.write(next.line + "\n");
  }
}
