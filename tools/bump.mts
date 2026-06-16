#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import semver from "semver";

type ReleaseType = "major" | "minor" | "patch";

interface CliArgs {
  readonly dryRun: boolean;
  readonly perform: boolean;
  readonly releaseType: ReleaseType;
}

const PROJECT_HOME = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_SPECIFIER = resolve(PROJECT_HOME, "package.json");
const PROJECT_CHANGELOG = resolve(PROJECT_HOME, "CHANGELOG.md");
const PROJECT_HOST_CONFIG = resolve(PROJECT_HOME, "hostConfig.ts");
const RELEASE_TYPES = new Set<ReleaseType>(["major", "minor", "patch"]);

export function replaceVersionChangelog(text: string, newVersion: string, date = new Date()): string {
  const today = date.toISOString().slice(0, 10);
  // Tolerate either the literal `YYYY-MM-DD` placeholder or a real ISO date
  // that someone may have typed in while drafting an entry.
  const pattern = /^## \[Unreleased\](?: - (?:YYYY-MM-DD|\d{4}-\d{2}-\d{2}))?$/m;
  if (!pattern.test(text)) {
    return text;
  }
  return text.replace(pattern, `## [Unreleased]\n\n## [${newVersion}] - ${today}`);
}

export function replacePackageVersion(text: string, newVersion: string): string {
  return text.replace(/"version":\s*"[^"]*"/, `"version": "${newVersion}"`);
}

export function replaceRendererVersion(text: string, newVersion: string): string {
  return text.replace(/rendererVersion:\s*"[^"]*"/, `rendererVersion: "${newVersion}"`);
}

function printHelp(): void {
  console.log(
    "Usage: node tools/bump.mts [--perform] [--dry-run] [--part patch|minor|major]\n\n" +
      "  --perform             After bumping, run git add/commit/tag/push.\n" +
      "  --dry-run             Print what would change without touching files.\n" +
      "  --part <part>         Version part to bump. Defaults to patch.\n" +
      "  --part=<part>         Same as --part <part>.\n",
  );
}

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false, perform: false, releaseType: "patch" };
  const mutable = { ...args };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--perform") {
      mutable.perform = true;
    } else if (arg === "--dry-run") {
      mutable.dryRun = true;
    } else if (arg === "--part") {
      const value = argv[index + 1];
      if (!RELEASE_TYPES.has(value as ReleaseType)) {
        throw new Error(`Unknown version part: ${value ?? ""}`);
      }
      mutable.releaseType = value as ReleaseType;
      index += 1;
    } else if (arg.startsWith("--part=")) {
      const value = arg.slice("--part=".length);
      if (!RELEASE_TYPES.has(value as ReleaseType)) {
        throw new Error(`Unknown version part: ${value}`);
      }
      mutable.releaseType = value as ReleaseType;
    } else if (RELEASE_TYPES.has(arg as ReleaseType)) {
      mutable.releaseType = arg as ReleaseType;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return mutable;
}

function replaceFile(path: string, content: string, dryRun: boolean): void {
  if (dryRun) {
    return;
  }
  writeFileSync(path, content, "utf-8");
}

export function main(argv = process.argv): number {
  let args: CliArgs;
  try {
    args = parseCliArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    printHelp();
    return 2;
  }

  const specifierText = readFileSync(PROJECT_SPECIFIER, "utf-8");
  const currentVersion = (JSON.parse(specifierText) as { version: string }).version;
  const nextVersion = semver.inc(currentVersion, args.releaseType);
  if (!nextVersion) {
    console.error(`Failed to bump version from ${currentVersion}`);
    return 1;
  }

  const changelog = replaceVersionChangelog(readFileSync(PROJECT_CHANGELOG, "utf-8"), nextVersion);
  const specifier = replacePackageVersion(specifierText, nextVersion);
  const hostConfig = replaceRendererVersion(readFileSync(PROJECT_HOST_CONFIG, "utf-8"), nextVersion);

  const replacementsSucceeded =
    changelog.includes(`## [${nextVersion}] - `) &&
    specifier.includes(`"version": "${nextVersion}"`) &&
    hostConfig.includes(`rendererVersion: "${nextVersion}"`);

  if (!replacementsSucceeded) {
    console.error("Version replacement failed - changelog, package.json, or hostConfig.ts did not update.");
    return 1;
  }

  const vcsCommands = [
    "git add .",
    `git commit -m "Release ${nextVersion}"`,
    `git tag -a "${nextVersion}" -m "${nextVersion}"`,
    "git push",
    "git push --tags",
  ];

  console.log(
    `${args.dryRun ? "Dry run - " : ""}Bumping from ${currentVersion} to ${nextVersion} (${args.releaseType}).`,
  );

  if (args.dryRun) {
    console.log("\nWould update:");
    console.log("\tCHANGELOG.md");
    console.log("\tpackage.json");
    console.log("\thostConfig.ts");
    console.log("\nYou can manually execute:\n");
    for (const cmd of vcsCommands) {
      console.log(`\t${cmd}`);
    }
    console.log("");
    return 0;
  }

  replaceFile(PROJECT_CHANGELOG, changelog, args.dryRun);
  replaceFile(PROJECT_SPECIFIER, specifier, args.dryRun);
  replaceFile(PROJECT_HOST_CONFIG, hostConfig, args.dryRun);
  execSync("yarn install --frozen-lockfile", { cwd: PROJECT_HOME, stdio: "inherit" });

  if (args.perform) {
    for (const cmd of vcsCommands) {
      console.log(`Executing: ${cmd}`);
      execSync(cmd, { cwd: PROJECT_HOME, stdio: "inherit" });
    }
  } else {
    console.log("You need to manually execute:\n");
    for (const cmd of vcsCommands) {
      console.log(`\t${cmd}`);
    }
    console.log("");
  }

  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(main());
}
