import { existsSync, readFileSync } from "node:fs";
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

type LocalProjectConfig = {
  dataRoot?: string;
};

function resolveFromRepoRoot(repoRoot: string, value: string) {
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(repoRoot, value);
}

function readLocalProjectConfig(repoRoot: string): LocalProjectConfig | null {
  const configPath = path.resolve(repoRoot, "local/project-paths.json");

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const raw = readFileSync(configPath, "utf8");
    return JSON.parse(raw) as LocalProjectConfig;
  } catch {
    return null;
  }
}

export function resolveLocalDataRoot() {
  const repoRoot = resolveProjectRoot();
  const configuredValue = unique([process.env.YK_DATA_DIR, process.env.APP_DATA_DIR, process.env.LOCAL_DATA_DIR])[0];

  if (configuredValue) {
    return resolveFromRepoRoot(repoRoot, configuredValue);
  }

  const localConfig = readLocalProjectConfig(repoRoot);

  if (localConfig?.dataRoot?.trim()) {
    return resolveFromRepoRoot(repoRoot, localConfig.dataRoot.trim());
  }

  return path.resolve(repoRoot, "..", `${path.basename(repoRoot)}-local`);
}

export function getLocalProjectConfigPath() {
  return path.resolve(resolveProjectRoot(), "local/project-paths.json");
}
