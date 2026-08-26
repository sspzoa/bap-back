import type { MealProvider } from "@/providers/types";

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export class ProviderRegistry {
  private providers: MealProvider[] = [];

  register(provider: MealProvider): void {
    this.providers.push(provider);
  }

  getProviders(): readonly MealProvider[] {
    return this.providers;
  }

  findById(id: string): MealProvider | undefined {
    return this.providers.find((provider) => provider.config.id === id);
  }

  findByPath(path: string): MealProvider | undefined {
    return this.providers
      .filter((provider) => matchesPrefix(path, provider.config.basePath))
      .sort((a, b) => b.config.basePath.length - a.config.basePath.length)[0];
  }

  getSubPath(provider: MealProvider, fullPath: string): string {
    const prefix = provider.config.basePath;
    if (!matchesPrefix(fullPath, prefix)) {
      return fullPath;
    }

    return fullPath.slice(prefix.length) || "/";
  }
}

let registry: ProviderRegistry | null = null;

export function getRegistry(): ProviderRegistry {
  if (!registry) {
    registry = new ProviderRegistry();
  }
  return registry;
}
