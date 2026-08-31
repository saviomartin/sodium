import {
  Node,
  SyntaxKind,
  type FunctionDeclaration,
  type JsxAttribute,
  type JsxOpeningElement,
  type JsxSelfClosingElement,
  type ParameterDeclaration,
  type SourceFile,
  type Type,
  type VariableDeclaration,
} from "ts-morph";
import type { JsonSchemaSubset } from "@sodium/contracts";
import { excerptOf } from "../workspace";
import type {
  AuthSignalInfo,
  ControlInfo,
  FormFieldInfo,
  FormInfo,
  HttpMethod,
  LinkInfo,
  RouteHandlerInfo,
  ServerActionInfo,
} from "../types";
import { findSchemaParseCalls } from "./zod-schemas";
import { signalsWithin } from "./auth";

// Shared JSX and TypeScript primitives used by every framework adapter.
const HTTP_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

function hasDirective(statements: Node[], directive: string): boolean {
  const first = statements[0];
  if (!first || !Node.isExpressionStatement(first)) return false;
  const expr = first.getExpression();
  return (
    (Node.isStringLiteral(expr) ||
      Node.isNoSubstitutionTemplateLiteral(expr)) &&
    expr.getLiteralValue() === directive
  );
}

export function fileHasUseServer(sourceFile: SourceFile): boolean {
  return hasDirective(sourceFile.getStatements(), "use server");
}

interface FunctionLike {
  name: string;
  node: Node;
  params: {
    name: string;
    typeText: string;
    schema?: JsonSchemaSubset;
  }[];
  bodyHasUseServer: boolean;
}

function collectExportedFunctions(sourceFile: SourceFile): FunctionLike[] {
  const results: FunctionLike[] = [];

  for (const fn of sourceFile.getFunctions()) {
    if (!fn.isExported() || !fn.getName()) continue;
    results.push(functionLikeFromDeclaration(fn));
  }
  for (const statement of sourceFile.getVariableStatements()) {
    if (!statement.isExported()) continue;
    for (const declaration of statement.getDeclarations()) {
      const initializer = declaration.getInitializer();
      if (!initializer) continue;
      if (
        Node.isArrowFunction(initializer) ||
        Node.isFunctionExpression(initializer)
      ) {
        results.push(functionLikeFromVariable(declaration));
      }
    }
  }
  return results;
}

function functionLikeFromDeclaration(fn: FunctionDeclaration): FunctionLike {
  const body = fn.getBody();
  return {
    name: fn.getName() ?? "<anonymous>",
    node: fn,
    params: fn.getParameters().map(parameterInfo),
    bodyHasUseServer:
      body !== undefined &&
      Node.isBlock(body) &&
      hasDirective(body.getStatements(), "use server"),
  };
}

function functionLikeFromVariable(
  declaration: VariableDeclaration,
): FunctionLike {
  const initializer = declaration.getInitializerOrThrow();
  const params =
    Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer)
      ? initializer.getParameters().map(parameterInfo)
      : [];
  let bodyHasUseServer = false;
  if (
    Node.isArrowFunction(initializer) ||
    Node.isFunctionExpression(initializer)
  ) {
    const body = initializer.getBody();
    bodyHasUseServer =
      Node.isBlock(body) && hasDirective(body.getStatements(), "use server");
  }
  return {
    name: declaration.getName(),
    node: declaration.getVariableStatementOrThrow(),
    params,
    bodyHasUseServer,
  };
}

function parameterInfo(parameter: ParameterDeclaration): {
  name: string;
  typeText: string;
  schema?: JsonSchemaSubset;
} {
  const schema = typeToJsonSchema(parameter.getType(), 0, new Set());
  return {
    name: parameter.getName(),
    typeText: parameter.getTypeNode()?.getText() ?? "",
    ...(schema ? { schema } : {}),
  };
}

