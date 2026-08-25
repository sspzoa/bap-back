import type { PublicMeal } from "@/core/types";

export type ResolveResult<T> = { ok: true; value: T } | { ok: false; message: string };

export interface ResolvableProvider {
  id: string;
  name: string;
  schoolName: string;
  basePath: string;
  keywords: string[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/^\//, "");
}

function tokens(provider: ResolvableProvider): string[] {
  return [provider.id, provider.name, provider.schoolName, provider.basePath, ...provider.keywords]
    .map(normalize)
    .filter(Boolean);
}

export function resolveProvider<T extends ResolvableProvider>(
  providers: readonly T[],
  query: string,
): ResolveResult<T> {
  const needle = normalize(query);
  if (!needle) {
    return { ok: false, message: "provider를 입력해 주세요. list_providers로 목록을 볼 수 있어요." };
  }

  if (providers.length === 0) {
    return { ok: false, message: "등록된 프로바이더가 없어요." };
  }

  const exact = providers.filter((provider) => tokens(provider).includes(needle));
  if (exact.length === 1) {
    return { ok: true, value: exact[0] };
  }
  if (exact.length > 1) {
    return {
      ok: false,
      message: `여러 프로바이더가 맞아요: ${exact.map((provider) => provider.id).join(", ")}. id로 다시 지정해 주세요.`,
    };
  }

  const partial = providers.filter((provider) =>
    tokens(provider).some((token) => token.includes(needle) || needle.includes(token)),
  );
  if (partial.length === 1) {
    return { ok: true, value: partial[0] };
  }
  if (partial.length > 1) {
    return {
      ok: false,
      message: `여러 프로바이더가 맞아요: ${partial.map((provider) => provider.id).join(", ")}. id로 다시 지정해 주세요.`,
    };
  }

  return {
    ok: false,
    message: `프로바이더를 찾지 못했어요: ${query}. 사용 가능: ${providers.map((provider) => provider.id).join(", ")}`,
  };
}

export function resolveMeals(meals: PublicMeal[], query?: string): ResolveResult<PublicMeal[]> {
  if (!query?.trim()) {
    return { ok: true, value: meals };
  }

  const needle = normalize(query);
  const matched = meals.filter((meal) => normalize(meal.id) === needle || normalize(meal.title).includes(needle));

  if (matched.length === 0) {
    const available = meals.map((meal) => meal.id).join(", ") || "(없음)";
    return { ok: false, message: `끼니를 찾지 못했어요: ${query}. 사용 가능: ${available}` };
  }

  return { ok: true, value: matched };
}
