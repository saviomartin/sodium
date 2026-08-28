import type { BridgeContext, PublishedTool } from "./types";
import { fillUrlTemplate } from "./matcher";
import { validateInput } from "./validate-input";

/**
 * Executes declarative handler bindings. Everything here operates on
 * validated manifest data + validated tool input; there is no path from
 * manifest content to code execution.
 */

export interface ExecuteResult {
  ok: boolean;
  [key: string]: unknown;
}

export async function executeTool(
  tool: PublishedTool,
  rawInput: Record<string, unknown>,
  doc: Document,
  signal?: AbortSignal,
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
      const form = doc.querySelector<HTMLFormElement>(
        tool.handler.formSelector,
      );
      if (!form || form.tagName !== "FORM")
        return { ok: false, error: "form_not_found" };
      for (const [inputName, controlName] of Object.entries(
        tool.handler.fieldMap,
      )) {
        const value = input[inputName];
        if (value === undefined) continue;
        const control = form.elements.namedItem(controlName);
        if (!control)
          return { ok: false, error: "form_field_missing", field: controlName };
        setControlValue(control, String(value));
      }
      const submitter = tool.handler.submitSelector
        ? form.querySelector<HTMLElement>(tool.handler.submitSelector)
        : null;
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit(
          submitter instanceof HTMLElement
            ? (submitter as HTMLButtonElement)
            : undefined,
        );
      } else {
        (form as HTMLFormElement).submit();
      }
      return { ok: true, submitted: true };
    }

    case "bridge": {
      const registry = doc.defaultView?.__sodiumBridge;
      const handler = registry?.handlers.get(tool.handler.bridgeKey);
      if (!handler) {
        return {
          ok: false,
          error: "bridge_handler_not_registered",
          bridgeKey: tool.handler.bridgeKey,
          hint: "the site has not registered this action's bridge handler on this page",
        };
      }
      const context: BridgeContext = {
        toolName: tool.name,
        riskLevel: tool.riskLevel,
        confirmation: tool.confirmation,
        signal,
      };
      const result = await handler(input, context);
      return { ok: true, result: result === undefined ? null : result };
    }
  }
}

function readElement(element: Element, attribute?: string): string | null {
  if (attribute) return element.getAttribute(attribute);
  return (element.textContent ?? "").trim();
}

/**
 * Sets a form control value in a way React and other frameworks observe:
 * native value setter + input/change events.
 */
function setControlValue(control: unknown, value: string): void {
  if (control instanceof HTMLInputElement) {
    if (control.type === "checkbox" || control.type === "radio") {
      const checked =
        value === "true" || value === "on" || value === control.value;
      setNativeProperty(control, "checked", checked);
    } else {
      setNativeProperty(control, "value", value);
    }
    dispatchInputEvents(control);
    return;
  }
  if (
    control instanceof HTMLTextAreaElement ||
    control instanceof HTMLSelectElement
  ) {
    setNativeProperty(control, "value", value);
    dispatchInputEvents(control);
    return;
  }
  // RadioNodeList (multiple controls sharing a name).
  if (
    typeof RadioNodeList !== "undefined" &&
    control instanceof RadioNodeList
  ) {
    (control as RadioNodeList & { value: string }).value = value;
  }
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