function typeToJsonSchema(
  type: Type,
  depth: number,
  seen: Set<string>,
): JsonSchemaSubset | undefined {
  if (depth > 4 || type.isAny() || type.isUnknown() || type.isNever()) {
    return undefined;
  }
  if (type.isString()) return { type: "string" };
  if (type.isNumber()) return { type: "number" };
  if (type.isBoolean()) return { type: "boolean" };
  if (type.isStringLiteral()) {
    const value = type.getLiteralValue();
    return typeof value === "string"
      ? { type: "string", const: value }
      : undefined;
  }
  if (type.isNumberLiteral()) {
    const value = type.getLiteralValue();
    return typeof value === "number"
      ? { type: "number", const: value }
      : undefined;
  }
  if (type.isUnion()) {
    const members = type
      .getUnionTypes()
      .filter((member) => !member.isUndefined() && !member.isNull());
    const stringValues = members.flatMap((member) => {
      const value = member.isStringLiteral()
        ? member.getLiteralValue()
        : undefined;
      return typeof value === "string" ? [value] : [];
    });
    if (stringValues.length === members.length && stringValues.length > 0) {
      return { type: "string", enum: stringValues };
    }
    if (
      members.length > 0 &&
      members.every(
        (member) =>
          member.isBoolean() ||
          member.getText() === "true" ||
          member.getText() === "false",
      )
    ) {
      return { type: "boolean" };
    }
    return members.length === 1
      ? typeToJsonSchema(members[0]!, depth, seen)
      : undefined;
  }
  if (type.isArray()) {
    const element = type.getArrayElementType();
    const items = element
      ? typeToJsonSchema(element, depth + 1, seen)
      : undefined;
    return items ? { type: "array", items } : undefined;
  }
  if (!type.isObject()) return undefined;

  const identity = type.getText();
  if (seen.has(identity)) return undefined;
  const properties = type.getProperties();
  if (properties.length === 0 || properties.length > 32) return undefined;
  const nextSeen = new Set(seen).add(identity);
  const shape: Record<string, JsonSchemaSubset> = {};
  const required: string[] = [];
  for (const property of properties) {
    const declaration =
      property.getValueDeclaration() ?? property.getDeclarations()[0];
    if (!declaration || !/^[A-Za-z_$][\w$]*$/.test(property.getName())) {
      return undefined;
    }
    const schema = typeToJsonSchema(
      property.getTypeAtLocation(declaration),
      depth + 1,
      nextSeen,
    );
    if (!schema) return undefined;
    shape[property.getName()] = schema;
    if (!property.isOptional()) required.push(property.getName());
  }
  return {
    type: "object",
    properties: shape,
    required,
    additionalProperties: false,
  };
}

export function extractServerActions(
  sourceFile: SourceFile,
  filePath: string,
  fileAuthSignals: AuthSignalInfo[],
): ServerActionInfo[] {
  const fileLevel = fileHasUseServer(sourceFile);
  const actions: ServerActionInfo[] = [];
  for (const fn of collectExportedFunctions(sourceFile)) {
    if (!fileLevel && !fn.bodyHasUseServer) continue;
    const startLine = fn.node.getStartLineNumber();
    const endLine = fn.node.getEndLineNumber();
    const firstParam = fn.params[0];
    actions.push({
      name: fn.name,
      span: { filePath, startLine, endLine },
      params: fn.params.map((p) => p.name),
      parameters: fn.params,
      takesFormData:
        firstParam !== undefined &&
        (firstParam.typeText.includes("FormData") ||
          /form\s*data/i.test(firstParam.name)),
      zodSchemaName: findSchemaParseCalls(fn.node)[0],
      authSignals: signalsWithin(fileAuthSignals, startLine, endLine),
      excerpt: excerptOf(fn.node.getText()),
    });
  }
  return actions;
}

