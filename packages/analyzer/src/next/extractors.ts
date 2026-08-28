import {
  Node,
  SyntaxKind,
  type FunctionDeclaration,
  type JsxAttribute,
  type JsxOpeningElement,
  type JsxSelfClosingElement,
  type SourceFile,
  type VariableDeclaration,
} from "ts-morph";
import { excerptOf } from "../workspace";
import type {
  AuthSignalInfo,
  FormFieldInfo,
  FormInfo,
  HttpMethod,
  RouteHandlerInfo,
  ServerActionInfo,
} from "../types";
import { findSchemaParseCalls } from "./zod-schemas";
import { signalsWithin } from "./auth";

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
  params: { name: string; typeText: string }[];
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
    params: fn
      .getParameters()
      .map((p) => ({
        name: p.getName(),
        typeText: p.getTypeNode()?.getText() ?? "",
      })),
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
      ? initializer
          .getParameters()
          .map((p) => ({
            name: p.getName(),
            typeText: p.getTypeNode()?.getText() ?? "",
          }))
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

function attributeText(
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
): FormInfo[] {
  const forms: FormInfo[] = [];
  const formElements = [
    ...sourceFile
      .getDescendantsOfKind(SyntaxKind.JsxElement)
      .filter(
        (el) => el.getOpeningElement().getTagNameNode().getText() === "form",
      ),
  ];

  for (const formElement of formElements) {
    const opening = formElement.getOpeningElement();
    const fields: FormFieldInfo[] = [];

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
      if (type === "hidden" || type === "submit") {
        if (type === "submit") continue;
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
    if (fields.length === 0) continue;

    const actionAttr = attributeOf(opening, "action");
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
          action = { kind: "server_action", name: expr.getText() };
        } else if (expr) {
          action = {
            kind: "server_action",
            name: expr.getText().slice(0, 128),
          };
        }
      }
    }

    forms.push({
      span: {
        filePath,
        startLine: formElement.getStartLineNumber(),
        endLine: formElement.getEndLineNumber(),
      },
      urlPattern: route?.urlPattern,
      pathPattern: route?.pathPattern,
      fields,
      action,
      excerpt: excerptOf(formElement.getText()),
    });
  }
  return forms;
}
