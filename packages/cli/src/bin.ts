import {
  defaultContext,
  deployCommand,
  doctorCommand,
  initCommand,
  loginCommand,
  validateCommand,
} from "./commands";

const [command, ...args] = process.argv.slice(2);
const context = defaultContext();

async function main() {
  switch (command) {
    case "login":
      await loginCommand(context);
      break;
    case "init":
      await initCommand(context, {
        skipInstall: args.includes("--skip-install"),
      });
      break;
    case "validate":
      await validateCommand(context);
      break;
    case "deploy":
      await deployCommand(context);
      break;
    case "doctor":
      await doctorCommand(context);
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      console.log("Usage: sodium <login|init|validate|deploy|doctor>");
      break;
    default:
      throw new Error(`unknown command ${command}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
