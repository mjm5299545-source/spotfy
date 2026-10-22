import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createApp } from '../../server/app.ts';
import { createPostgresDatabase } from '../../server/postgres.ts';

const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error('Defina DATABASE_URL_TEST para um PostgreSQL isolado de testes.');

const database = await createPostgresDatabase(url);
const instance = createApp({ database, hosted: true, production: true, uploadAsset: async (filename) => `https://test.public.blob.vercel-storage.com/${filename}` });
const server = createServer(instance.app).listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Servidor de teste indisponível.');
const base = `http://127.0.0.1:${address.port}`;
after(async () => { server.close(); await once(server, 'close'); await database.close(); });

async function request(path: string, method = 'GET', data?: unknown, cookie?: string) {
  const response = await fetch(base + path, { method, headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: data ? JSON.stringify(data) : undefined });
  return { response, data: await response.json() as any };
}

test('PostgreSQL mantém catálogo, sessão e playlist entre requisições', async () => {
  const health = await request('/api/health');
  assert.equal(health.response.status, 200);
  const catalog = await request('/api/catalog?limit=2');
  assert.equal(catalog.response.status, 200);
  assert.equal(catalog.data.tracks.length, 2);
  assert.equal(catalog.data.total, 12);
  assert.equal(typeof catalog.data.tracks[0].artistId, 'string');
  assert.equal(typeof catalog.data.tracks[0].audioUrl, 'string');

  const email = `hosted-${crypto.randomUUID()}@example.test`;
  const registered = await request('/api/auth/register', 'POST', { name: 'Pessoa hospedada', email, password: 'Senha-segura-2026!' });
  assert.equal(registered.response.status, 201);
  const proxiedLogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https', Origin: `https://127.0.0.1:${address.port}` },
    body: JSON.stringify({ email, password: 'Senha-segura-2026!' }),
  });
  assert.equal(proxiedLogin.status, 200);
  const cookie = registered.response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const me = await request('/api/me', 'GET', undefined, cookie);
  assert.equal(me.data.user.email, email);
  const trackId = catalog.data.tracks[0].id;
  const made = await request('/api/playlists', 'POST', { name: 'No PostgreSQL', trackIds: [trackId] }, cookie);
  assert.equal(made.response.status, 201);
  assert.deepEqual(made.data.playlist.trackIds, [trackId]);
  const playlistId = made.data.playlist.id;

  const invalid = await request(`/api/playlists/${playlistId}`, 'PATCH', { name: 'Não salvar', trackIds: ['faixa-inexistente'] }, cookie);
  assert.equal(invalid.response.status, 400);
  const persisted = await request(`/api/playlists/${playlistId}`, 'GET', undefined, cookie);
  assert.equal(persisted.data.playlist.name, 'No PostgreSQL');
  assert.deepEqual(persisted.data.playlist.trackIds, [trackId]);
  const reopened = await createPostgresDatabase(url);
  try {
    const stored = await reopened.prepare('SELECT name FROM playlists WHERE id=?').get(playlistId) as { name: string };
    assert.equal(stored.name, 'No PostgreSQL');
  } finally {
    await reopened.close();
  }
});

test('administração hospedada registra mídia persistente e aplica integridade', async () => {
  const email = `admin-${crypto.randomUUID()}@example.test`;
  const registered = await request('/api/auth/register', 'POST', { name: 'Admin de teste', email, password: 'Senha-segura-2026!' });
  assert.equal(registered.response.status, 201);
  const cookie = registered.response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  assert.equal((await request('/api/admin/users', 'GET', undefined, cookie)).response.status, 403);
  await database.prepare("UPDATE users SET role='admin' WHERE id=?").run(registered.data.user.id);

  const artist = await request('/api/admin/artists', 'POST', { name: 'Artista de teste' }, cookie);
  assert.equal(artist.response.status, 201);
  const album = await request('/api/admin/albums', 'POST', { title: 'Álbum de teste', artistId: artist.data.artist.id, year: 2026 }, cookie);
  assert.equal(album.response.status, 201);

  const wav = Buffer.alloc(44);
  wav.write('RIFF', 0, 'ascii');
  wav.write('WAVE', 8, 'ascii');
  const form = new FormData();
  form.set('license', 'Autoria própria');
  form.set('file', new Blob([wav], { type: 'audio/wav' }), 'faixa.wav');
  const uploadedResponse = await fetch(`${base}/api/admin/media`, { method: 'POST', headers: { Cookie: cookie }, body: form });
  assert.equal(uploadedResponse.status, 201);
  const uploaded = await uploadedResponse.json() as any;
  assert.match(uploaded.url, /^https:\/\/test\.public\.blob\.vercel-storage\.com\//);

  const png = Buffer.alloc(25);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  const imageForm = new FormData();
  imageForm.set('license', 'Autoria própria');
  imageForm.set('file', new Blob([png], { type: 'image/png' }), 'capa.png');
  const imageResponse = await fetch(`${base}/api/admin/media`, { method: 'POST', headers: { Cookie: cookie }, body: imageForm });
  assert.equal(imageResponse.status, 201);
  const image = await imageResponse.json() as any;
  const updatedArtist = await request(`/api/admin/artists/${artist.data.artist.id}`, 'PATCH', { image: image.url }, cookie);
  assert.equal(updatedArtist.response.status, 200);
  assert.equal(updatedArtist.data.artist.image, image.url);
  assert.equal((await request(`/api/admin/artists/${artist.data.artist.id}`, 'PATCH', { image: 'https://unsafe.example/image.png' }, cookie)).response.status, 400);

  const track = await request('/api/admin/tracks', 'POST', { title: 'Faixa de teste', artistId: artist.data.artist.id, albumId: album.data.album.id, duration: 1, audioUrl: uploaded.url, category: 'Teste', license: 'Autoria própria' }, cookie);
  assert.equal(track.response.status, 201);
  assert.equal(track.data.track.audioUrl, uploaded.url);
  assert.equal((await request(`/api/admin/albums/${album.data.album.id}`, 'DELETE', undefined, cookie)).response.status, 409);

  const saved = await request(`/api/library/tracks/${track.data.track.id}`, 'PUT', undefined, cookie);
  assert.equal(saved.response.status, 200);
  assert.equal((await request(`/api/library/tracks/${track.data.track.id}`, 'PUT', undefined, cookie)).response.status, 200);
  assert.equal((await request(`/api/admin/tracks/${track.data.track.id}`, 'DELETE', undefined, cookie)).response.status, 200);
  assert.equal((await request(`/api/admin/albums/${album.data.album.id}`, 'DELETE', undefined, cookie)).response.status, 200);
  assert.equal((await request(`/api/admin/artists/${artist.data.artist.id}`, 'DELETE', undefined, cookie)).response.status, 200);
});
