import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AmbiguousReactProjectError,
  RepoWorkspace,
  analyzeReactRepo,
  analyzeRepo,
  detectReactProject,
  selectFrameworkAnalyzer,
} from "../src/index";
import {
  dataHashRouterFixture,
  reactRouterFixture,
  viteReactFixture,
  writeReactFiles,
} from "./react-fixture-repo";

const roots: string[] = [];

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "sodium-react-analyzer-"));
  roots.push(root);
  writeReactFiles(root, files);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("React project detection", () => {
  it("detects an official-style Vite React application", () => {
    const root = fixture(viteReactFixture());
    expect(detectReactProject(new RepoWorkspace(root))).toMatchObject({
      framework: "react",
      projectRoot: "",
      buildTool: "Vite",
      entryFiles: ["src/main.jsx"],
    });
  });

  it("detects a single React application inside a monorepo", () => {
    const files = Object.fromEntries(
      Object.entries(viteReactFixture()).map(([path, content]) => [
        `apps/web/${path}`,
        content,
      ]),
    );
    files["package.json"] = JSON.stringify({
      private: true,
      workspaces: ["apps/*"],
    });
    const root = fixture(files);
    expect(detectReactProject(new RepoWorkspace(root))?.projectRoot).toBe(
      "apps/web",
    );
  });

  it("fails safely when a monorepo contains two equally likely React apps", () => {
    const files: Record<string, string> = {
      "package.json": JSON.stringify({ private: true, workspaces: ["apps/*"] }),
    };
    for (const app of ["admin", "store"]) {
      for (const [path, content] of Object.entries(viteReactFixture())) {
        files[`apps/${app}/${path}`] = content;
      }
    }
    const root = fixture(files);
    expect(() => detectReactProject(new RepoWorkspace(root))).toThrow(
      AmbiguousReactProjectError,
    );
  });

  it("does not misclassify component libraries or React Native packages", () => {
    const componentLibrary = fixture({
      "package.json": JSON.stringify({
        peerDependencies: { react: "^19", "react-dom": "^19" },
      }),
      "src/Button.tsx": "export const Button = () => <button />;",
    });
    expect(detectReactProject(new RepoWorkspace(componentLibrary))).toBeNull();

    const native = fixture({
      "package.json": JSON.stringify({
        dependencies: { react: "^19", "react-native": "latest" },
      }),
      "index.js": "import { AppRegistry } from 'react-native';",
    });
    expect(detectReactProject(new RepoWorkspace(native))).toBeNull();
  });
});

describe("Vite React analysis", () => {
  it("extracts root forms, client submit handlers, links, and controls", async () => {
    const analysis = await analyzeReactRepo(fixture(viteReactFixture()));
    expect(analysis).toMatchObject({
      framework: "react",
      projectRoot: "",
      routes: [expect.objectContaining({ urlPattern: "/", pathPattern: "/" })],
    });
    expect(analysis.forms).toContainEqual(
      expect.objectContaining({
        selector: "#contact",
        pathPattern: "/**",
        action: { kind: "event_handler", name: "submitContact" },
      }),
    );
    expect(analysis.links).toContainEqual(
      expect.objectContaining({ href: "/about", label: "About" }),
    );
    expect(analysis.controls).toContainEqual(
      expect.objectContaining({ selector: "#increment", label: "Increment" }),
    );
    expect(
      analysis.controls?.some((control) => control.label === "Count is"),
    ).toBe(false);
    expect(
      analysis.controls?.some(
        (control) => !control.selector && control.accessibleName === "setCount",
      ),
    ).toBe(false);
    expect(analysis.controls).toContainEqual(
      expect.objectContaining({
        selector: "#dynamic-counter",
        label: "setCount",
      }),
    );
  });
});