export function extractLinks(
  sourceFile: SourceFile,
  filePath: string,
  routeBindings: { urlPattern: string; pathPattern: string }[],
  options: {
    resolveHref?: (
      href: string,
      routes: { urlPattern: string; pathPattern: string }[],
    ) => string | null;
  } = {},
): LinkInfo[] {
  if (routeBindings.length === 0) return [];
  const links: LinkInfo[] = [];
  const elements = sourceFile
    .getDescendantsOfKind(SyntaxKind.JsxElement)
    .filter((element) => {
      const tag = element.getOpeningElement().getTagNameNode().getText();
      return tag === "a" || tag === "Link" || tag === "NavLink";
    });

  for (const element of elements) {
    const opening = element.getOpeningElement();
    const rawHref =
      attributeText(opening, "href") ?? attributeText(opening, "to");
    if (rawHref === undefined) continue;
    const href = options.resolveHref
      ? options.resolveHref(rawHref, routeBindings)
      : isSafeLiteralPath(rawHref)
        ? rawHref
        : null;
    if (!href || !isSafeLiteralPath(href)) continue;
    const label =
      attributeText(opening, "aria-label") ?? visibleJsxText(element.getText());
    links.push({
      span: {
        filePath,
        startLine: element.getStartLineNumber(),
        endLine: element.getEndLineNumber(),
      },
      href,
      ...(label ? { label } : {}),
      routeBindings,
      excerpt: excerptOf(element.getText()),
    });
  }
  return links;
}

export function extractControls(
  sourceFile: SourceFile,
  filePath: string,
  routeBindings: { urlPattern: string; pathPattern: string }[],
): ControlInfo[] {
  if (routeBindings.length === 0) return [];
  const controls: ControlInfo[] = [];
  const elements: JsxTagElement[] = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
  ];
  for (const element of elements) {
    const tag = element.getTagNameNode().getText();
    if (tag !== "button" && tag !== "Button" && tag !== "input") continue;
    const onClick = attributeText(element, "onClick");
    const formAction = attributeText(element, "formAction");
    const owningForm = element.getAncestors().find((ancestor) => {
      if (!Node.isJsxElement(ancestor)) return false;
      const tag = ancestor.getOpeningElement().getTagNameNode().getText();
      return tag === "form" || tag === "Form";
    });
    const owningFormOpening =
      owningForm && Node.isJsxElement(owningForm)
        ? owningForm.getOpeningElement()
        : undefined;
    const isSubmitControl =
      tag === "button" ||
      (tag === "input" && attributeText(element, "type") === "submit");
    const formActionExpression =
      isSubmitControl && owningFormOpening
        ? attributeText(owningFormOpening, "action")
        : undefined;
    if (!onClick && !formAction && !formActionExpression) continue;
    if (
      formActionExpression &&
      !onClick &&
      !formAction &&
      owningFormOpening &&
      controlSelector(owningFormOpening)
    )
      continue;
    const selector = controlSelector(element);
    const parent = element.getParentIfKind(SyntaxKind.JsxElement);
    const expression = formAction ?? onClick ?? formActionExpression;
    const actionName = expression?.match(/[A-Za-z_$][\w$]*/)?.[0];
    const staticLabel =
      attributeText(element, "aria-label") ??
      attributeText(element, "value") ??
      (parent ? staticJsxText(parent) : undefined);
    // A handler identifier is useful reviewer context only when the runtime can
    // target the element through a stable selector. It is not the element's
    // accessible name and must never be used for an exact role/name lookup.
    const label = staticLabel ?? (selector ? actionName : undefined);
    if (!label) continue;
    const accessibleName = label.replace(/\s+/g, " ").trim().slice(0, 160);
    if (!selector && (tag !== "button" || !staticLabel || !accessibleName))
      continue;
    controls.push({
      span: {
        filePath,
        startLine: element.getStartLineNumber(),
        endLine: element.getEndLineNumber(),
      },
      ...(selector ? { selector } : { accessibleName }),
      label,
      event: formAction || formActionExpression ? "form_action" : "click",
      ...(actionName ? { actionName } : {}),
      routeBindings,
      excerpt: excerptOf(parent?.getText() ?? element.getText()),
    });
  }
  return controls;
}

