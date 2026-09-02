import { AppHeader } from "@/components/app-header";
import { ProjectList } from "@/components/project-list";
import { SignInPanel } from "@/components/sign-in-panel";
import { getAccountContext, listProjects } from "@/lib/queries";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; error?: string; next?: string }>;
}) {
  const [account, params] = await Promise.all([
    getAccountContext(),
    searchParams,
  ]);
  if (account.userId) {
    const projects = await listProjects();
    return (
      <div className="min-h-dvh">
        <AppHeader account={account} />
        <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-neutral-600">
                Control plane
              </p>
              <h1 className="mt-2 text-3xl font-medium tracking-tight text-neutral-100">
                Your WebMCP projects
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-400">
                Definitions stay in your repository. Sodium stores deployments
                and tool outcomes.
              </p>
            </div>
            <code className="frame block overflow-x-auto px-3 py-2 font-mono text-xs text-neutral-300">
              npx sodium-webmcp init
            </code>
          </div>
          <div className="mt-8">
            <ProjectList projects={projects} />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <AppHeader next={params.next} />
      <main className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-14 sm:px-6 sm:py-24 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <section>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-blue-400">
            PostHog for WebMCP
          </p>
          <h1 className="mt-5 max-w-3xl text-5xl font-medium leading-[1.02] tracking-[-0.045em] text-neutral-100 sm:text-6xl">
            Ship tools from one file. See what agents actually use.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-neutral-400 sm:text-lg">
            The Sodium skill converts real application flows into{" "}
            <code className="font-mono text-neutral-200">sodium.json</code>. One
            command installs the local SDK, deploys the contract, and starts
            measuring every tool outcome.
          </p>
          <div className="frame mt-8 overflow-hidden font-mono text-sm">
            <div className="border-b border-white/[0.07] px-4 py-2 text-xs text-neutral-600">
              terminal
            </div>
            <div className="space-y-2 px-4 py-4 text-neutral-300">
              <p>
                <span className="text-blue-400">$</span> use $sodium-webmcp
              </p>
              <p>
                <span className="text-blue-400">$</span> npx sodium-webmcp init
              </p>
            </div>
          </div>
          <ol className="mt-8 grid gap-3 text-sm text-neutral-400 sm:grid-cols-3">
            <li>
              <span className="mr-2 font-mono text-neutral-600">01</span>Skill
              writes the contract
            </li>
            <li>
              <span className="mr-2 font-mono text-neutral-600">02</span>CLI
              installs the SDK
            </li>
            <li>
              <span className="mr-2 font-mono text-neutral-600">03</span>
              Dashboard tracks outcomes
            </li>
          </ol>
        </section>
        <SignInPanel params={params} />
      </main>
    </div>
  );
}
