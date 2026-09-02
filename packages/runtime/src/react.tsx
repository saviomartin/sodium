"use client";

import { useEffect } from "react";
import type { SodiumConfig, SodiumProject } from "sodium-webmcp-spec";
import { installSodium, type SodiumHandlers } from "./sdk";

// React development Strict Mode runs an effect's setup, cleanup, then setup
// again. Queue installations so the discarded setup cannot race the live one
// and leave only a subset of tools registered.
let installationQueue: Promise<void> = Promise.resolve();

function enqueueInstallation(task: () => Promise<void>): void {
  const queued = installationQueue.then(task, task);
  installationQueue = queued.catch(() => undefined);
}

export function SodiumProvider({
  config,
  project,
  handlers,
  debug = false,
}: {
  config: SodiumConfig | unknown;
  project?: SodiumProject | null;
  handlers?: SodiumHandlers;
  debug?: boolean;
}) {
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    enqueueInstallation(async () => {
      if (disposed) return;
      const handle = await installSodium({ config, project, handlers, debug });
      if (disposed) handle.dispose();
      else cleanup = () => handle.dispose();
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [config, project, handlers, debug]);
  return null;
}
