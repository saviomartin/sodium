import type { InteractionPostcondition, PublishedTool } from "./types";
import { fillUrlTemplate, matchesPathPattern } from "./matcher";
import { validateInput } from "./validate-input";

const MAX_RESPONSE_BYTES = 256 * 1024;

/**
 * Executes declarative handler bindings. Everything here operates on
 * validated local config + validated tool input; there is no path from JSON
 * content to code execution.
 */

export interface ExecuteResult {
  ok: boolean;
  [key: string]: unknown;
}

export interface SodiumHandlerContext {
  signal?: AbortSignal;
  document: Document;
}

export type SodiumHandler = (
  input: Record<string, unknown>,
  context: SodiumHandlerContext,
) => unknown | Promise<unknown>;

export type SodiumHandlers = Record<string, SodiumHandler>;

export async function executeTool(
  tool: PublishedTool,
  rawInput: Record<string, unknown>,
  doc: Document,
  signal?: AbortSignal,
  handlers: SodiumHandlers = {},
): Promise<ExecuteResult> {
  const inputIssues = validateInput(tool.inputSchema, rawInput ?? {});
  if (inputIssues.length > 0) {
    return {
      ok: false,
      error: "invalid_input",
      issues: inputIssues.slice(0, 10),
    };
  }
  const input = (rawInput ?? {}) as Record<string, unknown>;

  if (tool.confirmation === "required") {
    const confirmed = await requestConfirmation(doc, tool, signal);
    if (!confirmed) return { ok: false, error: "user_denied" };
  }

  switch (tool.handler.kind) {
    case "navigate": {
      const target = fillUrlTemplate(tool.handler.urlTemplate, input);
      if (!target) return { ok: false, error: "unresolved_url_template" };
      const win = doc.defaultView;
      if (!win) return { ok: false, error: "no_window" };
      win.location.assign(target);
      return {
        ok: true,
        navigatedTo: target,
        note: "navigation started; tools re-register on the new page",
      };
    }

    case "extract": {
      const data: Record<string, unknown> = {};
      for (const field of tool.handler.fields) {
        if (field.all) {
          const elements = [...doc.querySelectorAll(field.selector)];
          data[field.name] = elements
            .map((element) => readElement(element, field.attribute))
            .slice(0, 200);
        } else {
          const element = doc.querySelector(field.selector);
          data[field.name] = element
            ? readElement(element, field.attribute)
            : null;
        }
      }
      return { ok: true, data };
    }

    case "form": {
      const formResult = resolveUniqueElement(doc, tool.handler.formSelector);
      if (!formResult.ok) {
        return formResult.error === "element_not_found"
          ? { ok: false, error: "form_not_found" }
          : formResult;
      }
      const form = formResult.element;
      if (form.tagName !== "FORM")
        return { ok: false, error: "form_not_found" };
      const htmlForm = form as HTMLFormElement;
      const actionable = actionableError(form);
      if (actionable) return { ok: false, error: actionable };
      for (const [inputName, controlName] of Object.entries(
        tool.handler.fieldMap,
      )) {
        const value = input[inputName];
        if (value === undefined) continue;
        const control = htmlForm.elements.namedItem(controlName);
        if (!control)
          return { ok: false, error: "form_field_missing", field: controlName };
        if (!setControlValue(control, String(value))) {
          return {
            ok: false,
            error: "form_field_not_settable",
            field: controlName,
          };
        }
      }
      const submitters = tool.handler.submitSelector
        ? htmlForm.querySelectorAll<HTMLElement>(tool.handler.submitSelector)
        : null;
      if (submitters?.length === 0)
        return { ok: false, error: "submitter_not_found" };
      if (submitters && submitters.length > 1)
        return {
          ok: false,
          error: "selector_not_unique",
          selector: tool.handler.submitSelector,
        };
      const submitter = submitters?.[0] ?? null;
      if (submitter && actionableError(submitter))
        return { ok: false, error: actionableError(submitter) };
      if (typeof htmlForm.requestSubmit === "function") {
        htmlForm.requestSubmit(
          submitter instanceof HTMLElement
            ? (submitter as HTMLButtonElement)
            : undefined,
        );
      } else {
        htmlForm.submit();
      }
      return { ok: true, submitted: true };
    }

    case "interaction": {
      const data: Record<string, unknown> = {};
      for (const step of tool.handler.steps) {
        if (signal?.aborted) return { ok: false, error: "aborted" };
        if (step.kind === "wait_for") {
          const found = await waitForSelector(
            doc,
            step.selector,
            step.state,
            step.timeoutMs,
            signal,
          );
          if (!found)
            return {
              ok: false,
              error: "wait_timeout",
              selector: step.selector,
            };
          continue;
        }
        const selector =
          step.kind === "submit"
            ? step.formSelector
            : "selector" in step
              ? step.selector
              : undefined;
        const accessibleClick =
          step.kind === "click" && "role" in step ? step : null;
        const result = accessibleClick
          ? resolveUniqueButtonByName(doc, accessibleClick.name)
          : resolveUniqueElement(doc, selector!);
        if (!result.ok) return result;
        if (step.kind === "read") {
          data[step.output] = readElement(result.element, step.attribute);
          continue;
        }
        const actionable = actionableError(result.element);
        if (actionable)
          return {
            ok: false,
            error: actionable,
            ...(selector
              ? { selector }
              : { name: accessibleClick?.name ?? "" }),
          };
        if (step.kind === "set") {
          if (!(step.input in input))
            return {
              ok: false,
              error: "interaction_input_missing",
              input: step.input,
            };
          if (!setControlValue(result.element, String(input[step.input])))
            return { ok: false, error: "element_not_settable", selector };
        } else if (step.kind === "click") {
          if (!(result.element instanceof HTMLElement))
            return { ok: false, error: "element_not_clickable" };
          result.element.click();
        } else {
          if (result.element.tagName !== "FORM")
            return { ok: false, error: "form_not_found" };
          const form = result.element as HTMLFormElement;
          const submitters = step.submitSelector
            ? form.querySelectorAll<HTMLElement>(step.submitSelector)
            : null;
          if (submitters?.length === 0)
            return { ok: false, error: "submitter_not_found" };
          if (submitters && submitters.length > 1)
            return {
              ok: false,
              error: "selector_not_unique",
              selector: step.submitSelector,
            };
          const submitter = submitters?.[0];
          if (submitter && actionableError(submitter))
            return {
              ok: false,
              error: actionableError(submitter),
              selector: step.submitSelector,
            };
          if (typeof form.requestSubmit === "function")
            form.requestSubmit(submitter as HTMLButtonElement | undefined);
          else form.submit();
        }
      }
      if (tool.handler.postcondition) {
        const met = await waitForPostcondition(
          doc,
          tool.handler.postcondition,
          3_000,
          signal,
        );
        if (!met) return { ok: false, error: "postcondition_failed" };
      }
      return { ok: true, data };
    }

    case "request": {
      const path = fillUrlTemplate(tool.handler.pathTemplate, input);
      if (!path || !path.startsWith("/") || path.startsWith("//"))
        return { ok: false, error: "unresolved_path_template" };
      const win = doc.defaultView;
      if (!win) return { ok: false, error: "no_window" };
      const url = new URL(path, win.location.origin);
      if (url.origin !== win.location.origin)
        return { ok: false, error: "cross_origin_request" };
      for (const [inputName, queryName] of Object.entries(
        tool.handler.queryMap ?? {},
      )) {
        const value = input[inputName];
        if (value !== undefined) url.searchParams.set(queryName, String(value));
      }
      const headers = new Headers();
      let body: BodyInit | undefined;
      if (tool.handler.body) {
        const fields: Record<string, string> = {};
        for (const [inputName, bodyName] of Object.entries(
          tool.handler.body.fieldMap,
        )) {
          if (input[inputName] !== undefined)
            fields[bodyName] = String(input[inputName]);
        }
        if (tool.handler.body.encoding === "json") {
          headers.set("content-type", "application/json");
          body = JSON.stringify(fields);
        } else {
          headers.set(
            "content-type",
            "application/x-www-form-urlencoded;charset=UTF-8",
          );
          body = new URLSearchParams(fields);
        }
      }
      const fetchFn = win.fetch?.bind(win) ?? globalThis.fetch;
      if (!fetchFn) return { ok: false, error: "fetch_unavailable" };
      let response: Response;
      try {
        response = await fetchFn(url, {
          method: tool.handler.method,
          credentials: "same-origin",
          redirect: "error",
          headers,
          body,
          signal,
        });
      } catch {
        return {
          ok: false,
          error: signal?.aborted ? "aborted" : "request_failed",
        };
      }
      const declaredLength = Number(
        response.headers.get("content-length") ?? 0,
      );
      if (declaredLength > MAX_RESPONSE_BYTES)
        return {
          ok: false,
          error: "response_too_large",
          status: response.status,
        };
      if (tool.handler.response === "status")
        return { ok: response.ok, status: response.status };
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES)
        return {
          ok: false,
          error: "response_too_large",
          status: response.status,
        };
      if (!response.ok)
        return {
          ok: false,
          error: "request_rejected",
          status: response.status,
        };
      if (tool.handler.response === "text")
        return { ok: true, status: response.status, data: text };
      try {
        return { ok: true, status: response.status, data: JSON.parse(text) };
      } catch {
        return {
          ok: false,
          error: "invalid_json_response",
          status: response.status,
        };
      }
    }

    case "call": {
      const handler = handlers[tool.handler.export];
      if (!handler) {
        return {
          ok: false,
          error: "handler_not_registered",
          handler: tool.handler.export,
        };
      }
      try {
        const result = await handler(input, { signal, document: doc });
        if (
          typeof result === "object" &&
          result !== null &&
          "ok" in result &&
          typeof (result as { ok?: unknown }).ok === "boolean"
        ) {
          return result as ExecuteResult;
        }
        return result === undefined ? { ok: true } : { ok: true, data: result };
      } catch (handlerError) {
        return {
          ok: false,
          error: signal?.aborted ? "aborted" : "handler_exception",
          message:
            handlerError instanceof Error
              ? handlerError.message.slice(0, 240)
              : "custom handler failed",
        };
      }
    }
  }
}

