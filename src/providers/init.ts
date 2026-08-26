import { createDguProvider } from "@/providers/dgu";
import { createHorangProvider } from "@/providers/horang";
import { createKdmhsProvider } from "@/providers/kdmhs";
import { getRegistry, type ProviderRegistry } from "@/providers/registry";

export function initializeRegistry(): ProviderRegistry {
  const reg = getRegistry();

  // Guard against repeated initialization in the same process.
  if (reg.getProviders().length === 0) {
    reg.register(createKdmhsProvider());
    reg.register(createDguProvider());
    reg.register(createHorangProvider());
  }

  return reg;
}
