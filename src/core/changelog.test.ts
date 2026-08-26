import { describe, expect, test } from "bun:test";
import { loadChangelogMarkdown, renderChangelogHtml } from "@/core/changelog";

describe("loadChangelogMarkdown", () => {
  test("loads root CHANGELOG.md", async () => {
    const markdown = await loadChangelogMarkdown();
    expect(markdown).toContain("# Changelog");
    expect(markdown).toContain("## [");
  });
});

describe("renderChangelogHtml", () => {
  test("wraps markdown in an HTML document", () => {
    const html = renderChangelogHtml("# Changelog\n\n- item one");

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<h1>Changelog</h1>");
    expect(html).toContain("<li>item one</li>");
    expect(html).toContain('lang="ko"');
  });
});
