const TOKEN_STORAGE_KEY = 'kestrel_session_token';
const API_UNAVAILABLE_MESSAGE =
  'بيانات الشركة غير مهيأة على هذا النشر بعد. لا توجد قاعدة بيانات تشغيلية مرتبطة بهذا الموقع.';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors in restricted contexts
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T = unknown>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    isFormData?: boolean;
  } = {}
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.body !== undefined && !options.isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    body:
      options.body === undefined
        ? undefined
        : options.isFormData
        ? (options.body as FormData)
        : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(503, API_UNAVAILABLE_MESSAGE);
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : { error: await response.text() };

  if (!response.ok) {
    if (response.status === 404 && path === '/auth/status') {
      throw new ApiError(503, API_UNAVAILABLE_MESSAGE);
    }
    throw new ApiError(
      response.status,
      (data as { error?: string })?.error || `Request failed with status ${response.status}`
    );
  }

  return data as T;
}