describe("React Router analysis", () => {
  it("extracts nested, dynamic, basename routes and component bindings", async () => {
    const analysis = await analyzeReactRepo(fixture(reactRouterFixture()));
    expect(analysis.routes.map((route) => route.urlPattern)).toEqual(
      expect.arrayContaining([
        "/console",
        "/console/projects",
        "/console/projects/:projectId",
        "/console/projects/settings",
      ]),
    );
    expect(
      analysis.routes.find(
        (route) => route.urlPattern === "/console/projects/:projectId",
      ),
    ).toMatchObject({
      pathPattern: "/console/projects/*",
      params: ["projectId"],
    });
    expect(analysis.forms).toContainEqual(
      expect.objectContaining({
        selector: 'form[name="rename"]',
        pathPattern: "/console/projects/*",
        action: { kind: "event_handler", name: "renameProject" },
      }),
    );
    expect(analysis.links).toContainEqual(
      expect.objectContaining({ href: "/console/projects" }),
    );
    expect(analysis.controls).toContainEqual(
      expect.objectContaining({
        selector: '[aria-label="Save settings"]',
        routeBindings: [
          {
            urlPattern: "/console/projects/settings",
            pathPattern: "/console/projects/settings",
          },
        ],
      }),
    );
  });

  it("supports data routers, optional segments, splats, and hash routes", async () => {
    const analysis = await analyzeReactRepo(fixture(dataHashRouterFixture()));
    expect(analysis.routes.map((route) => route.urlPattern)).toEqual(
      expect.arrayContaining([
        "/#/",
        "/#/account",
        "/#/account/:tab",
        "/#/files/*",
      ]),
    );
    expect(
      analysis.routes.find((route) => route.urlPattern === "/#/account/:tab"),
    ).toMatchObject({ pathPattern: "/#/account/*", params: ["tab"] });
    expect(
      analysis.routes.find((route) => route.urlPattern === "/#/files/*"),
    ).toMatchObject({ pathPattern: "/#/files/**" });
    expect(analysis.controls).toContainEqual(
      expect.objectContaining({
        selector: "#logout",
        routeBindings: expect.arrayContaining([
          { urlPattern: "/#/", pathPattern: "/#" },
          { urlPattern: "/#/account", pathPattern: "/#/account" },
          { urlPattern: "/#/account/:tab", pathPattern: "/#/account/*" },
        ]),
      }),
    );
  });

  it("fails closed when React Router routes are computed dynamically", async () => {
    const root = fixture({
      "package.json": JSON.stringify({
        scripts: { dev: "vite" },
        dependencies: {
          react: "^19",
          "react-dom": "^19",
          "react-router-dom": "^7",
          vite: "latest",
        },
      }),
      "index.html": '<script type="module" src="/src/main.tsx"></script>',
      "src/main.tsx": `import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
const router = createBrowserRouter(makeRoutesFromRemoteConfig());
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);`,
    });

    await expect(analyzeReactRepo(root)).rejects.toThrow(
      "route configuration is dynamic or could not be resolved safely",
    );
  });

  it("fails closed for unsupported or ambiguous router ownership", async () => {
    const unsupported = fixture({
      ...viteReactFixture(),
      "src/App.jsx": `import { Route } from "wouter";
export default function App() { return <Route path="/account"><button id="save">Save</button></Route>; }`,
    });
    await expect(analyzeReactRepo(unsupported)).rejects.toThrow(
      "wouter routing is not supported yet",
    );

    const mixed = fixture({
      ...viteReactFixture(),
      "src/App.jsx": `import { BrowserRouter, HashRouter, Routes, Route } from "react-router-dom";
export default function App() { return <BrowserRouter><HashRouter><Routes><Route path="/" element={<p>Home</p>} /></Routes></HashRouter></BrowserRouter>; }`,
    });
    await expect(analyzeReactRepo(mixed)).rejects.toThrow(
      "both browser and hash React routers were detected",
    );
  });

  it("resolves route arrays imported from a separate module", async () => {
    const root = fixture({
      "package.json": JSON.stringify({
        scripts: { dev: "vite" },
        dependencies: {
          react: "^19",
          "react-dom": "^19",
          "react-router-dom": "^7",
          vite: "latest",
        },
      }),
      "index.html": '<script type="module" src="/src/main.tsx"></script>',
      "src/main.tsx": `import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import routes from "./routes";
const router = createBrowserRouter(routes);
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);`,
      "src/routes.tsx": `import { Account } from "./Account";
const routes = [{ path: "/account/:id", element: <Account /> }];
export default routes;`,
      "src/Account.tsx": `export function Account() { return <button id="save" onClick={save}>Save</button>; }`,
    });

    const analysis = await analyzeReactRepo(root);
    expect(analysis.routes).toContainEqual(
      expect.objectContaining({
        urlPattern: "/account/:id",
        pathPattern: "/account/*",
      }),
    );
    expect(analysis.controls).toContainEqual(
      expect.objectContaining({ selector: "#save" }),
    );
  });
});

describe("framework selection", () => {
  it("uses the generic entry point for React repositories", async () => {
    const root = fixture(viteReactFixture());
    expect(selectFrameworkAnalyzer(new RepoWorkspace(root))?.framework).toBe(
      "react",
    );
    expect((await analyzeRepo(root)).framework).toBe("react");
  });

  it("returns an actionable unsupported-framework error", async () => {
    const root = fixture({
      "package.json": JSON.stringify({ dependencies: { vue: "latest" } }),
      "src/main.js": "console.log('vue')",
    });
    await expect(analyzeRepo(root)).rejects.toThrow(
      "expected a Next.js App Router app or a browser React app",
    );
  });
});
