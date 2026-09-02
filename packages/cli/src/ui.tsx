import { useEffect, useState } from "react";
import { createInterface } from "node:readline/promises";
import {
  Box,
  Text,
  render,
  useApp,
  useInput,
  useStdout,
  type Instance,
} from "ink";
import {
  CLI_VERSION,
  HELP_COMMANDS,
  SODIUM_COMMAND,
  plainResult,
  type CommandResult,
} from "./output";

const ACCENT = "#22d3ee";
const ACCENT_MUTED = "#0891b2";
const ACCENT_SHADOW = "#164e63";
const ACCENT_MUTED_SHADOW = "#083344";
const MUTED = "#737373";
const SUCCESS = "#22c55e";
const WARNING = "#facc15";
const SPINNER_FRAMES = ["◐", "◓", "◑", "◒"];
const INCREMENTAL_RENDER = { incrementalRendering: true } as const;
const LOGO = {
  left: ["█▀▀▀ █▀▀█ █▀▀▄", "^^^█ █__█ █__█", "▀▀▀▀ ▀▀▀▀ ▀▀▀ "],
  right: ["▀█▀ █  █ █▄ ▄█", "_█_ █__█ █ ▀ █", "▀▀▀ ▀▀▀▀ ▀   ▀"],
};

export interface Choice<T extends string> {
  value: T;
  label: string;
  description: string;
  color?: string;
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

function useViewWidth(): number {
  const { stdout } = useStdout();
  return Math.max(1, Math.min(78, stdout.columns ?? 78));
}

function hasVisualTerminal(): boolean {
  return Boolean(
    isInteractiveTerminal() &&
    !process.env.NO_COLOR &&
    !process.env.SODIUM_PLAIN &&
    process.env.TERM !== "dumb",
  );
}

function LogoLine({
  line,
  color,
  shadow,
  bold,
}: {
  line: string;
  color: string;
  shadow: string;
  bold?: boolean;
}) {
  return (
    <Text>
      {Array.from(line).map((character, index) => {
        if (character === "_") {
          return (
            <Text key={index} backgroundColor={shadow}>
              {" "}
            </Text>
          );
        }
        if (character === "^") {
          return (
            <Text
              key={index}
              color={color}
              backgroundColor={shadow}
              bold={bold}
            >
              ▀
            </Text>
          );
        }
        return (
          <Text key={index} color={color} bold={bold}>
            {character}
          </Text>
        );
      })}
    </Text>
  );
}

export function InitHeaderView() {
  return (
    <Box flexDirection="column">
      {LOGO.left.map((line, index) => (
        <Box key={index}>
          <LogoLine
            line={line}
            color={ACCENT_MUTED}
            shadow={ACCENT_MUTED_SHADOW}
          />
          <Text> </Text>
          <LogoLine
            line={LOGO.right[index] ?? ""}
            color={ACCENT}
            shadow={ACCENT_SHADOW}
            bold
          />
        </Box>
      ))}
    </Box>
  );
}

function Brand({ command }: { command?: string }) {
  return (
    <Box>
      <Text color={ACCENT} bold>
        ◆ SODIUM
      </Text>
      {command ? <Text color={MUTED}> {command}</Text> : null}
    </Box>
  );
}

function toneColor(tone: CommandResult["tone"]): string {
  if (tone === "warning") return WARNING;
  if (tone === "info") return ACCENT;
  return SUCCESS;
}

function ToolTable({ tools }: { tools: NonNullable<CommandResult["tools"]> }) {
  const visible = tools.slice(0, 8);
  const nameWidth = Math.min(
    28,
    Math.max(4, ...visible.map((tool) => tool.name.length)),
  );
  const riskWidth = Math.max(4, ...visible.map((tool) => tool.risk.length));
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Box width={nameWidth + 2} flexShrink={0}>
          <Text color={MUTED}>TOOL</Text>
        </Box>
        <Box width={riskWidth + 2} flexShrink={0}>
          <Text color={MUTED}>RISK</Text>
        </Box>
        <Text color={MUTED}>ROUTES</Text>
      </Box>
      {visible.map((tool) => (
        <Box key={tool.name}>
          <Box width={nameWidth + 2} flexShrink={0}>
            <Text>{tool.name.slice(0, nameWidth)}</Text>
          </Box>
          <Box width={riskWidth + 2} flexShrink={0}>
            <Text color={tool.risk === "read_only" ? "green" : "yellow"}>
              {tool.risk}
            </Text>
          </Box>
          <Text color={MUTED}>{tool.routes}</Text>
        </Box>
      ))}
      {tools.length > visible.length ? (
        <Text color={MUTED}>+ {tools.length - visible.length} more tools</Text>
      ) : null}
    </Box>
  );
}

