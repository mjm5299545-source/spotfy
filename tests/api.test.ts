import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.ts';
import type { Catalog } from '../shared/types.ts';

const password = 'Teste-seguro-123!';
const fixture: Catalog = {
  artists: [{ id: 'artist-a', name: 'Aurora Autoral', bio: 'Música original de teste', image: '/media/cover.svg' }],
  albums: [{ id: 'album-a', title: 'Horizontes', artistId: 'artist-a', artistName: 'Aurora Autoral', cover: '/media/cover.svg', year: 2026 }],
  tracks: ['Amanhecer', 'Oceano'].map((title, i) => ({ id: `track-${i}`, title, artistId: 'artist-a', artistName: 'Aurora Autoral', albumId: 'album-a', albumTitle: 'Horizontes', cover: '/media/cover.svg', duration: 1, audioUrl: '/media/test.wav', category: 'Ambient', license: 'CC0-1.0' })),
  playlists: [{ id: 'editorial-a', name: 'Paz', description: 'Seleção de teste', cover: '/media/cover.svg', ownerId: null, ownerName: 'Spotfy', isPublic: true, trackIds: ['track-0'] }], total: 2,
};

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'spotfy-api-'));
  const publicDir = join(dir, 'public');
  mkdirSync(join(publicDir, 'media'), { recursive: true });
  writeFileSync(join(publicDir, 'catalog.json'), JSON.stringify(fixture));
  const wav = Buffer.alloc(76);
  wav.write('RIFF'); wav.writeUInt32LE(68, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(32, 40);
  writeFileSync(join(publicDir, 'media', 'test.wav'), wav);
  const instance = createApp({ dbPath: join(dir, 'db.sqlite'), dataDir: dir, publicDir });
  let server = instance.app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = () => `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const request = async (path: string, method = 'GET', body?: unknown, cookie?: string) => {
    const response = await fetch(url() + path, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    return { response, data, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' };
  };
  const register = async (email = 'ana@example.test') => {
    const result = await request('/api/auth/register', 'POST', { name: 'Ana', email, password });
    assert.equal(result.response.status, 201);
    return result;
  };
  const stop = async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); instance.close(); };
  return { dir, publicDir, instance, request, register, url, wav, stop, cleanup: async () => { await stop(); rmSync(dir, { recursive: true, force: true }); }, setServer: (value: typeof server) => { server = value; } };
}

test('cadastro, validações, login, perfil e revogação de sessão funcionam via HTTP', async () => {
  const f = await setup();
  try {
    const invalid = await f.request('/api/auth/register', 'POST', { name: '', email: 'invalido', password: '123' });
    assert.equal(invalid.response.status, 400);
    const registered = await f.register();
    assert.equal(registered.data.user.email, 'ana@example.test');
    assert.equal(registered.data.user.role, 'user');
    assert.equal('password_hash' in registered.data.user, false);
    const stored = f.instance.db.prepare('SELECT password_hash FROM users WHERE id=?').get(registered.data.user.id);
    assert.notEqual(stored?.password_hash, password);
    assert.ok(String(stored?.password_hash).includes(':'));
    assert.equal((await f.request('/api/auth/register', 'POST', { name: 'Ana', email: 'ANA@example.test', password })).response.status, 409);
    assert.equal((await f.request('/api/auth/login', 'POST', { email: 'ana@example.test', password: 'incorreta' })).response.status, 401);
    const login = await f.request('/api/auth/login', 'POST', { email: 'ANA@example.test', password });
    assert.equal(login.response.status, 200);
    assert.match(login.response.headers.get('set-cookie') ?? '', /HttpOnly/i);
    assert.match(login.response.headers.get('set-cookie') ?? '', /SameSite=Lax/i);
    assert.equal((await f.request('/api/me', 'GET', undefined, login.cookie)).data.user.id, registered.data.user.id);
    const profile = await f.request('/api/me', 'PATCH', { name: 'Ana Maria' }, login.cookie);
    assert.equal(profile.response.status, 200);
    assert.equal(profile.data.user.name, 'Ana Maria');
    assert.equal((await f.request('/api/auth/logout', 'POST', undefined, login.cookie)).response.status, 200);
    assert.equal((await f.request('/api/me', 'GET', undefined, login.cookie)).data.user, null);
    assert.equal((await f.request('/api/library', 'GET', undefined, login.cookie)).response.status, 401);
  } finally { await f.cleanup(); }
});

test('catálogo pesquisa dados persistidos, pagina e não inventa resultados', async () => {
  const f = await setup();
  try {
    const all = await f.request('/api/catalog?limit=1&offset=0');
    assert.equal(all.response.status, 200);
    assert.equal(all.data.total, 2);
    assert.equal(all.data.tracks.length, 1);
    const page2 = await f.request('/api/catalog?limit=1&offset=1');
    assert.notEqual(all.data.tracks[0].id, page2.data.tracks[0].id);
    const found = await f.request('/api/catalog?q=oceano');
    assert.equal(found.data.tracks.length, 1);
    assert.equal(found.data.tracks[0].title, 'Oceano');
    const empty = await f.request('/api/catalog?q=nenhuma-faixa-corresponde');
    assert.deepEqual(empty.data.tracks, []);
    assert.deepEqual(empty.data.artists, []);
    assert.deepEqual(empty.data.albums, []);
  } finally { await f.cleanup(); }
});

test('biblioteca, ordem de playlist e preferências sobrevivem à reabertura do SQLite', async () => {
  const f = await setup();
  let stopped = false;
  try {
    const owner = await f.register();
    const cookie = owner.cookie;
    for (const route of ['tracks/track-0', 'albums/album-a', 'artists/artist-a']) assert.equal((await f.request(`/api/library/${route}`, 'PUT', undefined, cookie)).response.status, 200);
    const made = await f.request('/api/playlists', 'POST', { name: 'Minha seleção', description: 'Persistente', isPublic: false }, cookie);
    assert.equal(made.response.status, 201);
    const playlistId = made.data.playlist.id;
    const invalidEdit = await f.request(`/api/playlists/${playlistId}`, 'PATCH', { name: 'Não deve persistir', trackIds: ['track-0', 'missing-track'] }, cookie);
    assert.equal(invalidEdit.response.status, 400);
    assert.equal((await f.request(`/api/playlists/${playlistId}`, 'GET', undefined, cookie)).data.playlist.name, 'Minha seleção', 'falha na edição deve reverter nome e ordem juntos');
    const edited = await f.request(`/api/playlists/${playlistId}`, 'PATCH', { name: 'Ordem pessoal', trackIds: ['track-1', 'track-0'] }, cookie);
    assert.equal(edited.response.status, 200);
    assert.deepEqual(edited.data.playlist.trackIds, ['track-1', 'track-0']);
    assert.equal((await f.request('/api/preferences', 'PUT', { volume: 0.32, shuffle: true, repeat: 'all' }, cookie)).response.status, 200);
    assert.equal((await f.request('/api/history', 'POST', { trackId: 'track-1' }, cookie)).response.status, 201);
    await f.stop(); stopped = true;
    const reopened = createApp({ dbPath: join(f.dir, 'db.sqlite'), dataDir: f.dir, publicDir: f.publicDir });
    const server = reopened.app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    try {
      const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const libraryResponse = await fetch(endpoint + '/api/library', { headers: { Cookie: cookie } });
      assert.equal(libraryResponse.status, 200);
      const library = await libraryResponse.json();
      assert.deepEqual(library.likedTrackIds, ['track-0']);
      assert.deepEqual(library.savedAlbumIds, ['album-a']);
      assert.deepEqual(library.followedArtistIds, ['artist-a']);
      assert.deepEqual(library.playlists.find((p: { id: string }) => p.id === playlistId).trackIds, ['track-1', 'track-0']);
      const preferences = await (await fetch(endpoint + '/api/preferences', { headers: { Cookie: cookie } })).json();
      assert.deepEqual(preferences.preferences, { volume: 0.32, shuffle: true, repeat: 'all' });
      assert.equal(reopened.db.prepare('SELECT COUNT(*) n FROM listening_history WHERE user_id=?').get(owner.data.user.id)?.n, 1);
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); reopened.close(); }
  } finally { if (!stopped) await f.stop(); rmSync(f.dir, { recursive: true, force: true }); }
});

test('remoção da biblioteca, edição e exclusão de playlists são persistidas', async () => {
  const f = await setup();
  try {
    const { cookie } = await f.register();
    for (const route of ['tracks/track-0', 'albums/album-a', 'artists/artist-a']) {
      assert.equal((await f.request(`/api/library/${route}`, 'PUT', undefined, cookie)).response.status, 200);
      assert.equal((await f.request(`/api/library/${route}`, 'DELETE', undefined, cookie)).response.status, 200);
    }
    const library = (await f.request('/api/library', 'GET', undefined, cookie)).data;
    assert.deepEqual(library.likedTrackIds, []); assert.deepEqual(library.savedAlbumIds, []); assert.deepEqual(library.followedArtistIds, []);
    const made = await f.request('/api/playlists', 'POST', { name: 'Temporária' }, cookie);
    const path = `/api/playlists/${made.data.playlist.id}`;
    assert.equal((await f.request(path, 'DELETE', undefined, cookie)).response.status, 200);
    assert.equal((await f.request(path, 'GET', undefined, cookie)).response.status, 404);
  } finally { await f.cleanup(); }
});

test('recuperação usa token de uso único, troca a senha e invalida sessões antigas', async () => {
  const f = await setup();
  try {
    const owner = await f.register();
    const unknown = await f.request('/api/auth/forgot-password', 'POST', { email: 'ausente@example.test' });
    const known = await f.request('/api/auth/forgot-password', 'POST', { email: 'ana@example.test' });
    assert.equal(known.response.status, 202); assert.deepEqual(known.data, unknown.data);
    assert.equal(/token|reset_url/i.test(JSON.stringify(known.data)), false);
    const outbox = join(f.dir, 'outbox');
    const messages = readdirSync(outbox).filter(name => name.endsWith('.eml'));
    assert.equal(messages.length, 1);
    const content = readFileSync(join(outbox, messages[0]), 'utf8');
    const token = content.match(/[?&]token=([a-zA-Z0-9_-]+)/)?.[1];
    assert.ok(token, 'mensagem de recuperação deve conter link com token');
    const changed = await f.request('/api/auth/reset-password', 'POST', { token, password: 'Nova-senha-segura-456!' });
    assert.equal(changed.response.status, 200);
    assert.equal((await f.request('/api/me', 'GET', undefined, owner.cookie)).data.user, null);
    assert.equal((await f.request('/api/auth/login', 'POST', { email: 'ana@example.test', password })).response.status, 401);
    assert.equal((await f.request('/api/auth/login', 'POST', { email: 'ana@example.test', password: 'Nova-senha-segura-456!' })).response.status, 200);
    assert.equal((await f.request('/api/auth/reset-password', 'POST', { token, password })).response.status, 400);
  } finally { await f.cleanup(); }
});
