import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.ts';
import { hashToken } from '../server/db.ts';
import type { Catalog } from '../shared/types.ts';

async function setup(production = false) {
  const dir = mkdtempSync(join(tmpdir(), 'spotfy-security-'));
  const publicDir = join(dir, 'public'); mkdirSync(publicDir);
  const catalog: Catalog = {
    artists: [{ id: 'artist', name: 'Autoral', bio: '', image: '' }],
    albums: [{ id: 'album', artistId: 'artist', artistName: 'Autoral', title: 'Original', cover: '', year: 2026 }],
    tracks: [{ id: 'track', artistId: 'artist', artistName: 'Autoral', albumId: 'album', albumTitle: 'Original', title: 'Faixa original', cover: '', duration: 1, audioUrl: '/media/original.wav', category: 'Ambient', license: 'CC0-1.0' }], playlists: [], total: 1,
  };
  writeFileSync(join(publicDir, 'catalog.json'), JSON.stringify(catalog));
  const instance = createApp({ dbPath: join(dir, 'db.sqlite'), dataDir: dir, publicDir, production });
  const server = instance.app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const request = async (path: string, method = 'GET', body?: unknown, cookie = '', extraHeaders: Record<string, string> = {}) => {
    const response = await fetch(base + path, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    return { response, data, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' };
  };
  const register = async (email: string, extra: Record<string, unknown> = {}) => {
    const result = await request('/api/auth/register', 'POST', { name: 'Pessoa', email, password: 'Senha-de-teste-123!', ...extra });
    assert.equal(result.response.status, 201);
    return result;
  };
  return { ...instance, dir, publicDir, base, request, register, cleanup: async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); instance.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test('contas não podem ler playlists privadas, editar playlist alheia ou escalar privilégios', async () => {
  const f = await setup();
  try {
    const owner = await f.register('owner@example.test');
    const outsider = await f.register('other@example.test', { role: 'admin' });
    assert.equal(outsider.data.user.role, 'user');
    const made = await f.request('/api/playlists', 'POST', { name: 'Somente minha', isPublic: false }, owner.cookie);
    assert.equal(made.response.status, 201);
    const path = `/api/playlists/${made.data.playlist.id}`;
    assert.equal((await f.request(path, 'GET', undefined, outsider.cookie)).response.status, 404);
    assert.equal((await f.request(path)).response.status, 404);
    assert.equal((await f.request(path, 'PATCH', { name: 'Invadida' }, outsider.cookie)).response.status, 404);
    assert.equal((await f.request(path, 'DELETE', undefined, outsider.cookie)).response.status, 404);
    assert.equal((await f.request('/api/me', 'PATCH', { name: 'Pessoa', role: 'admin' }, outsider.cookie)).data.user.role, 'user');
    for (const endpoint of ['/api/admin/stats', '/api/admin/users', '/api/admin/audit']) assert.equal((await f.request(endpoint, 'GET', undefined, outsider.cookie)).response.status, 403);
    assert.equal((await f.request('/api/admin/artists', 'POST', { name: 'Invasor' }, outsider.cookie)).response.status, 403);
    assert.equal((await f.request('/api/admin/stats')).response.status, 401);
    const published = await f.request(path, 'PATCH', { isPublic: true }, owner.cookie);
    assert.equal(published.response.status, 200);
    assert.equal((await f.request(path)).response.status, 200);
    assert.equal((await f.request(path, 'PATCH', { trackIds: ['track'] }, outsider.cookie)).response.status, 404);
  } finally { await f.cleanup(); }
});

test('Origin externo e entradas inválidas não alteram dados; SQL é parametrizado', async () => {
  const f = await setup();
  try {
    const { cookie, data } = await f.register('safe@example.test');
    const csrf = await f.request('/api/playlists', 'POST', { name: 'Ataque CSRF' }, cookie, { Origin: 'https://evil.example' });
    assert.equal(csrf.response.status, 403);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM playlists').get()?.n, 0);
    assert.equal((await f.request('/api/preferences', 'PUT', { volume: 2, repeat: 'invalid', shuffle: true }, cookie)).response.status, 400);
    assert.equal((await f.request('/api/library/tracks/missing', 'PUT', undefined, cookie)).response.status, 404);
    const maliciousName = "<script>alert(1)</script>'; DROP TABLE users; --";
    assert.equal((await f.request('/api/me', 'PATCH', { name: maliciousName }, cookie)).response.status, 200);
    assert.equal(f.db.prepare('SELECT name FROM users WHERE id=?').get(data.user.id)?.name, maliciousName);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM users').get()?.n, 1);
    const catalog = await f.request('/api/catalog?q=' + encodeURIComponent("' OR 1=1 --"));
    assert.equal(catalog.response.status, 200);
    assert.deepEqual(catalog.data.tracks, []);
    assert.throws(() => f.db.prepare('INSERT INTO liked_tracks(user_id,track_id) VALUES(?,?)').run(data.user.id, 'does-not-exist'), /FOREIGN KEY/i);
  } finally { await f.cleanup(); }
});

test('sessões expiradas e tokens de recuperação expirados são rejeitados', async () => {
  const f = await setup();
  try {
    const account = await f.register('expired@example.test');
    f.db.prepare('UPDATE sessions SET expires_at=0 WHERE user_id=?').run(account.data.user.id);
    assert.equal((await f.request('/api/library', 'GET', undefined, account.cookie)).response.status, 401);
    const token = 'a'.repeat(64);
    f.db.prepare('INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hashToken(token), account.data.user.id, 0);
    assert.equal((await f.request('/api/auth/reset-password', 'POST', { token, password: 'Outra-senha-456!' })).response.status, 400);
  } finally { await f.cleanup(); }
});

test('produção envia cookie Secure e não disponibiliza caixa de recuperação local', async () => {
  const f = await setup(true);
  try {
    const account = await f.register('secure@example.test');
    const header = account.response.headers.get('set-cookie') ?? '';
    assert.match(header, /Secure/i); assert.match(header, /HttpOnly/i); assert.match(header, /SameSite=Lax/i);
    const forgotten = await f.request('/api/auth/forgot-password', 'POST', { email: 'secure@example.test' });
    assert.equal(forgotten.response.status, 202);
    assert.equal(existsSync(join(f.dir, 'outbox')), false, 'produção sem SMTP não deve criar caixa de e-mail local');
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM password_resets').get()?.n, 0);
    const secretMarker = 'PRIVATE-RESET-LINK-NOT-PUBLIC';
    mkdirSync(join(f.dir, 'outbox'));
    writeFileSync(join(f.dir, 'outbox', 'recovery.eml'), secretMarker);
    const response = await fetch(f.base + '/data/outbox/recovery.eml');
    assert.equal((await response.text()).includes(secretMarker), false);
  } finally { await f.cleanup(); }
});

test('admin cadastra metadados, registra auditoria e serve áudio por Range', async () => {
  const f = await setup();
  try {
    const account = await f.register('admin@example.test');
    f.db.prepare("UPDATE users SET role='admin' WHERE id=?").run(account.data.user.id);
    const cookie = account.cookie;
    const artist = await f.request('/api/admin/artists', 'POST', { name: 'Novo artista', bio: 'Autoral', image: '' }, cookie);
    assert.equal(artist.response.status, 201);
    const artistId = artist.data.artist.id;
    const album = await f.request('/api/admin/albums', 'POST', { title: 'Novo álbum', artistId, cover: '', year: 2026 }, cookie);
    assert.equal(album.response.status, 201);
    const albumId = album.data.album.id;
    const wav = Buffer.alloc(76); wav.write('RIFF'); wav.writeUInt32LE(68, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(32, 40);
    const form = new FormData(); form.append('file', new Blob([wav], { type: 'audio/wav' }), 'autoral.wav'); form.append('license', 'Autoria própria');
    const uploaded = await fetch(f.base + '/api/admin/media', { method: 'POST', headers: { Cookie: cookie }, body: form });
    assert.equal(uploaded.status, 201);
    const media = await uploaded.json();
    assert.match(media.url, /^\/uploads\//);
    const ranged = await fetch(f.base + media.url, { headers: { Range: 'bytes=0-15' } });
    assert.equal(ranged.status, 206);
    assert.match(ranged.headers.get('content-range') ?? '', /^bytes 0-15\/76$/);
    assert.deepEqual(Buffer.from(await ranged.arrayBuffer()), wav.subarray(0, 16));
    const track = await f.request('/api/admin/tracks', 'POST', { title: 'Nova faixa', artistId, albumId, cover: '', duration: 1, audioUrl: media.url, category: 'Ambient', license: 'Autoria própria' }, cookie);
    assert.equal(track.response.status, 201);
    const trackId = track.data.track.id;
    const invalidDirectory = await f.request('/api/admin/tracks', 'POST', { title: 'Diretório não é áudio', artistId, albumId, duration: 1, audioUrl: '/media/..', category: 'Ambient', license: 'Autoria própria' }, cookie);
    assert.equal(invalidDirectory.response.status, 400);
    mkdirSync(join(f.publicDir, 'media'), { recursive: true });
    const image = Buffer.alloc(32); Buffer.from([137,80,78,71,13,10,26,10]).copy(image);
    writeFileSync(join(f.publicDir, 'media', 'image.png'), image);
    const invalidImage = await f.request('/api/admin/tracks', 'POST', { title: 'Imagem não é áudio', artistId, albumId, duration: 1, audioUrl: '/media/image.png', category: 'Ambient', license: 'Autoria própria' }, cookie);
    assert.equal(invalidImage.response.status, 400);

    assert.equal((await f.request(`/api/admin/tracks/${trackId}`, 'PATCH', { title: 'Faixa editada', artistId, albumId, cover: '', duration: 1, audioUrl: media.url, category: 'Ambient', license: 'Autoria própria' }, cookie)).response.status, 200);
    assert.equal((await f.request('/api/catalog?q=Faixa%20editada')).data.tracks[0].title, 'Faixa editada');
    const audit = await f.request('/api/admin/audit', 'GET', undefined, cookie);
    assert.equal(audit.response.status, 200);
    assert.ok(Number(f.db.prepare('SELECT COUNT(*) n FROM audit_logs').get()!.n) > 0);
    const invalid = new FormData(); invalid.append('file', new Blob(['<script>bad()</script>'], { type: 'audio/wav' }), 'bad.wav'); invalid.append('license', 'Autoria própria');
    assert.equal((await fetch(f.base + '/api/admin/media', { method: 'POST', headers: { Cookie: cookie }, body: invalid })).status, 400);
    assert.equal((await f.request(`/api/admin/albums/${albumId}`, 'DELETE', undefined, cookie)).response.status, 409, 'álbum com faixa vinculada deve preservar integridade');
    assert.equal((await f.request(`/api/admin/tracks/${trackId}`, 'DELETE', undefined, cookie)).response.status, 200);
    assert.equal((await f.request(`/api/admin/albums/${albumId}`, 'DELETE', undefined, cookie)).response.status, 200);
    assert.equal((await f.request(`/api/admin/artists/${artistId}`, 'DELETE', undefined, cookie)).response.status, 200);
  } finally { await f.cleanup(); }
});
