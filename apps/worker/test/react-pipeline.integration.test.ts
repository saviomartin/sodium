import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { analyzeRepo } from "@sodium/analyzer";
import { validateContract } from "@sodium/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { runCandidateEvals } from "../src/evals";
import { assembleContract, buildPrimitives } from "../src/pipeline/primitives";
import { HeuristicAiProvider } from "../src/providers/ai-provider";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("React source-to-contract pipeline", () => {
  it("turns a Vite React snapshot into valid, evaluated candidates", async () => {
    const root = mkdtempSync(join(tmpdir(), "sodium-react-pipeline-"));
    roots.push(root);
    writeFiles(root, {
      "package.json": JSON.stringify({
        scripts: { dev: "vite", build: "vite build" },
        dependencies: { react: "^19", "react-dom": "^19" },
        devDependencies: { vite: "^7" },
      }),
      "index.html":
        '<div id="root"></div><script type="module" src="/src/main.jsx"></script>',
      "src/main.jsx": `import { createRoot } from "react-dom/client";
import App from "./App";
createRoot(document.getElementById("root")).render(<App />);`,
      "src/App.jsx": `export default function App() {
  function submitSignup(event) { event.preventDefault(); }
  return <main>
    <a href="/settings">Settings</a>
    <form id="signup" onSubmit={submitSignup}>
      <input name="email" type="email" required />
      <button type="submit">Sign up</button>
    </form>
    <button id="increment" onClick={() => setCount(count + 1)}>Increment</button>
    <button onClick={() => setCount(count + 1)}>Count is {count}</button>
  </main>;
}`,
    });

    const analysis = await analyzeRepo(root);
    const primitives = buildPrimitives(analysis);
    const synthesis = await new HeuristicAiProvider().proposeTools({
      analysis,
      primitives,
    });
    const contracts = synthesis.tools.map(
      (proposal) =>
        assembleContract("react-repository", proposal, primitives).contract,
    );

    expect(analysis.framework).toBe("react");
    expect(contracts.map((contract) => contract.handler.kind)).toEqual(
      expect.arrayContaining(["navigate", "form", "interaction"]),
    );
    expect(
      contracts.some(
        (contract) =>
          contract.handler.kind === "interaction" &&
          contract.handler.steps.some(
            (step) => "selector" in step && step.selector === "#increment",
          ),
      ),
    ).toBe(true);
    expect(
      contracts.some(
        (contract) =>
          contract.handler.kind === "interaction" &&
          contract.handler.steps.some(
            (step) =>
              "accessibleName" in step && step.accessibleName === "setCount",
          ),
      ),
    ).toBe(false);

    for (const contract of contracts) {
      expect(
        validateContract(contract).issues.filter(
          (issue) => issue.severity === "error",
        ),
      ).toEqual([]);
      expect(
        runCandidateEvals(contract, contracts).every((result) => result.passed),
      ).toBe(true);
    }
  });
});

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(root, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }
}
