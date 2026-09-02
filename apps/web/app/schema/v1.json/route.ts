import { z } from "zod";
import { SodiumConfigSchema } from "sodium-webmcp-spec";

export function GET() {
  return Response.json(
    z.toJSONSchema(SodiumConfigSchema, {
      target: "draft-2020-12",
      io: "input",
      reused: "ref",
    }),
    {
      headers: {
        "cache-control": "public, max-age=3600, s-maxage=86400, immutable",
      },
    },
  );
}
