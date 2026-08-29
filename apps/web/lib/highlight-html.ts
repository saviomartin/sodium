/**
 * A tiny HTML tokenizer for the install snippets we render.
 *
 * The snippets are short, fixed-shape markup we generate ourselves, so a
 * highlighter library would be several hundred kilobytes to colour one line.
 * This scanner covers what markup can appear there — tags, attributes, quoted
 * values, comments, text — and falls back to plain text on anything else.
 */

export type HtmlTokenKind =
  "attribute" | "comment" | "name" | "punctuation" | "string" | "text";

export interface HtmlToken {
  kind: HtmlTokenKind;
  text: string;
}

const TAG_OPEN = /^<\/?([a-zA-Z][\w.:-]*)/;
const ATTRIBUTE_NAME = /^[^\s=/>"']+/;

export function tokenizeHtml(source: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  const push = (kind: HtmlTokenKind, text: string) => {
    if (!text) return;
    const last = tokens[tokens.length - 1];
    if (last?.kind === kind) last.text += text;
    else tokens.push({ kind, text });
  };

  let index = 0;
  while (index < source.length) {
    const open = source.indexOf("<", index);
    if (open === -1) {
      push("text", source.slice(index));
      break;
    }
    push("text", source.slice(index, open));

    if (source.startsWith("<!--", open)) {
      const close = source.indexOf("-->", open);
      const end = close === -1 ? source.length : close + 3;
      push("comment", source.slice(open, end));
      index = end;
      continue;
    }

    const tag = TAG_OPEN.exec(source.slice(open));
    if (!tag) {
      push("text", "<");
      index = open + 1;
      continue;
    }
    push("punctuation", tag[0].startsWith("</") ? "</" : "<");
    push("name", tag[1] as string);
    index = open + tag[0].length;

    // Attributes, up to the closing angle bracket of this tag.
    while (index < source.length && source[index] !== ">") {
      const char = source[index] as string;
      if (/\s/.test(char)) {
        push("text", char);
        index += 1;
        continue;
      }
      if (char === "=" || char === "/") {
        push("punctuation", char);
        index += 1;
        continue;
      }
      if (char === '"' || char === "'") {
        const close = source.indexOf(char, index + 1);
        const end = close === -1 ? source.length : close + 1;
        push("string", source.slice(index, end));
        index = end;
        continue;
      }
      const attribute = ATTRIBUTE_NAME.exec(source.slice(index));
      if (!attribute) {
        push("text", char);
        index += 1;
        continue;
      }
      push("attribute", attribute[0]);
      index += attribute[0].length;
    }

    if (source[index] === ">") {
      push("punctuation", ">");
      index += 1;
    }
  }

  return tokens;
}
