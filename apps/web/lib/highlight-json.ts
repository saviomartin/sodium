/**
 * A tiny JSON tokenizer for the contract snippets this app renders.
 *
 * Every snippet here is JSON we produced ourselves: an excerpt of a
 * `sodium.json` tool, or a schema off a deployed contract. A highlighter
 * library would be several hundred kilobytes to colour a dozen lines, so this
 * scanner covers exactly what `JSON.stringify` can emit and falls back to
 * plain text on anything it does not recognise.
 *
 * `key` and `string` are separate kinds because they are the same lexeme doing
 * two different jobs: a quoted run followed by a colon names a field, and one
 * that is not is a value. Telling them apart is the whole reason a reader can
 * skim the shape of a contract without reading it.
 */

export type JsonTokenKind =
  | "key"
  | "string"
  | "number"
  | "keyword"
  | "punctuation"
  | "text";

export interface JsonToken {
  kind: JsonTokenKind;
  text: string;
}

const NUMBER = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/;
const KEYWORD = /^(true|false|null)/;
const PUNCTUATION = new Set(["{", "}", "[", "]", ":", ","]);

/** A quoted run, honouring backslash escapes, from `index` (which is a quote). */
function readString(source: string, index: number): string {
  let cursor = index + 1;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === "\\") {
      cursor += 2;
      continue;
    }
    cursor += 1;
    if (char === '"') break;
  }
  return source.slice(index, Math.min(cursor, source.length));
}

export function tokenizeJson(source: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  const push = (kind: JsonTokenKind, text: string) => {
    if (!text) return;
    const last = tokens[tokens.length - 1];
    if (last?.kind === kind) last.text += text;
    else tokens.push({ kind, text });
  };

  let index = 0;
  while (index < source.length) {
    const char = source[index] as string;

    if (char === '"') {
      const quoted = readString(source, index);
      index += quoted.length;
      // Whatever follows the closing quote decides what this run was: a colon
      // (past any whitespace) makes it a field name, anything else a value.
      const rest = source.slice(index);
      const colon = /^\s*:/.test(rest);
      push(colon ? "key" : "string", quoted);
      continue;
    }

    if (PUNCTUATION.has(char)) {
      push("punctuation", char);
      index += 1;
      continue;
    }

    const keyword = KEYWORD.exec(source.slice(index));
    if (keyword) {
      push("keyword", keyword[0]);
      index += keyword[0].length;
      continue;
    }

    const digits = NUMBER.exec(source.slice(index));
    if (digits && (char === "-" || (char >= "0" && char <= "9"))) {
      push("number", digits[0]);
      index += digits[0].length;
      continue;
    }

    push("text", char);
    index += 1;
  }

  return tokens;
}
