import { existsSync } from "node:fs";
import path from "node:path";

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
}

function isRepoRoot(candidate: string) {
  return existsSync(path.resolve(candidate, "pnpm-workspace.yaml")) && existsSync(path.resolve(candidate, "apps/api/package.json"));
}

function findRepoRoot(start: string) {
  let current = path.resolve(start);

  while (true) {
    if (isRepoRoot(current)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

export function resolveProjectRoot() {
  const moduleDir = __dirname;
  const starts = unique([process.env.PROJECT_ROOT, process.env.INIT_CWD, process.cwd(), moduleDir]);

  for (const start of starts) {
    const resolved = findRepoRoot(start);

    if (resolved) {
      return resolved;
    }
  }

  return path.resolve(process.cwd());
}