function resolveUniqueButtonByName(
  doc: Document,
  name: string,
): { ok: true; element: Element } | { ok: false; error: string; name: string } {
  const expected = normalizeAccessibleName(name);
  const elements = [
    ...doc.querySelectorAll("button, input[type=button], input[type=submit]"),
  ].filter((element) => accessibleButtonName(element) === expected);
  if (elements.length === 0)
    return { ok: false, error: "element_not_found", name };
  if (elements.length > 1)
    return { ok: false, error: "accessible_target_not_unique", name };
  return { ok: true, element: elements[0]! };
}

function accessibleButtonName(element: Element): string {
  const aria = element.getAttribute("aria-label");
  if (aria) return normalizeAccessibleName(aria);
  if (element instanceof HTMLInputElement)
    return normalizeAccessibleName(element.value);
  return normalizeAccessibleName(element.textContent ?? "");
}

function normalizeAccessibleName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function resolveUniqueElement(
  doc: Document,
  selector: string,
):
  | { ok: true; element: Element }
  | { ok: false; error: string; selector: string } {
  let elements: NodeListOf<Element>;
  try {
    elements = doc.querySelectorAll(selector);
  } catch {
    return { ok: false, error: "invalid_selector", selector };
  }
  if (elements.length === 0)
    return { ok: false, error: "element_not_found", selector };
  if (elements.length > 1)
    return { ok: false, error: "selector_not_unique", selector };
  return { ok: true, element: elements[0]! };
}

