const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DASHBOARD_CATEGORY_ALL_LABEL = 'Todas as categorias';

export type DashboardCategoryType = 'REVENUE' | 'EXPENSE' | 'UNKNOWN';

export const DASHBOARD_CATEGORY_TYPE_LABELS: Record<DashboardCategoryType, string> = {
  REVENUE: 'Categorias de receita',
  EXPENSE: 'Categorias de despesa',
  UNKNOWN: 'Não classificadas',
};

export const DASHBOARD_CATEGORY_TYPE_ORDER: readonly DashboardCategoryType[] = [
  'REVENUE',
  'EXPENSE',
  'UNKNOWN',
];

export function isValidDashboardCategoryId(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

/** `category` da URL; UUID inválido/ausente → null (Todas). */
export function parseDashboardCategoryFromSearchParams(
  params: Readonly<URLSearchParams>,
): string | null {
  const raw = params.get('category');
  if (raw === null || raw.trim() === '') {
    return null;
  }
  const trimmed = raw.trim();
  return isValidDashboardCategoryId(trimmed) ? trimmed : null;
}

export function resolveSelectedDashboardCategoryId(
  params: Readonly<URLSearchParams>,
): string | null {
  return parseDashboardCategoryFromSearchParams(params);
}

/**
 * Atualiza `category` preservando os demais params.
 * `null`/vazio = Todas → omite o param.
 */
export function buildDashboardCategorySearchParams(
  params: Readonly<URLSearchParams>,
  categoryId: string | null,
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  if (categoryId === null || categoryId.trim() === '') {
    next.delete('category');
  } else {
    next.set('category', categoryId.trim());
  }
  return next;
}

export function matchesDashboardCategoryQuery(name: string, query: string): boolean {
  const needle = normalizeSearch(query);
  if (needle === '') {
    return true;
  }
  return normalizeSearch(name).includes(needle);
}

export type DashboardCategoryGroup = {
  readonly type: DashboardCategoryType;
  readonly label: string;
  readonly items: readonly { readonly id: string; readonly name: string }[];
};

export function groupDashboardCategories(
  items: readonly { readonly id: string; readonly name: string; readonly type: DashboardCategoryType }[],
): readonly DashboardCategoryGroup[] {
  return DASHBOARD_CATEGORY_TYPE_ORDER.flatMap((type) => {
    const grouped = items.filter((item) => item.type === type);
    if (grouped.length === 0) {
      return [];
    }
    return [
      {
        type,
        label: DASHBOARD_CATEGORY_TYPE_LABELS[type],
        items: grouped.map((item) => ({ id: item.id, name: item.name })),
      },
    ];
  });
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase();
}
