import {
  defaultContext,
  deployCommand,
  doctorCommand,
  initCommand,
  loginCommand,
  validateCommand,
  type AgentChoice,
} from "./commands";
import { CLI_VERSION } from "./output";
import { printError, printHelp } from "./ui";

const rawArguments = process.argv.slice(2);
if (rawArguments.includes("--plain")) process.env.SODIUM_PLAIN = "1";
const [command, ...args] = rawArguments.filter(
  (argument) => argument !== "--plain",
);
const context = defaultContext();

function valueFor(name: string): string | undefined {
  const exact = args.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function agentChoice(): AgentChoice | undefined {
  const value = valueFor("--agent");
  if (!value) return undefined;
  if (["codex", "claude", "gemini", "other", "none"].includes(value)) {
    return value as AgentChoice;
  }
  throw new Error(
    `Unknown agent "${value}". Use codex, claude, gemini, other, or none.`,
  );
}

async function main() {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }
  switch (command) {
    case "login":
      await loginCommand(context);
      break;
    case "init":
      await initCommand(context, {
        skipInstall: args.includes("--skip-install"),
        agent: agentChoice(),
        name: valueFor("--name"),
      });
      break;
    case "validate":
      await validateCommand(context);
      break;
    case "deploy":
      await deployCommand(context, {
        open: args.includes("--no-open") ? false : undefined,
      });
      break;
    case "doctor":
      if (args.includes("--url") && !valueFor("--url")) {
        throw new Error("--url requires an application URL");
      }
      await doctorCommand(context, { url: valueFor("--url") });
      break;
    case "--version":
    case "-v":
      console.log(CLI_VERSION);
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;
    default:
      throw new Error(
        `Unknown command "${command}". Run with --help to see commands.`,
      );
  }
}

main().catch((error) => {
  printError(command, error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