function actionableError(element: Element): string | null {
  if (!element.isConnected) return "element_disconnected";
  if (
    element.hasAttribute("hidden") ||
    element.getAttribute("aria-hidden") === "true"
  )
    return "element_not_visible";
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style?.display === "none" || style?.visibility === "hidden")
    return "element_not_visible";
  if (
    (element as HTMLButtonElement).disabled ||
    element.getAttribute("aria-disabled") === "true"
  )
    return "element_disabled";
  return null;
}

async function waitForSelector(
  doc: Document,
  selector: string,
  state: "present" | "absent",
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  const matches = () => {
    try {
      return (doc.querySelector(selector) !== null) === (state === "present");
    } catch {
      return false;
    }
  };
  if (matches()) return true;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const observer = new MutationObserver(() => {
      if (matches()) finish(true);
    });
    const onAbort = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
    observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function postconditionMet(
  doc: Document,
  condition: InteractionPostcondition,
): boolean {
  if (condition.kind === "selector_present")
    return doc.querySelector(condition.selector) !== null;
  if (condition.kind === "selector_absent")
    return doc.querySelector(condition.selector) === null;
  return matchesPathPattern(
    condition.pathPattern,
    doc.defaultView?.location.pathname ?? "/",
  );
}

async function waitForPostcondition(
  doc: Document,
  condition: InteractionPostcondition,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  if (condition.kind === "selector_present")
    return waitForSelector(doc, condition.selector, "present", timeoutMs, signal);
  if (condition.kind === "selector_absent")
    return waitForSelector(doc, condition.selector, "absent", timeoutMs, signal);
  if (postconditionMet(doc, condition)) return true;
  const deadline = Date.now() + timeoutMs;
  while (!signal?.aborted && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    if (postconditionMet(doc, condition)) return true;
  }
  return false;
}

async function requestConfirmation(
  doc: Document,
  tool: PublishedTool,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return false;
  const dialog = doc.createElement("dialog");
  const titleId = `sodium-confirm-${tool.name}`;
  dialog.setAttribute("aria-labelledby", titleId);
  dialog.setAttribute("role", "alertdialog");
  dialog.style.cssText =
    "max-width:30rem;border:1px solid #d4d4d4;border-radius:12px;padding:24px;background:#fff;color:#171717;font:14px/1.5 system-ui;box-shadow:0 20px 50px #0004";
  const title = doc.createElement("h2");
  title.id = titleId;
  title.textContent = `Confirm ${tool.title}`;
  title.style.cssText = "margin:0 0 8px;font-size:18px";
  const description = doc.createElement("p");
  description.textContent = tool.description;
  description.style.cssText = "margin:0 0 20px";
  const cancel = doc.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.dataset.sodiumCancel = "";
  const confirm = doc.createElement("button");
  confirm.type = "button";
  confirm.textContent = "Confirm";
  confirm.dataset.sodiumConfirm = "";
  confirm.style.cssText = "margin-left:8px";
  dialog.append(title, description, cancel, confirm);
  doc.body.append(dialog);
  dialog.showModal?.();
  if (!dialog.open) dialog.setAttribute("open", "");
  return new Promise((resolve) => {
    const finish = (result: boolean) => {
      signal?.removeEventListener("abort", onAbort);
      dialog.remove();
      resolve(result);
    };
    const onAbort = () => finish(false);
    confirm.addEventListener("click", () => finish(true), { once: true });
    cancel.addEventListener("click", () => finish(false), { once: true });
    dialog.addEventListener("cancel", () => finish(false), { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
    confirm.focus();
  });
}

function readElement(element: Element, attribute?: string): string | null {
  if (attribute) return element.getAttribute(attribute);
  return (element.textContent ?? "").trim();
}

/**
 * Sets a form control value in a way React and other frameworks observe:
 * native value setter + input/change events.
 */
function setControlValue(control: unknown, value: string): boolean {
  if (control instanceof HTMLInputElement) {
    if (control.type === "checkbox" || control.type === "radio") {
      const checked =
        value === "true" || value === "on" || value === control.value;
      setNativeProperty(control, "checked", checked);
    } else {
      setNativeProperty(control, "value", value);
    }
    dispatchInputEvents(control);
    return true;
  }
  if (
    control instanceof HTMLTextAreaElement ||
    control instanceof HTMLSelectElement
  ) {
    setNativeProperty(control, "value", value);
    dispatchInputEvents(control);
    return true;
  }
  // RadioNodeList (multiple controls sharing a name).
  if (
    typeof RadioNodeList !== "undefined" &&
    control instanceof RadioNodeList
  ) {
    (control as RadioNodeList & { value: string }).value = value;
    return true;
  }
  return false;
}

function setNativeProperty(
  element: HTMLElement,
  property: "value" | "checked",
  newValue: string | boolean,
): void {
  const proto = Object.getPrototypeOf(element) as object;
  const descriptor = Object.getOwnPropertyDescriptor(proto, property);
  if (descriptor?.set) {
    descriptor.set.call(element, newValue);
  } else {
    (element as unknown as Record<string, unknown>)[property] = newValue;
  }
}

function dispatchInputEvents(element: HTMLElement): void {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
