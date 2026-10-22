export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: { ...(options.body && !(options.body instanceof FormData) ? {'Content-Type':'application/json'} : {}), ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir. Tente novamente.');
  return data as T;
}
export function json(method: string, body?: unknown): RequestInit { return {method, ...(body === undefined ? {} : {body: JSON.stringify(body)})}; }
export function duration(seconds: number) { const n = Math.floor(Number.isFinite(seconds) ? seconds : 0); return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`; }
