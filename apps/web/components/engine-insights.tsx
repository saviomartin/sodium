import { ANSWER_ENGINE_COUNT, answerEngineBrand } from "@/lib/answer-engines";
import type { EngineReferralRollup } from "@/lib/tool-analytics";
import { EngineRadar } from "./analytics-charts";
import { AnswerEngineLogo } from "./answer-engine-mark";
import {
  cardBodyClass,
  cardHeadClass,
  cardTitleClass,
  cn,
  frameClass,
} from "./ui";
import { BroadcastIcon } from "./icons";

const number = new Intl.NumberFormat("en-US");
const EMPTY_STATE_ENGINES = ["ChatGPT", "Claude", "Perplexity", "Gemini"];

/** Best-effort AI referral traffic and its downstream WebMCP activity. */
export function EngineInsights({
  engines,
  periodDays,
}: {
  engines: EngineReferralRollup[];
  periodDays: number;
}) {
  const visitsByEngine = new Map(
    engines.map((engine) => [engine.name, engine.visits]),
  );
  const total = engines.reduce((sum, engine) => sum + engine.visits, 0);
  const toolCalls = engines.reduce((sum, engine) => sum + engine.toolCalls, 0);
  const successes = engines.reduce((sum, engine) => sum + engine.successes, 0);
  const successRate =
    toolCalls > 0 ? Math.round((successes / toolCalls) * 100) : null;

  return (
    <section className={frameClass} aria-labelledby="engine-insights-title">
      <header
        className={cn(
          cardHeadClass,
          "flex flex-wrap items-center justify-between gap-x-4 gap-y-2",
        )}
      >
        <h3 id="engine-insights-title" className={cardTitleClass}>
          <BroadcastIcon aria-hidden className="size-4 shrink-0 text-faint" />
          Answer engine referrals
        </h3>
        {total > 0 ? (
          <span className="flex items-baseline gap-1.5">
            <span className="text-lg leading-none font-medium text-neutral-100 tabular-nums">
              {number.format(total)}
            </span>
            <span className="text-xs text-faint">referred visits</span>
          </span>
        ) : (
          <span className="text-xs text-faint tabular-nums">
            Last {periodDays} days
          </span>
        )}
      </header>

      <div className={cardBodyClass}>
        <p className="mb-4 text-sm text-neutral-400 text-pretty">
          Visits arriving from recognized AI products, with downstream tool use
          connected inside the same anonymous browser tab.
        </p>

        {total > 0 ? (
          <>
            <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
              <div>
                <EngineRadar
                  visitsByEngine={visitsByEngine}
                  className="max-w-[232px]"
                  logoClass="size-6"
                />
                <p className="mt-2 text-center text-xs text-faint tabular-nums">
                  {engines.length} of {ANSWER_ENGINE_COUNT} engines seen
                </p>
              </div>

              <dl className="grid grid-cols-3 divide-x divide-white/[0.07] rounded-md border border-white/[0.07] bg-white/[0.025] py-4">
                <div className="px-4">
                  <dt className="text-xs text-faint">Visits</dt>
                  <dd className="mt-1 text-xl font-medium text-neutral-100 tabular-nums">
                    {number.format(total)}
                  </dd>
                </div>
                <div className="px-4">
                  <dt className="text-xs text-faint">Tool calls</dt>
                  <dd className="mt-1 text-xl font-medium text-neutral-100 tabular-nums">
                    {number.format(toolCalls)}
                  </dd>
                </div>
                <div className="px-4">
                  <dt className="text-xs text-faint">Call success</dt>
                  <dd className="mt-1 text-xl font-medium text-neutral-100 tabular-nums">
                    {successRate === null ? "—" : `${successRate}%`}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="mt-5 overflow-hidden rounded-md border border-white/[0.07]">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Answer engine referrals and downstream tool usage
                </caption>
                <thead className="border-b border-white/[0.07] bg-white/[0.025] text-xs text-faint">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      Engine
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2.5 text-right font-medium"
                    >
                      Visits
                    </th>
                    <th
                      scope="col"
                      className="hidden px-3 py-2.5 text-right font-medium sm:table-cell"
                    >
                      Tool calls
                    </th>
                    <th
                      scope="col"
                      className="hidden px-3 py-2.5 text-right font-medium sm:table-cell"
                    >
                      Success
                    </th>
                    <th
                      scope="col"
                      className="hidden px-3 py-2.5 font-medium sm:table-cell"
                    >
                      Attribution
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {engines.map((engine) => {
                    const brand = answerEngineBrand(engine.name);
                    const engineSuccess =
                      engine.toolCalls > 0
                        ? Math.round(
                            (engine.successes / engine.toolCalls) * 100,
                          )
                        : null;
                    const method =
                      engine.referrerVisits > 0 && engine.campaignVisits > 0
                        ? "Referrer + campaign"
                        : engine.referrerVisits > 0
                          ? "Referrer"
                          : "Campaign";
                    return (
                      <tr key={engine.name}>
                        <th
                          scope="row"
                          className="px-3 py-3 font-normal text-neutral-100"
                        >
                          <span className="flex items-center gap-2.5">
                            <AnswerEngineLogo
                              engine={engine.name}
                              className="size-6"
                            />
                            <span className="min-w-0">
                              <span className="block truncate">
                                {engine.name}
                              </span>
                              <span className="block truncate text-xs text-faint">
                                {brand.host}
                              </span>
                            </span>
                          </span>
                        </th>
                        <td className="px-3 py-3 text-right text-neutral-200 tabular-nums">
                          {number.format(engine.visits)}
                        </td>
                        <td className="hidden px-3 py-3 text-right text-neutral-200 tabular-nums sm:table-cell">
                          {number.format(engine.toolCalls)}
                        </td>
                        <td className="hidden px-3 py-3 text-right text-neutral-200 tabular-nums sm:table-cell">
                          {engineSuccess === null ? "—" : `${engineSuccess}%`}
                        </td>
                        <td className="hidden px-3 py-3 text-xs text-neutral-400 sm:table-cell">
                          {method}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-[11px] leading-5 text-faint text-pretty">
              Best-effort attribution. WebMCP does not reveal the calling
              provider, and browser privacy settings can remove referrers.
              Campaign-tagged visits are reported separately from browser
              referrers.
            </p>
          </>
        ) : (
          <div className="rounded-md border border-dashed border-white/12 px-4 py-8 text-center">
            <div className="mx-auto flex w-fit -space-x-1.5">
              {EMPTY_STATE_ENGINES.map((engine) => (
                <span
                  key={engine}
                  className="grid size-8 place-items-center rounded-full border border-ink-800 bg-ink-700"
                >
                  <AnswerEngineLogo engine={engine} className="size-4.5" />
                </span>
              ))}
            </div>
            <p className="mt-3 text-sm font-medium text-neutral-100">
              No answer-engine referrals in this period
            </p>
            <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-neutral-400 text-pretty">
              To verify collection, open your deployed app once with{" "}
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-neutral-200">
                ?utm_source=chatgpt
              </code>
              . The visit will appear here after refresh.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