export function ResultView({ result }: { result: CommandResult }) {
  const details = result.details ?? [];
  const labelWidth = Math.max(0, ...details.map(([label]) => label.length));
  const viewWidth = useViewWidth();
  const color = toneColor(result.tone);

  return (
    <Box flexDirection="column" marginY={1} width={viewWidth}>
      {result.command === "init" ? null : <Brand command={result.command} />}
      <Box marginTop={result.command === "init" ? 0 : 1}>
        <Text color={color} bold>
          {result.tone === "warning" ? "!" : "✓"} {result.title}
        </Text>
      </Box>
      {details.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          {details.map(([label, value]) => (
            <Box key={label}>
              <Box width={labelWidth + 2} flexShrink={0}>
                <Text color={MUTED}>{label}</Text>
              </Box>
              <Text>{String(value)}</Text>
            </Box>
          ))}
        </Box>
      ) : null}
      {result.tools?.length ? <ToolTable tools={result.tools} /> : null}
      {result.note ? (
        <Box marginTop={1}>
          <Text color={MUTED}>{result.note}</Text>
        </Box>
      ) : null}
      {result.prompt ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">
            {result.promptCopied ? "Copied to clipboard" : "Copy this prompt"}
          </Text>
          <Text wrap="wrap" color={MUTED}>
            {result.prompt}
          </Text>
        </Box>
      ) : null}
      {result.next ? (
        <Box marginTop={1}>
          <Text color={ACCENT}>→ </Text>
          <Text>Next: {result.next}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

export function HelpView() {
  const commandWidth = Math.max(
    ...HELP_COMMANDS.map(({ name }) => name.length),
  );
  const viewWidth = useViewWidth();
  return (
    <Box flexDirection="column" marginY={1} width={viewWidth}>
      <Brand />
      <Text color={MUTED}>Real product flows, usable by agents.</Text>
      <Box marginTop={1}>
        <Text color={ACCENT}>$ {SODIUM_COMMAND} &lt;command&gt;</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {HELP_COMMANDS.map(({ name, description }) => (
          <Box key={name}>
            <Box width={commandWidth + 3} flexShrink={0}>
              <Text color={ACCENT}>{name}</Text>
            </Box>
            <Text>{description}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={MUTED}>v{CLI_VERSION} · --plain for scripts</Text>
      </Box>
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
  const viewWidth = useViewWidth();
  return (
    <Box flexDirection="column" marginY={1} width={viewWidth}>
      <Brand command={command} />
      <Box marginTop={1}>
        <Text color="red" bold>
          ×{" "}
        </Text>
        <Text wrap="wrap">{message}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={WARNING}>→ </Text>
        <Text>Fix this, then run the command again.</Text>
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
    <Box>
      <Text color={ACCENT}>{SPINNER_FRAMES[frame]} </Text>
      <Text>{label}</Text>
    </Box>
  );
}

export function ChoiceView<T extends string>({
  question,
  choices,
  onSelect,
  initialIndex = 0,
}: {
  question: string;
  choices: Choice<T>[];
  onSelect(value: T): void;
  initialIndex?: number;
}) {
  const [index, setIndex] = useState(initialIndex);
  const labelWidth = Math.max(
    0,
    ...choices.map((choice) => choice.label.length),
  );
  const viewWidth = useViewWidth();
  const { exit } = useApp();
  useInput((input, key) => {
    if (key.upArrow || input === "k")
      setIndex((current) => (current - 1 + choices.length) % choices.length);
    if (key.downArrow || input === "j")
      setIndex((current) => (current + 1) % choices.length);
    if (key.return) {
      const choice = choices[index];
      if (!choice) return;
      onSelect(choice.value);
      exit();
    }
  });

  return (
    <Box flexDirection="column" marginY={1} width={viewWidth}>
      <Box>
        <Text bold>{question}</Text>
      </Box>
      <Box flexDirection="column">
        {choices.map((choice, position) => {
          const active = position === index;
          return (
            <Box key={choice.value}>
              <Box width={2} flexShrink={0}>
                <Text color={active ? (choice.color ?? ACCENT) : MUTED}>
                  {active ? "›" : " "}
                </Text>
              </Box>
              <Box width={labelWidth} marginRight={2} flexShrink={0}>
                <Text
                  color={active ? (choice.color ?? ACCENT) : undefined}
                  bold={active}
                >
                  {choice.label}
                </Text>
              </Box>
              <Text color={MUTED}>{choice.description}</Text>
            </Box>
          );
        })}
      </Box>
      <Text color={MUTED}>↑↓ choose · enter confirm</Text>
    </Box>
  );
}

function InputView({
  question,
  placeholder,
  onSubmit,
}: {
  question: string;
  placeholder: string;
  onSubmit(value: string): void;
}) {
  const [value, setValue] = useState("");
  const viewWidth = useViewWidth();
  const { exit } = useApp();
  useInput((inputValue, key) => {
    if (key.return) {
      onSubmit(value.trim() || placeholder);
      exit();
      return;
    }
    if (key.backspace || key.delete) {
      setValue((current) => current.slice(0, -1));
      return;
    }
    if (!key.ctrl && !key.meta && inputValue)
      setValue((current) => `${current}${inputValue}`);
  });
  return (
    <Box flexDirection="column" marginY={1} width={viewWidth}>
      <Box>
        <Text bold>{question} </Text>
        <Text color={value ? undefined : MUTED}>{value || placeholder}</Text>
        <Text color={ACCENT}> ▌</Text>
      </Box>
      <Text color={MUTED}>
        enter accepts {value ? "this name" : "the suggested name"}
      </Text>
    </Box>
  );
}

export function printResult(result: CommandResult): void {
  if (!hasVisualTerminal()) {
    console.log(plainResult(result));
    return;
  }
  render(<ResultView result={result} />, INCREMENTAL_RENDER).unmount();
}

export function printInitHeader(): void {
  if (!hasVisualTerminal()) return;
  render(
    <Box flexDirection="column" marginTop={1}>
      <InitHeaderView />
    </Box>,
    INCREMENTAL_RENDER,
  ).unmount();
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
  render(<HelpView />, INCREMENTAL_RENDER).unmount();
}

export function printError(command: string | undefined, message: string): void {
  if (!hasVisualTerminal()) {
    console.error(`Sodium${command ? ` ${command}` : ""} failed: ${message}`);
    return;
  }
  render(<ErrorView command={command} message={message} />, {
    stdout: process.stderr,
    ...INCREMENTAL_RENDER,
  }).unmount();
}

export function printInfo(message: string): void {
  if (!hasVisualTerminal()) {
    console.log(`→ ${message}`);
    return;
  }
  render(
    <Box>
      <Text color={ACCENT}>→ </Text>
      <Text>{message}</Text>
    </Box>,
    INCREMENTAL_RENDER,
  ).unmount();
}

export function startProgress(label: string): ProgressHandle {
  if (!hasVisualTerminal()) {
    console.log(`… ${label}`);
    return { update: () => {}, stop: () => {} };
  }
  const instance: Instance = render(
    <LoadingView label={label} />,
    INCREMENTAL_RENDER,
  );
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
  if (!isInteractiveTerminal())
    throw new Error("interactive choice requested without a terminal");
  if (!hasVisualTerminal()) {
    console.log(question);
    choices.forEach((choice, index) =>
      console.log(`  ${index + 1}. ${choice.label} — ${choice.description}`),
    );
    const prompt = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      while (true) {
        const answer = await prompt.question("Select: ");
        const selected = choices[Number.parseInt(answer, 10) - 1];
        if (selected) return selected.value;
        console.log(`Enter 1–${choices.length}.`);
      }
    } finally {
      prompt.close();
    }
  }
  return new Promise<T>((resolve) =>
    render(
      <ChoiceView
        question={question}
        choices={choices}
        onSelect={(value) => resolve(value)}
      />,
      INCREMENTAL_RENDER,
    ),
  );
}

export async function input(
  question: string,
  placeholder: string,
): Promise<string> {
  if (!isInteractiveTerminal())
    throw new Error("interactive input requested without a terminal");
  if (!hasVisualTerminal()) {
    const prompt = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      return (
        (await prompt.question(`${question} (${placeholder}): `)).trim() ||
        placeholder
      );
    } finally {
      prompt.close();
    }
  }
  return new Promise<string>((resolve) =>
    render(
      <InputView
        question={question}
        placeholder={placeholder}
        onSubmit={resolve}
      />,
      INCREMENTAL_RENDER,
    ),
  );
}
