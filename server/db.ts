import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import type { Catalog, Track, Album, Artist, Playlist, User } from '../shared/types.ts';
import type { AppDatabase } from './database-contract.ts';

export const id = () => randomBytes(16).toString('hex');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password: string, hash: string) {
  const [salt, expected] = hash.split(':');
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const target = Buffer.from(expected, 'hex');
  return actual.length === target.length && timingSafeEqual(actual, target);
}
export function createDatabase(path: string, catalogPath?: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS password_resets(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS artists(id TEXT PRIMARY KEY,name TEXT NOT NULL,bio TEXT NOT NULL DEFAULT '',image TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS albums(id TEXT PRIMARY KEY,title TEXT NOT NULL,artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE RESTRICT,cover TEXT NOT NULL DEFAULT '',year INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS albums_artist ON albums(artist_id);
    CREATE TABLE IF NOT EXISTS tracks(id TEXT PRIMARY KEY,title TEXT NOT NULL,artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE RESTRICT,album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE RESTRICT,cover TEXT NOT NULL DEFAULT '',duration REAL NOT NULL CHECK(duration>0),audio_url TEXT NOT NULL,category TEXT NOT NULL,license TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS tracks_album ON tracks(album_id);
    CREATE INDEX IF NOT EXISTS tracks_artist ON tracks(artist_id);
    CREATE TABLE IF NOT EXISTS playlists(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',cover TEXT NOT NULL DEFAULT '',owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,is_public INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN(0,1)));
    CREATE INDEX IF NOT EXISTS playlists_owner ON playlists(owner_id);
    CREATE TABLE IF NOT EXISTS playlist_tracks(playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,position INTEGER NOT NULL CHECK(position>=0),PRIMARY KEY(playlist_id,track_id), UNIQUE(playlist_id,position));
    CREATE TABLE IF NOT EXISTS liked_tracks(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,track_id));
    CREATE TABLE IF NOT EXISTS saved_albums(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,PRIMARY KEY(user_id,album_id));
    CREATE TABLE IF NOT EXISTS follows(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,PRIMARY KEY(user_id,artist_id));
    CREATE TABLE IF NOT EXISTS playback_preferences(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,volume REAL NOT NULL DEFAULT 0.7 CHECK(volume BETWEEN 0 AND 1),shuffle INTEGER NOT NULL DEFAULT 0,repeat_mode TEXT NOT NULL DEFAULT 'off' CHECK(repeat_mode IN('off','one','all')));
    CREATE TABLE IF NOT EXISTS listening_history(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,listened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS history_user_date ON listening_history(user_id,listened_at);
    CREATE TABLE IF NOT EXISTS media_assets(id TEXT PRIMARY KEY,path TEXT NOT NULL UNIQUE,mime TEXT NOT NULL,size INTEGER NOT NULL,license TEXT NOT NULL,uploader_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,action TEXT NOT NULL,entity_id TEXT,detail TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT OR IGNORE INTO schema_migrations(version) VALUES(1);`);
  if (catalogPath && existsSync(catalogPath) && !(db.prepare('SELECT id FROM artists LIMIT 1').get())) {
    const c = JSON.parse(readFileSync(catalogPath, 'utf8')) as Catalog;
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const a of c.artists) db.prepare('INSERT INTO artists VALUES(?,?,?,?)').run(a.id,a.name,a.bio,a.image);
      for (const a of c.albums) db.prepare('INSERT INTO albums VALUES(?,?,?,?,?)').run(a.id,a.title,a.artistId,a.cover,a.year);
      for (const t of c.tracks) db.prepare('INSERT INTO tracks(id,title,artist_id,album_id,cover,duration,audio_url,category,license) VALUES(?,?,?,?,?,?,?,?,?)').run(t.id,t.title,t.artistId,t.albumId,t.cover,t.duration,t.audioUrl,t.category,t.license);
      for (const p of c.playlists) {
        db.prepare('INSERT INTO playlists(id,name,description,cover,owner_id,is_public) VALUES(?,?,?,?,?,?)').run(p.id,p.name,p.description,p.cover,null,1);
        p.trackIds.forEach((tid,i)=>db.prepare('INSERT INTO playlist_tracks VALUES(?,?,?)').run(p.id,tid,i));
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return db;
}
export const publicUser = (u: any): User => ({id:u.id,name:u.name,email:u.email,role:u.role});
export async function getArtists(db: AppDatabase): Promise<Artist[]> { return await db.prepare('SELECT * FROM artists ORDER BY name').all() as Artist[]; }
export async function getAlbums(db: AppDatabase): Promise<Album[]> {
  return await db.prepare('SELECT a.id,a.title,a.artist_id "artistId",r.name "artistName",a.cover,a.year FROM albums a JOIN artists r ON a.artist_id=r.id ORDER BY a.year DESC,a.title').all() as Album[];
}
export async function getTracks(db: AppDatabase): Promise<Track[]> {
  return await db.prepare('SELECT t.id,t.title,t.artist_id "artistId",r.name "artistName",t.album_id "albumId",a.title "albumTitle",t.cover,t.duration,t.audio_url "audioUrl",t.category,t.license FROM tracks t JOIN artists r ON r.id=t.artist_id JOIN albums a ON a.id=t.album_id ORDER BY t.rowid,t.id').all() as Track[];
}
export async function getPlaylists(db: AppDatabase, where = '1=1', ...params: any[]): Promise<Playlist[]> {
  const playlists = await db.prepare(`SELECT p.*,u.name owner_name FROM playlists p LEFT JOIN users u ON u.id=p.owner_id WHERE ${where} ORDER BY p.rowid DESC,p.id DESC`).all(...params);
  return Promise.all(playlists.map(async (p:any)=>({id:p.id,name:p.name,description:p.description,cover:p.cover,ownerId:p.owner_id,ownerName:p.owner_name??'Spotfy',isPublic:!!p.is_public,trackIds:(await db.prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id=? ORDER BY position').all(p.id)).map((t:any)=>t.track_id)})));
}
