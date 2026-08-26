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
