import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environmentOptions: {
      happyDOM: {
        url: "http://localhost:4000/",
      },
    },
  },
});
