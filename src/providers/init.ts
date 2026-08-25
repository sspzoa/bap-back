import { createDguProvider } from "@/providers/dgu";
import { createKdmhsProvider } from "@/providers/kdmhs";
import { createMegaProvider } from "@/providers/mega";
import { getRegistry, type ProviderRegistry } from "@/providers/registry";

export function initializeRegistry(): ProviderRegistry {
  const reg = getRegistry();

  // Guard against repeated initialization in the same process.
  if (reg.getProviders().length === 0) {
    reg.register(createKdmhsProvider());
    reg.register(createDguProvider());
    reg.register(createMegaProvider());
  }

  return reg;
}
