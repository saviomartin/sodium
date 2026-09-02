import "server-only";
import { createHash, randomBytes } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomLowercase(length: number): string {
  const bytes = randomBytes(length);
  let result = "";
  for (const byte of bytes) result += ALPHABET[byte % ALPHABET.length];
  return result;
}

export function newDeviceCode(): string {
  return randomBytes(32).toString("base64url");
}

export function newApiToken(): string {
  return `sod_cli_${randomBytes(32).toString("base64url")}`;
}

export function newUserCode(): string {
  const bytes = randomBytes(8);
  let value = "";
  for (const byte of bytes)
    value += USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length];
  return `${value.slice(0, 4)}-${value.slice(4)}`;
}
