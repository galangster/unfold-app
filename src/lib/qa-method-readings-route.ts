export const QA_METHOD_READINGS_ROUTE = '/qa-method-readings';

export function qaMethodReadingsHref(methodId = ''): {
  pathname: typeof QA_METHOD_READINGS_ROUTE;
  params: { method: string };
} {
  return {
    pathname: QA_METHOD_READINGS_ROUTE,
    params: { method: methodId },
  };
}

export function normalizeQaMethodParam(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
