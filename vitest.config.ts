import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "dist/**", ".claude/**"],
    projects: [
      {
        extends: true,
        test: { name: "node", include: ["**/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          include: ["**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["tests/jsdom-setup.ts"],
        },
      },
    ],
  },
});
