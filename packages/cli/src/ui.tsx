import { useEffect, useState } from "react";
import { createInterface } from "node:readline/promises";
import { Box, Text, render, useApp, useInput, type Instance } from "ink";
import {
  CLI_VERSION,
  HELP_COMMANDS,
  SODIUM_COMMAND,
  plainResult,
  type CommandResult,
} from "./output";

const ACCENT = "cyan";
const SPINNER_FRAMES = ["◐", "◓", "◑", "◒"];

export interface Choice<T extends string> {
  value: T;
  label: string;
  description: string;
}

export interface ProgressHandle {
  update(label: string): void;
  stop(): void;
}

export function isInteractiveTerminal(): boolean {
  return Boolean(
    process.stdin.isTTY && process.stdout.isTTY && !process.env.CI,
  );
}

function hasVisualTerminal(): boolean {
  return Boolean(
    isInteractiveTerminal() &&
    !process.env.NO_COLOR &&
    !process.env.SODIUM_PLAIN &&
    process.env.TERM !== "dumb",
  );
}

function Brand({ command }: { command?: string }) {
  return (
    <Box gap={1}>
      <Text color={ACCENT} bold>
        ◆ SODIUM
      </Text>
      {command ? <Text dimColor>/ {command}</Text> : null}
    </Box>
  );
}

function toneColor(tone: CommandResult["tone"]): string {
  if (tone === "warning") return "yellow";
  if (tone === "info") return "blue";
  return "green";
}

