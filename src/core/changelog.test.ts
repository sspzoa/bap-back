import { describe, expect, test } from "bun:test";
import { loadChangelogMarkdown } from "@/core/changelog";

describe("loadChangelogMarkdown", () => {
  test("loads root CHANGELOG.md", async () => {
    const markdown = await loadChangelogMarkdown();
    expect(markdown).toContain("# Changelog");
    expect(markdown).toContain("## [");
  });
});
