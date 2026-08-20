import type { MealProvider } from "@/providers/types";

function providerPaths(provider: MealProvider): string[] {
  return [provider.config.basePath, ...(provider.config.aliases ?? [])];
}

function matchesPrefix(path: string, prefix: string): boolean {
  return prefix !== "" && (path === prefix || path.startsWith(`${prefix}/`));
}

export class ProviderRegistry {
  private providers: MealProvider[] = [];

  register(provider: MealProvider): void {
    this.providers.push(provider);
  }

  getProviders(): readonly MealProvider[] {
    return this.providers;
  }

  findByPath(path: string): MealProvider | undefined {
    const prefixMatch = this.providers
      .flatMap((provider) => providerPaths(provider).map((prefix) => ({ provider, prefix })))
      .filter(({ prefix }) => matchesPrefix(path, prefix))
      .sort((a, b) => b.prefix.length - a.prefix.length)[0];

    return prefixMatch?.provider ?? this.providers.find((provider) => providerPaths(provider).includes(""));
  }

  getSubPath(provider: MealProvider, fullPath: string): string {
    const matchedPrefix = providerPaths(provider)
      .filter((prefix) => matchesPrefix(fullPath, prefix))
      .sort((a, b) => b.length - a.length)[0];

    if (!matchedPrefix) {
      return fullPath;
    }

    return fullPath.slice(matchedPrefix.length) || "/";
  }

  getAllOrigins(): string[] {
    return this.providers.flatMap((p) => p.config.origins);
  }
}

let registry: ProviderRegistry | null = null;

export function getRegistry(): ProviderRegistry {
  if (!registry) {
    registry = new ProviderRegistry();
  }
  return registry;
}
