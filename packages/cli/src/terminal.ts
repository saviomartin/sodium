import { spawn } from "node:child_process";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function agentShellCommand(
  cwd: string,
  command: string,
  args: string[],
): string {
  return `cd ${shellQuote(cwd)} && exec ${[command, ...args].map(shellQuote).join(" ")}`;
}

function spawnDetached(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.once("error", () => resolve(false));
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
  });
}

function runLauncher(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.once("error", () => resolve(false));
    child.once("exit", (code) => resolve(code === 0));
  });
}

async function resolveCommand(command: string): Promise<string | null> {
  return new Promise((resolve) => {
    const lookup = process.platform === "win32" ? "where" : "which";
    const child = spawn(lookup, [command], { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.once("error", () => resolve(null));
    child.once("exit", (code) =>
      resolve(code === 0 ? output.trim().split(/\r?\n/)[0] || null : null),
    );
  });
}

export async function openAgentTerminal(
  cwd: string,
  command: string,
  args: string[],
): Promise<boolean> {
  const executable = await resolveCommand(command);
  if (!executable) return false;
  const script = agentShellCommand(cwd, executable, args);

  if (process.platform === "darwin") {
    const directory = await mkdtemp(join(tmpdir(), "sodium-agent-"));
    const launcher = join(directory, "launch.command");
    await writeFile(
      launcher,
      [
        "#!/bin/sh",
        'launcher="$0"',
        'launcher_dir=$(dirname "$launcher")',
        'rm -f -- "$launcher"',
        'rmdir -- "$launcher_dir" 2>/dev/null || true',
        script,
        "",
      ].join("\n"),
      { mode: 0o700 },
    );
    await chmod(launcher, 0o700);
    return runLauncher("open", ["-na", "Terminal.app", launcher]);
  }

  if (process.platform === "win32") {
    return spawnDetached("cmd", ["/c", "start", "", "cmd", "/k", script]);
  }

  const candidates: Array<[string, string[]]> = [
    ["x-terminal-emulator", ["-e", "bash", "-lc", script]],
    ["gnome-terminal", ["--", "bash", "-lc", script]],
    ["konsole", ["-e", "bash", "-lc", script]],
    ["xterm", ["-e", "bash", "-lc", script]],
  ];
  for (const [terminal, terminalArgs] of candidates) {
    const executableTerminal = await resolveCommand(terminal);
    if (executableTerminal) {
      return spawnDetached(executableTerminal, terminalArgs);
    }
  }
  return false;
}
