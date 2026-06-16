import { describe, expect, it } from "vitest";

import { parseCliArgs, replacePackageVersion, replaceRendererVersion, replaceVersionChangelog } from "./bump.mts";

describe("release bump tooling", () => {
  it("promotes Unreleased to a dated version section", () => {
    const changelog = "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Native polish.\n\n## [1.0.0] - 2026-06-16\n";

    expect(replaceVersionChangelog(changelog, "1.0.1", new Date("2026-06-17T10:00:00Z"))).toBe(
      "# Changelog\n\n## [Unreleased]\n\n## [1.0.1] - 2026-06-17\n\n### Added\n\n- Native polish.\n\n## [1.0.0] - 2026-06-16\n",
    );
  });

  it("updates package.json version only", () => {
    expect(replacePackageVersion('{"name":"react-linux","version":"1.0.0"}', "1.0.1")).toBe(
      '{"name":"react-linux","version": "1.0.1"}',
    );
  });

  it("updates host renderer version", () => {
    expect(replaceRendererVersion('rendererPackageName: "react-linux",\nrendererVersion: "1.0.0",', "1.0.1")).toBe(
      'rendererPackageName: "react-linux",\nrendererVersion: "1.0.1",',
    );
  });

  it("parses dry-run and version part flags", () => {
    expect(parseCliArgs(["node", "tools/bump.mts", "--dry-run", "--part", "minor"])).toEqual({
      dryRun: true,
      perform: false,
      releaseType: "minor",
    });
  });
});
