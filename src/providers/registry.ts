import { createDguProvider } from "@/providers/dgu";
import { createKdmhsProvider } from "@/providers/kdmhs";
import type { MealProvider } from "@/providers/types";

class ProviderRegistry {
  private providers: MealProvider[] = [];

  register(provider: MealProvider): void {
    this.providers.push(provider);
  }

  getProviders(): readonly MealProvider[] {
    return this.providers;
  }

  findByPath(path: string): MealProvider | undefined {
    return this.providers
      .filter((p) => p.config.basePath !== "" && path.startsWith(p.config.basePath))
      .sort((a, b) => b.config.basePath.length - a.config.basePath.length)[0]
      ?? this.providers.find((p) => p.config.basePath === "");
  }

  getSubPath(provider: MealProvider, fullPath: string): string {
    if (provider.config.basePath === "") return fullPath;
    return fullPath.slice(provider.config.basePath.length) || "/";
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

export function initializeRegistry(): ProviderRegistry {
  const reg = getRegistry();

  // Guard against repeated initialization in the same process.
  if (reg.getProviders().length === 0) {
    reg.register(createKdmhsProvider());
    reg.register(createDguProvider());
  }

  return reg;
}
