import type { Catalog } from '../shared/types';

async function staticCatalog(path: string): Promise<Catalog | null> {
  const response = await fetch('/catalog.json');
  if (!response.ok) return null;
  const catalog = await response.json() as Catalog;
  const query = new URLSearchParams(path.split('?')[1] ?? '');
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const search = normalize(query.get('q') ?? '');
  const matches = (...parts: string[]) => normalize(parts.join(' ')).includes(search);
  const offset = Math.max(0, Number(query.get('offset')) || 0);
  const limit = Math.min(100, Math.max(1, Number(query.get('limit')) || 50));
  const tracks = catalog.tracks.filter(track => matches(track.title, track.artistName, track.albumTitle, track.category));
  return {
    ...catalog,
    tracks: tracks.slice(offset, offset + limit),
    total: tracks.length,
    artists: catalog.artists.filter(artist => matches(artist.name, artist.bio)),
    albums: catalog.albums.filter(album => matches(album.title, album.artistName)),
    playlists: catalog.playlists.filter(playlist => matches(playlist.name, playlist.description)),
  };
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: { ...(options.body && !(options.body instanceof FormData) ? {'Content-Type':'application/json'} : {}), ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && response.status >= 500 && !options.method && path.startsWith('/catalog')) {
    const fallback = await staticCatalog(path).catch(() => null);
    if (fallback) return fallback as T;
  }
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir. Tente novamente.');
  return data as T;
}
export function json(method: string, body?: unknown): RequestInit { return {method, ...(body === undefined ? {} : {body: JSON.stringify(body)})}; }
export function duration(seconds: number) { const n = Math.floor(Number.isFinite(seconds) ? seconds : 0); return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`; }