function staticJsxText(element: Node): string | undefined {
  if (
    Node.isJsxElement(element) &&
    element
      .getJsxChildren()
      .some(
        (child) =>
          Node.isJsxExpression(child) ||
          child.getDescendantsOfKind(SyntaxKind.JsxExpression).length > 0,
      )
  ) {
    return undefined;
  }
  const text = element
    .getDescendantsOfKind(SyntaxKind.JsxText)
    .map((node) => node.getText())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 160) : undefined;
}

function controlSelector(element: JsxTagElement): string | undefined {
  const id = attributeText(element, "id");
  if (id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id)) return `#${id}`;
  const name = attributeText(element, "name");
  if (name && /^[a-zA-Z0-9_.:-]+$/.test(name)) return `[name="${name}"]`;
  for (const attr of ["data-testid", "data-action", "data-tool"]) {
    const value = attributeText(element, attr);
    if (value && /^[a-zA-Z0-9_.:-]+$/.test(value))
      return `[${attr}="${value}"]`;
  }
  const aria = attributeText(element, "aria-label");
  if (aria && /^[a-zA-Z0-9 _.,:'-]+$/.test(aria))
    return `[aria-label="${aria}"]`;
  return undefined;
}

function isSafeLiteralPath(value: string | undefined): value is string {
  return Boolean(
    value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    value.length <= 1024 &&
    !/[\\{}\s]/.test(value),
  );
}

function visibleJsxText(source: string): string | undefined {
  const text = source
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^{}]*\}/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 160) : undefined;
}

export function extractRouteHandlers(
  sourceFile: SourceFile,
  filePath: string,
  urlPattern: string,
  pathPattern: string,
  fileAuthSignals: AuthSignalInfo[],
): RouteHandlerInfo[] {
  const handlers: RouteHandlerInfo[] = [];
  for (const fn of collectExportedFunctions(sourceFile)) {
    if (!HTTP_METHODS.has(fn.name)) continue;
    const startLine = fn.node.getStartLineNumber();
    const endLine = fn.node.getEndLineNumber();
    handlers.push({
      method: fn.name as HttpMethod,
      urlPattern,
      pathPattern,
      span: { filePath, startLine, endLine },
      zodSchemaName: findSchemaParseCalls(fn.node)[0],
      authSignals: signalsWithin(fileAuthSignals, startLine, endLine),
      excerpt: excerptOf(fn.node.getText()),
    });
  }
  return handlers;
}

type JsxTagElement = JsxOpeningElement | JsxSelfClosingElement;

function attributeOf(
  element: JsxTagElement,
  name: string,
): JsxAttribute | undefined {
  for (const attribute of element.getAttributes()) {
    if (
      Node.isJsxAttribute(attribute) &&
      attribute.getNameNode().getText() === name
    )
      return attribute;
  }
  return undefined;
}

export function attributeText(
  element: JsxTagElement,
  name: string,
): string | undefined {
  const attribute = attributeOf(element, name);
  if (!attribute) return undefined;
  const initializer = attribute.getInitializer();
  if (!initializer) return "";
  if (Node.isStringLiteral(initializer)) return initializer.getLiteralValue();
  if (Node.isJsxExpression(initializer)) {
    const expr = initializer.getExpression();
    if (
      expr &&
      (Node.isStringLiteral(expr) || Node.isNoSubstitutionTemplateLiteral(expr))
    ) {
      return expr.getLiteralValue();
    }
    return expr?.getText();
  }
  return undefined;
}

