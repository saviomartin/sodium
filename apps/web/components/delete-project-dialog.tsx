"use client";

import { useActionState, useRef, useState } from "react";
import { deleteProjectAction, type DeleteProjectState } from "@/lib/actions";
import { secondaryButtonClass } from "./ui";
import { TrashIcon } from "./icons";

const initialState: DeleteProjectState = { error: null };

export function DeleteProjectDialog({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const [state, action, pending] = useActionState(
    deleteProjectAction,
    initialState,
  );
  const confirmed = confirmation === projectName;

  return (
    <>
      <button
        type="button"
        className={secondaryButtonClass}
        onClick={() => dialog.current?.showModal()}
      >
        <TrashIcon aria-hidden className="size-4 text-red-400" />
        Delete project
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="delete-project-title"
        aria-describedby="delete-project-description"
        className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-lg border border-white/10 bg-neutral-950 p-0 text-neutral-100 shadow-2xl backdrop:bg-black/80"
        onClick={(event) => {
          if (event.currentTarget === event.target) event.currentTarget.close();
        }}
      >
        <form action={action} className="p-5">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="flex size-9 items-center justify-center rounded-md bg-red-500/10 text-red-400">
            <TrashIcon aria-hidden className="size-4" />
          </div>
          <h2
            id="delete-project-title"
            className="mt-4 text-lg font-medium text-balance"
          >
            Delete {projectName}?
          </h2>
          <p
            id="delete-project-description"
            className="mt-2 text-sm leading-6 text-neutral-400 text-pretty"
          >
            This permanently deletes every deployment and analytics event for
            this project. Your account and application repository are untouched;
            a future deploy will create a fresh project.
          </p>
          <label className="mt-5 block text-xs text-neutral-400">
            Type <strong className="text-neutral-200">{projectName}</strong> to
            confirm
            <input
              autoFocus
              name="confirmation"
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="mt-2 block w-full rounded-md border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-neutral-100 outline-none transition-colors focus:border-red-400"
            />
          </label>
          {state.error ? (
            <p role="alert" className="mt-2 text-sm text-red-300">
              {state.error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!confirmed || pending}
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "Deleting…" : "Delete project"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
