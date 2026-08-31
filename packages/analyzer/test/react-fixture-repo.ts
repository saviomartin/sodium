import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function writeReactFiles(
  root: string,
  files: Record<string, string>,
): void {
  for (const [relative, content] of Object.entries(files)) {
    const absolute = join(root, relative);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
}

export function viteReactFixture(): Record<string, string> {
  return {
    "package.json": JSON.stringify({
      scripts: { dev: "vite", build: "vite build" },
      dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
      devDependencies: { vite: "^7.0.0", "@vitejs/plugin-react": "latest" },
    }),
    "index.html":
      '<div id="root"></div><script type="module" src="/src/main.jsx"></script>',
    "src/main.jsx": `import { createRoot } from "react-dom/client";
import App from "./App.jsx";
createRoot(document.getElementById("root")).render(<App />);`,
    "src/App.jsx": `export default function App() {
  function submitContact(event) { event.preventDefault(); }
  return <main>
    <a href="/about">About</a>
    <form id="contact" onSubmit={submitContact}>
      <input name="email" type="email" required />
      <textarea name="message" required aria-label="Message" />
      <button type="submit">Send</button>
    </form>
    <button id="increment" onClick={() => {}}>Increment</button>
    <button onClick={() => setCount(count + 1)}>Count is {count}</button>
    <button id="dynamic-counter" onClick={() => setCount(count + 1)}>Count is {count}</button>
  </main>;
}`,
  };
}

export function reactRouterFixture(): Record<string, string> {
  return {
    "package.json": JSON.stringify({
      scripts: { dev: "vite" },
      dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0",
        "react-router-dom": "^7.0.0",
      },
      devDependencies: { vite: "^7.0.0" },
    }),
    "index.html": '<script type="module" src="/src/main.tsx"></script>',
    "src/main.tsx": `import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
createRoot(document.getElementById("root")!).render(<BrowserRouter basename="/console"><App /></BrowserRouter>);`,
    "src/App.tsx": `import { Routes, Route, Link } from "react-router-dom";
import { Home } from "./pages/Home";
import { Projects } from "./pages/Projects";
import { Project } from "./pages/Project";
import { Settings } from "./pages/Settings";
export default function App() { return <>
  <Link to="/projects">Projects</Link>
  <Routes>
    <Route path="/" element={<Home />} />
    <Route path="projects" element={<Projects />}>
      <Route index element={<Home />} />
      <Route path=":projectId" element={<Project />} />
      <Route path="settings" element={<Settings />} />
    </Route>
  </Routes>
</>; }`,
    "src/pages/Home.tsx": `export function Home() { return <p>Home</p>; }`,
    "src/pages/Projects.tsx": `import { Outlet } from "react-router-dom";
export function Projects() { return <section><Outlet /></section>; }`,
    "src/pages/Project.tsx": `export function Project() { return <form name="rename" onSubmit={renameProject}><input name="name" required /><button>Rename</button></form>; }`,
    "src/pages/Settings.tsx": `import { Link } from "react-router-dom";
export function Settings() { return <><Link to="../new">New project</Link><button aria-label="Save settings" onClick={save}>Save</button></>; }`,
  };
}

export function dataHashRouterFixture(): Record<string, string> {
  return {
    "package.json": JSON.stringify({
      scripts: { start: "react-scripts start" },
      dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0",
        "react-router-dom": "^7.0.0",
        "react-scripts": "5.1.0",
      },
    }),
    "public/index.html": '<div id="root"></div>',
    "src/index.js": `import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import Account from "./Account";
import Files from "./Files";
const router = createHashRouter([
  { path: "/", element: <Account /> },
  { path: "account/:tab?", element: <Account /> },
  { path: "files/*", element: <Files /> },
]);
ReactDOM.createRoot(document.getElementById("root")).render(<RouterProvider router={router} />);`,
    "src/Account.jsx": `export default function Account() { return <button id="logout" onClick={logout}>Log out</button>; }`,
    "src/Files.jsx": `export default function Files() { return <p>Files</p>; }`,
  };
}