export function ResultView({ result }: { result: CommandResult }) {
  const details = result.details ?? [];
  const width = Math.max(0, ...details.map(([label]) => label.length));
  const color = toneColor(result.tone);

  return (
    <Box flexDirection="column" marginY={1} width={72}>
      <Brand command={result.command} />
      <Box
        flexDirection="column"
        marginTop={1}
        paddingX={2}
        paddingY={1}
        borderStyle="round"
        borderColor={color}
      >
        <Text color={color} bold>
          {result.tone === "warning" ? "!" : "✓"} {result.title}
        </Text>
        {details.length > 0 ? (
          <Box flexDirection="column" marginTop={1}>
            {details.map(([label, value]) => (
              <Box key={label}>
                <Box width={width + 2}>
                  <Text dimColor>{label}</Text>
                </Box>
                <Text>{String(value)}</Text>
              </Box>
            ))}
          </Box>
        ) : null}
        {result.note ? (
          <Box marginTop={1}>
            <Text dimColor>{result.note}</Text>
          </Box>
        ) : null}
        {result.prompt ? (
          <Box flexDirection="column" marginTop={1}>
            <Text color="yellow">
              {result.promptCopied
                ? "Prompt copied to clipboard"
                : "Copy this prompt"}
            </Text>
            <Box
              marginTop={1}
              paddingLeft={2}
              borderStyle="single"
              borderColor="gray"
            >
              <Text wrap="wrap">{result.prompt}</Text>
            </Box>
          </Box>
        ) : null}
      </Box>
      {result.next ? (
        <Box marginTop={1} gap={1}>
          <Text color={ACCENT}>→</Text>
          <Text>Next: {result.next}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

export function HelpView() {
  const width = Math.max(...HELP_COMMANDS.map(({ name }) => name.length));
  return (
    <Box flexDirection="column" marginY={1} width={72}>
      <Brand />
      <Text dimColor>
        Turn real application flows into observable WebMCP tools.
      </Text>
      <Box marginTop={1}>
        <Text color={ACCENT}>$ {SODIUM_COMMAND} &lt;command&gt;</Text>
      </Box>
      <Box
        flexDirection="column"
        marginTop={1}
        paddingX={2}
        paddingY={1}
        borderStyle="round"
        borderColor="gray"
      >
        {HELP_COMMANDS.map(({ name, description }) => (
          <Box key={name}>
            <Box width={width + 3}>
              <Text color={ACCENT}>{name}</Text>
            </Box>
            <Text>{description}</Text>
          </Box>
        ))}
      </Box>
      <Text dimColor>v{CLI_VERSION} · --plain disables the TUI</Text>
    </Box>
  );
}

export function ErrorView({
  command,
  message,
}: {
  command?: string;
  message: string;
}) {
  return (
    <Box flexDirection="column" marginY={1} width={72}>
      <Brand command={command} />
      <Box
        marginTop={1}
        paddingX={2}
        paddingY={1}
        borderStyle="round"
        borderColor="red"
        flexDirection="column"
      >
        <Text color="red" bold>
          × Command failed
        </Text>
        <Box marginTop={1}>
          <Text wrap="wrap">{message}</Text>
        </Box>
      </Box>
      <Box marginTop={1} gap={1}>
        <Text color="yellow">→</Text>
        <Text>Fix the issue above, then run the command again.</Text>
      </Box>
    </Box>
  );
}

function LoadingView({ label }: { label: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setFrame((current) => (current + 1) % SPINNER_FRAMES.length),
      90,
    );
    return () => clearInterval(timer);
  }, []);
  return (
    <Box marginY={1} gap={1}>
      <Text color={ACCENT}>{SPINNER_FRAMES[frame]}</Text>
      <Text>{label}</Text>
    </Box>
  );
}

function ChoiceView<T extends string>({
  question,
  choices,
  onSelect,
}: {
  question: string;
  choices: Choice<T>[];
  onSelect(value: T): void;
}) {
  const [index, setIndex] = useState(0);
  const { exit } = useApp();
  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setIndex((current) => (current - 1 + choices.length) % choices.length);
    }
    if (key.downArrow || input === "j") {
      setIndex((current) => (current + 1) % choices.length);
    }
    if (key.return) {
      const choice = choices[index];
      if (!choice) return;
      onSelect(choice.value);
      exit();
    }
  });

  return (
    <Box flexDirection="column" marginY={1} width={72}>
      <Brand command="init" />
      <Box marginTop={1}>
        <Text bold>{question}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {choices.map((choice, position) => {
          const active = position === index;
          return (
            <Box
              key={choice.value}
              flexDirection="column"
              marginBottom={position === choices.length - 1 ? 0 : 1}
            >
              <Text color={active ? ACCENT : undefined} bold={active}>
                {active ? "›" : " "} {choice.label}
              </Text>
              {active ? <Text dimColor> {choice.description}</Text> : null}
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓ move · enter select · ctrl+c cancel</Text>
      </Box>
    </Box>
  );
}

export function printResult(result: CommandResult): void {
  if (!hasVisualTerminal()) {
    console.log(plainResult(result));
    return;
  }
  render(<ResultView result={result} />).unmount();
}

export function printHelp(): void {
  if (!hasVisualTerminal()) {
    const width = Math.max(...HELP_COMMANDS.map(({ name }) => name.length));
    console.log(
      [
        `Sodium v${CLI_VERSION}`,
        `Usage: ${SODIUM_COMMAND} <command>`,
        "",
        ...HELP_COMMANDS.map(
          ({ name, description }) =>
            `  ${name.padEnd(width + 2)}${description}`,
        ),
      ].join("\n"),
    );
    return;
  }
  render(<HelpView />).unmount();
}

export function printError(command: string | undefined, message: string): void {
  if (!hasVisualTerminal()) {
    console.error(`Sodium${command ? ` ${command}` : ""} failed: ${message}`);
    return;
  }
  render(<ErrorView command={command} message={message} />, {
    stdout: process.stderr,
  }).unmount();
}

export function printInfo(message: string): void {
  if (!hasVisualTerminal()) {
    console.log(`→ ${message}`);
    return;
  }
  render(
    <Box marginY={1}>
      <Text color={ACCENT}>→</Text>
      <Text> {message}</Text>
    </Box>,
  ).unmount();
}

export function startProgress(label: string): ProgressHandle {
  if (!hasVisualTerminal()) {
    console.log(`… ${label}`);
    return { update: () => {}, stop: () => {} };
  }
  const instance: Instance = render(<LoadingView label={label} />);
  return {
    update(next) {
      instance.rerender(<LoadingView label={next} />);
    },
    stop() {
      instance.unmount();
    },
  };
}

export async function choose<T extends string>(
  question: string,
  choices: Choice<T>[],
): Promise<T> {
  if (!isInteractiveTerminal()) {
    throw new Error("interactive choice requested without a terminal");
  }
  if (!hasVisualTerminal()) {
    console.log(question);
    choices.forEach((choice, index) => {
      console.log(`  ${index + 1}. ${choice.label} — ${choice.description}`);
    });
    const prompt = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      while (true) {
        const answer = await prompt.question("Select an option: ");
        const selected = choices[Number.parseInt(answer, 10) - 1];
        if (selected) return selected.value;
        console.log(`Enter a number from 1 to ${choices.length}.`);
      }
    } finally {
      prompt.close();
    }
  }
  return new Promise<T>((resolve) => {
    render(
      <ChoiceView
        question={question}
        choices={choices}
        onSelect={(value) => resolve(value as T)}
      />,
    );
  });
}
