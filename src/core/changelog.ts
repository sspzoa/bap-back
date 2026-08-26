import { marked } from "marked";

let cachedMarkdown: string | null = null;

export async function loadChangelogMarkdown(): Promise<string> {
  if (cachedMarkdown) {
    return cachedMarkdown;
  }

  const file = Bun.file(new URL("../../CHANGELOG.md", import.meta.url));
  cachedMarkdown = await file.text();
  return cachedMarkdown;
}

export function clearChangelogCache(): void {
  cachedMarkdown = null;
}

export function renderChangelogHtml(markdown: string): string {
  const content = marked.parse(markdown) as string;

  return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Changelog — 밥.net</title>
    <style>
      :root {
        color-scheme: light dark;
        --text: #1a1a1a;
        --muted: #666;
        --border: #e5e5e5;
        --link: #2563eb;
        --code-bg: #f4f4f5;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --text: #f4f4f5;
          --muted: #a1a1aa;
          --border: #3f3f46;
          --link: #60a5fa;
          --code-bg: #27272a;
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 2rem 1.25rem 3rem;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        font-size: 16px;
        line-height: 1.6;
        color: var(--text);
        background: Canvas;
      }
      main {
        max-width: 42rem;
        margin: 0 auto;
      }
      h1 {
        margin: 0 0 0.5rem;
        font-size: 2rem;
        letter-spacing: -0.02em;
      }
      h2 {
        margin: 2rem 0 0.75rem;
        padding-bottom: 0.35rem;
        font-size: 1.25rem;
        border-bottom: 1px solid var(--border);
      }
      h3 {
        margin: 1.25rem 0 0.5rem;
        font-size: 1rem;
      }
      p { margin: 0.75rem 0; }
      ul {
        margin: 0.5rem 0;
        padding-left: 1.4rem;
      }
      li { margin: 0.25rem 0; }
      a {
        color: var(--link);
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      code {
        padding: 0.15em 0.35em;
        font-size: 0.9em;
        background: var(--code-bg);
        border-radius: 4px;
      }
      hr {
        margin: 2rem 0;
        border: none;
        border-top: 1px solid var(--border);
      }
    </style>
  </head>
  <body>
    <main>${content}</main>
  </body>
</html>
`;
}
