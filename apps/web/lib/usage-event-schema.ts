import { z } from "zod";
import {
  DEPLOYMENT_ID_PATTERN,
  PROJECT_ID_PATTERN,
  PUBLISHABLE_KEY_PATTERN,
  TOOL_ID_PATTERN,
  TOOL_NAME_PATTERN,
} from "sodium-webmcp-spec";
import { ANSWER_ENGINE_NAMES } from "./answer-engines";

export const UsageEventSchema = z
  .object({
    projectId: z.string().regex(PROJECT_ID_PATTERN),
    key: z.string().regex(PUBLISHABLE_KEY_PATTERN),
    deploymentId: z.string().regex(DEPLOYMENT_ID_PATTERN).optional(),
    configVersion: z.number().int().positive().optional(),
    sdkVersion: z.string().min(1).max(32),
    event: z.enum([
      "sdk_ready",
      "answer_engine_referral",
      "tool_registered",
      "tool_register_failed",
      "tool_started",
      "tool_succeeded",
      "tool_failed",
      "confirmation_denied",
    ]),
    toolId: z.string().regex(TOOL_ID_PATTERN).optional(),
    toolName: z.string().regex(TOOL_NAME_PATTERN).optional(),
    invocationId: z.string().uuid().optional(),
    durationMs: z.number().int().min(0).max(3_600_000).optional(),
    errorCode: z.string().min(1).max(80).optional(),
    sessionId: z.string().uuid().optional(),
    answerEngine: z.enum(ANSWER_ENGINE_NAMES).optional(),
    attributionMethod: z.enum(["referrer", "campaign"]).optional(),
    ts: z.number().int().positive(),
  })
  .strict()
  .superRefine((event, context) => {
    if (event.event === "answer_engine_referral") {
      for (const field of [
        ["sessionId", event.sessionId],
        ["answerEngine", event.answerEngine],
        ["attributionMethod", event.attributionMethod],
      ] as const) {
        if (!field[1]) {
          context.addIssue({
            code: "custom",
            path: [field[0]],
            message: `${field[0]} is required for referral events`,
          });
        }
      }
      return;
    }
    if (event.answerEngine || event.attributionMethod) {
      context.addIssue({
        code: "custom",
        path: ["answerEngine"],
        message: "answer-engine attribution is only valid for referral events",
      });
    }
  });
