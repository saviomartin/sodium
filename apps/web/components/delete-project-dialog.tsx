"use client";

import { useActionState, useRef, useState } from "react";
import { deleteProjectAction, type DeleteProjectState } from "@/lib/actions";
import {
  Field,
  cn,
  frameClass,
  inputClass,
  secondaryButtonClass,
} from "./ui";
import { CircleNotchIcon, TrashIcon, WarningCircleIcon } from "./icons";

const initialState: DeleteProjectState = { error: null };

/**
 * Deleting a project is irreversible and takes the telemetry with it, so the
 * confirmation is the project's own name rather than a generic word: it cannot
 * be typed from muscle memory, and typing it means you read which project you
 * are on.
 */
export function DeleteProjectDialog({
  projectId,
  projectName,
  className = secondaryButtonClass,
}: {
  projectId: string;
  projectName: string;
  className?: string;
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
        className={className}
        onClick={() => dialog.current?.showModal()}
      >
        <TrashIcon aria-hidden className="size-4 shrink-0" />
        Delete project
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="delete-project-title"
        aria-describedby="delete-project-description"
        className="modal m-auto w-[min(28rem,calc(100%-2rem))] bg-transparent p-0 text-neutral-200"
        onClick={(event) => {
          // The backdrop is the dialog's own box outside its content, so a
          // click landing on the element itself is a click outside the panel.
          if (event.currentTarget === event.target) event.currentTarget.close();
        }}
      >
        <form action={action} className={cn(frameClass, "p-5")}>
          <input type="hidden" name="projectId" value={projectId} />
          <span className="flex size-9 items-center justify-center rounded-md bg-red-500/10 text-red-400">
            <TrashIcon aria-hidden className="size-4" />
          </span>
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
            This permanently deletes every deployment and every analytics event
            for this project. Your account and your application repository are
            untouched; a future deploy creates a fresh project.
          </p>
          <div className="mt-5">
            <Field
              label={
                <>
                  Type{" "}
                  <strong className="text-neutral-200">{projectName}</strong> to
                  confirm
                </>
              }
            >
              <input
                autoFocus
                name="confirmation"
                autoComplete="off"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className={cn(inputClass, "py-2")}
              />
            </Field>
          </div>
          {state.error ? (
            <p
              role="alert"
              className="mt-3 flex items-start gap-1.5 text-sm text-red-400 text-pretty"
            >
              <WarningCircleIcon
                aria-hidden
                weight="fill"
                className="mt-0.5 size-4 shrink-0"
              />
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
              aria-busy={pending}
              className="group inline-flex items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:opacity-40"
            >
              {pending && (
                <CircleNotchIcon
                  aria-hidden
                  weight="bold"
                  className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
                />
              )}
              {pending ? "Deleting…" : "Delete project"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
