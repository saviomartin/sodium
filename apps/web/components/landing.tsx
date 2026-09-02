import { AppHeader } from "./app-header";
import { SignInPanel } from "./sign-in-panel";
import { frameClass } from "./ui";
import {
  ChartLineUpIcon,
  CheckCircleIcon,
  CodeIcon,
  FileCodeIcon,
  LockSimpleIcon,
  PulseIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  TerminalWindowIcon,
  WrenchIcon,
} from "./icons";

export function Landing({
  params,
}: {
  params: { deleted?: string; error?: string; next?: string };
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader next={params.next} marketing />
      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pt-14 pb-20 sm:px-6 sm:pt-24 sm:pb-28 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-blue-400">
              The WebMCP control plane
            </p>
            <h1 className="mt-5 max-w-3xl text-5xl leading-[0.98] font-medium tracking-[-0.055em] text-neutral-100 text-balance sm:text-7xl">
              Turn real product flows into tools agents can use.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-neutral-300 text-pretty sm:text-lg">
              The Sodium skill understands your app and writes the contract. The
              CLI installs WebMCP locally. The dashboard shows what agents
              discover, call, and complete.
            </p>

            <div
              className={`${frameClass} mt-8 max-w-2xl overflow-hidden font-mono`}
            >
              <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-2 text-[11px] text-neutral-500">
                <span className="flex items-center gap-2">
                  <TerminalWindowIcon aria-hidden className="size-3.5" />
                  terminal
                </span>
                <span>your-next-app</span>
              </div>
              <div className="space-y-2 px-4 py-4 text-sm text-neutral-300">
                <p>
                  <span className="text-blue-400">$</span> npx sodiumtools init
                </p>
                <p>
                  <span className="text-blue-400">$</span> npx sodiumtools login
                </p>
                <p>
                  <span className="text-blue-400">$</span> npx sodiumtools
                  deploy
                </p>
                <p className="pt-1 text-emerald-300">
                  ✓ 6 tools live · dashboard ready
                </p>
              </div>
            </div>
          </div>

          <div id="start" className="scroll-mt-20">
            <SignInPanel params={params} />
          </div>
        </section>

        <section id="features" className="scroll-mt-16 bg-cream text-cream-ink">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <header className="max-w-2xl">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-cream-muted">
                One source of truth
              </p>
              <h2 className="mt-3 text-3xl font-medium tracking-tight text-balance sm:text-4xl">
                From interface to observable agent surface.
              </h2>
              <p className="mt-4 text-sm leading-7 text-cream-muted sm:text-base">
                No script IDs. No repository analysis queue. Your contract stays
                beside your code, and each deployment becomes an immutable
                version.
              </p>
            </header>

            <div className="mt-10 grid border-t border-l border-cream-line lg:grid-cols-3">
              <Feature
                number="01"
                icon={FileCodeIcon}
                title="Skill writes sodium.json"
                description="A coding agent maps real UI capabilities into a reviewable, portable tool contract."
              >
                <pre className="overflow-hidden rounded-md bg-[#191919] p-4 font-mono text-[11px] leading-5 text-neutral-300">
                  <code>{`{\n  "name": "search_products",\n  "on": ["/shop/**"],\n  "risk": "read_only"\n}`}</code>
                </pre>
              </Feature>
              <Feature
                number="02"
                icon={CodeIcon}
                title="CLI wires the local SDK"
                description="Init detects your framework, adds the package, and keeps handlers in your own application."
              >
                <ol className="divide-y divide-cream-line border-y border-cream-line font-mono text-xs">
                  {[
                    ["init", "framework detected"],
                    ["login", "account connected"],
                    ["deploy", "version published"],
                    ["doctor", "integration healthy"],
                  ].map(([command, state]) => (
                    <li
                      key={command}
                      className="flex justify-between gap-3 py-2.5"
                    >
                      <span>{command}</span>
                      <span className="text-cream-muted">{state}</span>
                    </li>
                  ))}
                </ol>
              </Feature>
              <Feature
                number="03"
                icon={ChartLineUpIcon}
                title="Telemetry closes the loop"
                description="See tool demand, success, latency, denials, and registration health from real agent use."
              >
                <div className="grid grid-cols-2 gap-4">
                  <PreviewMetric label="Tool calls" value="4,161" />
                  <PreviewMetric label="Success" value="99%" />
                  <PreviewMetric label="P95" value="494 ms" />
                  <PreviewMetric label="Tools used" value="6 / 8" />
                </div>
              </Feature>
            </div>
          </div>
        </section>

        <section id="workflow" className="scroll-mt-16">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <header className="mx-auto max-w-2xl text-center">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-blue-400">
                The workflow
              </p>
              <h2 className="mt-3 text-3xl font-medium tracking-tight text-neutral-100 text-balance sm:text-4xl">
                Four commands. Your app stays yours.
              </h2>
            </header>
            <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Step
                icon={WrenchIcon}
                command="npx sodiumtools init"
                text="Install Sodium and create sodium.json."
              />
              <Step
                icon={CodeIcon}
                command="npx sodiumtools login"
                text="Connect this machine to your account."
              />
              <Step
                icon={RocketLaunchIcon}
                command="npx sodiumtools deploy"
                text="Publish a versioned contract."
              />
              <Step
                icon={PulseIcon}
                command="npx sodiumtools doctor"
                text="Verify config, auth, and SDK wiring."
              />
            </ol>
          </div>
        </section>

        <section
          id="analytics"
          className="scroll-mt-16 border-y border-white/[0.07] bg-white/[0.015]"
        >
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-blue-400">
                Agent analytics
              </p>
              <h2 className="mt-3 text-3xl font-medium tracking-tight text-neutral-100 text-balance sm:text-4xl">
                Understand what agents can actually accomplish.
              </h2>
              <p className="mt-4 text-sm leading-7 text-neutral-400 sm:text-base">
                Measure the tool surface, not people. Sodium records operational
                events needed to improve reliability and discoverability.
              </p>
              <p className="mt-5 flex items-center gap-2 text-sm text-emerald-300">
                <ShieldCheckIcon aria-hidden className="size-4" />
                No prompts, tool inputs, outputs, or page content.
              </p>
            </div>
            <div className={`${frameClass} overflow-hidden`}>
              <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-neutral-200">
                  <PulseIcon aria-hidden className="size-4 text-blue-400" />{" "}
                  Agent activity
                </span>
                <span className="font-mono text-[11px] text-neutral-500">
                  30 days
                </span>
              </div>
              <div className="p-5">
                <div className="flex h-40 items-end gap-2" aria-hidden>
                  {[
                    18, 30, 22, 44, 36, 62, 48, 71, 58, 84, 68, 91, 76, 100,
                  ].map((height, index) => (
                    <span
                      key={index}
                      className="flex-1 bg-blue-400/70"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-white/[0.07] pt-4 text-xs text-neutral-500">
                  <span>Tool calls</span>
                  <span className="text-emerald-300">↑ healthy</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="font-mono text-neutral-400">
          Sodium · WebMCP infrastructure
        </p>
        <p className="flex items-center gap-1.5">
          <LockSimpleIcon aria-hidden className="size-3.5" /> Your tools execute
          in your app, not on Sodium.
        </p>
      </footer>
    </div>
  );
}

function Feature({
  number,
  icon: Icon,
  title,
  description,
  children,
}: {
  number: string;
  icon: typeof FileCodeIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex min-h-[25rem] flex-col border-r border-b border-cream-line p-6 sm:p-7">
      <div className="flex items-center justify-between font-mono text-xs text-cream-muted">
        <Icon aria-hidden className="size-4" />
        <span>{number}</span>
      </div>
      <h3 className="mt-8 text-lg font-medium">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-cream-muted">{description}</p>
      <div className="mt-auto pt-8">{children}</div>
    </article>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-cream-line pt-3">
      <p className="text-[11px] text-cream-muted">{label}</p>
      <p className="mt-1 font-mono text-lg">{value}</p>
    </div>
  );
}

function Step({
  icon: Icon,
  command,
  text,
}: {
  icon: typeof WrenchIcon;
  command: string;
  text: string;
}) {
  return (
    <li className={`${frameClass} p-5`}>
      <div className="flex items-center justify-between">
        <Icon aria-hidden className="size-4 text-blue-400" />
        <CheckCircleIcon aria-hidden className="size-4 text-neutral-700" />
      </div>
      <code className="mt-8 block text-sm text-neutral-100">{command}</code>
      <p className="mt-2 text-sm leading-6 text-neutral-500">{text}</p>
    </li>
  );
}