export function extractForms(
  sourceFile: SourceFile,
  filePath: string,
  route: { urlPattern: string; pathPattern: string } | null,
  options: {
    functionActionKind?: "server_action" | "event_handler";
  } = {},
): FormInfo[] {
  const forms: FormInfo[] = [];
  const formElements = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement).filter((el) => {
      const tag = el.getOpeningElement().getTagNameNode().getText();
      return tag === "form" || tag === "Form";
    }),
  ];

  for (const formElement of formElements) {
    const opening = formElement.getOpeningElement();
    const fields: FormFieldInfo[] = [];
    let hasSensitiveFields = false;

    const controls: JsxTagElement[] = [
      ...formElement.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
      ...formElement
        .getDescendantsOfKind(SyntaxKind.JsxElement)
        .map((el) => el.getOpeningElement()),
    ];
    for (const control of controls) {
      const tag = control.getTagNameNode().getText();
      if (tag !== "input" && tag !== "select" && tag !== "textarea") continue;
      const name = attributeText(control, "name");
      if (!name) continue;
      const type =
        tag === "input" ? (attributeText(control, "type") ?? "text") : tag;
      // Hidden values (CSRF tokens, internal ids, honeypots) already belong to
      // the page and must never become agent-controlled tool inputs.
      if (type === "password" || type === "file") {
        hasSensitiveFields = true;
        continue;
      }
      if (["hidden", "submit"].includes(type)) continue;
      const autocomplete =
        attributeText(control, "autoComplete") ??
        attributeText(control, "autocomplete");
      if (autocomplete === "one-time-code" || /otp|captcha/i.test(name)) {
        hasSensitiveFields = true;
        continue;
      }
      let options: string[] | undefined;
      if (tag === "select") {
        const parent = control.getParentIfKind(SyntaxKind.JsxElement);
        if (parent) {
          options = parent
            .getDescendantsOfKind(SyntaxKind.JsxOpeningElement)
            .filter((el) => el.getTagNameNode().getText() === "option")
            .map((el) => attributeText(el, "value"))
            .filter((v): v is string => v !== undefined && v !== "");
        }
      }
      fields.push({
        name,
        type,
        required: attributeOf(control, "required") !== undefined,
        label:
          attributeText(control, "aria-label") ??
          attributeText(control, "placeholder"),
        options: options && options.length > 0 ? options : undefined,
      });
    }
    const actionAttr = attributeOf(opening, "action");
    const onSubmit = attributeText(opening, "onSubmit");
    let action: FormInfo["action"] = { kind: "unknown" };
    if (actionAttr) {
      const initializer = actionAttr.getInitializer();
      if (initializer && Node.isStringLiteral(initializer)) {
        action = {
          kind: "url",
          href: initializer.getLiteralValue(),
          method: (attributeText(opening, "method") ?? "get").toLowerCase(),
        };
      } else if (initializer && Node.isJsxExpression(initializer)) {
        const expr = initializer.getExpression();
        if (expr && Node.isIdentifier(expr)) {
          action = {
            kind: options.functionActionKind ?? "server_action",
            name: expr.getText(),
          };
        } else if (expr) {
          action = {
            kind: options.functionActionKind ?? "server_action",
            name: expr.getText().slice(0, 128),
          };
        }
      }
    }
    if (action.kind === "unknown" && onSubmit) {
      action = {
        kind: "event_handler",
        name: onSubmit.slice(0, 128),
      };
    }

    const selector = formSelector(opening);
    forms.push({
      span: {
        filePath,
        startLine: formElement.getStartLineNumber(),
        endLine: formElement.getEndLineNumber(),
      },
      urlPattern: route?.urlPattern,
      pathPattern: route?.pathPattern,
      ...(selector ? { selector } : {}),
      fields,
      hasSensitiveFields,
      action,
      excerpt: excerptOf(formElement.getText()),
    });
  }
  return forms;
}

function formSelector(element: JsxTagElement): string | undefined {
  const id = attributeText(element, "id");
  if (id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id)) return `#${id}`;
  const name = attributeText(element, "name");
  if (name && /^[a-zA-Z0-9_.:-]+$/.test(name)) {
    return `form[name="${name}"]`;
  }
  const action = attributeText(element, "action");
  if (action && /^\/[a-zA-Z0-9_./?=&%-]*$/.test(action)) {
    return `form[action="${action}"]`;
  }
  return undefined;
}
