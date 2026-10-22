import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, type PoolClient } from 'pg';
import catalog from '../public/catalog.json' with { type: 'json' };
import type { AppDatabase } from './database-contract.ts';

const schema = `
  CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL);
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS password_resets(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS artists(id TEXT PRIMARY KEY,name TEXT NOT NULL,bio TEXT NOT NULL DEFAULT '',image TEXT NOT NULL DEFAULT '');
  CREATE TABLE IF NOT EXISTS albums(id TEXT PRIMARY KEY,title TEXT NOT NULL,artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE RESTRICT,cover TEXT NOT NULL DEFAULT '',year INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS albums_artist ON albums(artist_id);
  CREATE TABLE IF NOT EXISTS tracks(id TEXT PRIMARY KEY,title TEXT NOT NULL,artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE RESTRICT,album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE RESTRICT,cover TEXT NOT NULL DEFAULT '',duration DOUBLE PRECISION NOT NULL CHECK(duration>0),audio_url TEXT NOT NULL,category TEXT NOT NULL,license TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE INDEX IF NOT EXISTS tracks_album ON tracks(album_id);
  CREATE INDEX IF NOT EXISTS tracks_artist ON tracks(artist_id);
  CREATE TABLE IF NOT EXISTS playlists(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',cover TEXT NOT NULL DEFAULT '',owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,is_public INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN(0,1)),created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE INDEX IF NOT EXISTS playlists_owner ON playlists(owner_id);
  CREATE TABLE IF NOT EXISTS playlist_tracks(playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,position INTEGER NOT NULL CHECK(position>=0),PRIMARY KEY(playlist_id,track_id), UNIQUE(playlist_id,position));
  CREATE TABLE IF NOT EXISTS liked_tracks(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(user_id,track_id));
  CREATE TABLE IF NOT EXISTS saved_albums(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,PRIMARY KEY(user_id,album_id));
  CREATE TABLE IF NOT EXISTS follows(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,PRIMARY KEY(user_id,artist_id));
  CREATE TABLE IF NOT EXISTS playback_preferences(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,volume DOUBLE PRECISION NOT NULL DEFAULT 0.7 CHECK(volume BETWEEN 0 AND 1),shuffle INTEGER NOT NULL DEFAULT 0,repeat_mode TEXT NOT NULL DEFAULT 'off' CHECK(repeat_mode IN('off','one','all')));
  CREATE TABLE IF NOT EXISTS listening_history(id BIGSERIAL PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,listened_at TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE INDEX IF NOT EXISTS history_user_date ON listening_history(user_id,listened_at);
  CREATE TABLE IF NOT EXISTS media_assets(id TEXT PRIMARY KEY,path TEXT NOT NULL UNIQUE,mime TEXT NOT NULL,size BIGINT NOT NULL,license TEXT NOT NULL,uploader_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS audit_logs(id BIGSERIAL PRIMARY KEY,actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,action TEXT NOT NULL,entity_id TEXT,detail TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  ALTER TABLE tracks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
  ALTER TABLE playlists ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
  INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
  INSERT INTO schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
`;

export async function createPostgresDatabase(url: string): Promise<AppDatabase> {
  const pool = new Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 10000 });
  const context = new AsyncLocalStorage<PoolClient>();
  // `?` placeholders keep the local SQLite queries shared with PostgreSQL.
  const execute = (sql: string, params: any[]) => {
    let index = 0;
    const statement = sql.replace(/^INSERT OR IGNORE INTO /i, 'INSERT INTO ').replace(/\b([pt])\.rowid\b/g, '$1.created_at').replace(/\?/g, () => `$${++index}`);
    const finalSql = /^INSERT OR IGNORE INTO /i.test(sql) ? `${statement} ON CONFLICT DO NOTHING` : statement;
    return (context.getStore() ?? pool).query(finalSql, params);
  };
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(748193)');
      await client.query(schema);
      const existing = await client.query('SELECT id FROM artists LIMIT 1');
      if (existing.rowCount === 0) {
        for (const artist of catalog.artists) await client.query('INSERT INTO artists VALUES($1,$2,$3,$4)', [artist.id, artist.name, artist.bio, artist.image]);
        for (const album of catalog.albums) await client.query('INSERT INTO albums VALUES($1,$2,$3,$4,$5)', [album.id, album.title, album.artistId, album.cover, album.year]);
        for (const track of catalog.tracks) await client.query('INSERT INTO tracks(id,title,artist_id,album_id,cover,duration,audio_url,category,license) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [track.id, track.title, track.artistId, track.albumId, track.cover, track.duration, track.audioUrl, track.category, track.license]);
        for (const playlist of catalog.playlists) {
          await client.query('INSERT INTO playlists(id,name,description,cover,owner_id,is_public) VALUES($1,$2,$3,$4,$5,$6)', [playlist.id, playlist.name, playlist.description, playlist.cover, null, 1]);
          for (const [position, trackId] of playlist.trackIds.entries()) await client.query('INSERT INTO playlist_tracks VALUES($1,$2,$3)', [playlist.id, trackId, position]);
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    await pool.end();
    throw error;
  }
  return {
    prepare(sql) {
      return {
        async get(...params) { return (await execute(sql, params)).rows[0]; },
        async all(...params) { return (await execute(sql, params)).rows; },
        async run(...params) { return { changes: (await execute(sql, params)).rowCount ?? 0 }; },
      };
    },
    async exec(sql) { await execute(sql, []); },
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await context.run(client, work);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async close() { await pool.end(); },
  };
}
