export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const defaultHeaders: Record<string, string> = {
    'Accept': 'application/json',
  }

  if (!(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json'
  }

  const config: RequestInit = {
    ...options,
    credentials: 'include',
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  }

  const response = await fetch(endpoint, config)

  if (response.status === 401) {
    if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
      window.location.href = '/login'
    }
    throw new Error('Unauthorized')
  }

  if (!response.ok) {
    let errorMsg = 'An error occurred'
    try {
      const errJson = await response.json()
      if (errJson.detail) {
        if (typeof errJson.detail === 'string') {
          errorMsg = errJson.detail
        } else if (Array.isArray(errJson.detail)) {
          errorMsg = errJson.detail.map((d: any) => d.msg || d.error || JSON.stringify(d)).join(', ')
        }
      }
    } catch {}
    throw new Error(errorMsg)
  }

  if (response.status === 204) {
    return {} as T
  }

  return response.json()
}
