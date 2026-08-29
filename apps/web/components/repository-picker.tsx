"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { selectRepositoryAction } from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import {
  buttonClass,
  cn,
  CtaArrow,
  inputClass,
  secondaryButtonClass,
} from "@/components/ui";
import { MagnifyingGlassIcon } from "@/components/icons";
import { RepositoryMeta, RepositoryName } from "@/components/repository-row";

export interface PickerRepository {
  githubRepoId: number;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
}

/**
 * The GitHub repository list.
 *
 * An account can carry hundreds of repositories, so the list is bounded and
 * scrolls inside the panel rather than growing the page, and a filter sits
 * above it — with that many rows, scanning is not a way to find one.
 */
export function RepositoryPicker({
  connectionId,
  repositories,
  connectedIds,
}: {
  connectionId: string;
  repositories: PickerRepository[];
  /** GitHub repository id → connected repository id, for rows already added. */
  connectedIds: Record<string, string>;
}) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      term
        ? repositories.filter((repository) =>
            repository.fullName.toLowerCase().includes(term),
          )
        : repositories,
    [repositories, term],
  );

  return (
    <div>
      <div className="border-b border-white/[0.07] px-5 py-3 sm:px-6">
        <label className="relative block">
          <span className="sr-only">Search repositories</span>
          <MagnifyingGlassIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search repositories"
            autoComplete="off"
            className={cn(inputClass, "pl-9")}
          />
        </label>
      </div>

      {matches.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm font-medium">No repositories match</p>
          <p className="mt-1 text-sm text-neutral-400">
            Nothing here is named “{query.trim()}”. Try the owner instead.
          </p>
        </div>
      ) : (
        <ul className="max-h-96 divide-y divide-white/[0.07] overflow-y-auto">
          {matches.map((repository) => {
            const connectedId = connectedIds[String(repository.githubRepoId)];
            return (
              <li
                key={repository.githubRepoId}
                className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-100">
                    <RepositoryName fullName={repository.fullName} />
                  </p>
                  <RepositoryMeta
                    isPrivate={repository.isPrivate}
                    defaultBranch={repository.defaultBranch}
                  />
                </div>
                {connectedId ? (
                  <Link
                    href={`/repos/${connectedId}`}
                    className={cn(secondaryButtonClass, "shrink-0")}
                  >
                    Open
                    <CtaArrow />
                  </Link>
                ) : (
                  <ActionForm
                    className="shrink-0"
                    action={selectRepositoryAction}
                    submitEvent={{
                      name: "Repository Connection Requested",
                      properties: {
                        visibility: repository.isPrivate ? "private" : "public",
                      },
                    }}
                  >
                    <input
                      type="hidden"
                      name="connectionId"
                      value={connectionId}
                    />
                    <input
                      type="hidden"
                      name="githubRepoId"
                      value={repository.githubRepoId}
                    />
                    <SubmitButton
                      className={buttonClass}
                      pendingText="Connecting…"
                    >
                      Connect
                      <CtaArrow />
                    </SubmitButton>
                  </ActionForm>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
