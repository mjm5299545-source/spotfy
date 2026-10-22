import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, chmodSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { createDatabase, id, passwordHash, passwordMatches, hashToken, publicUser, getArtists, getAlbums, getTracks, getPlaylists } from './db.js';
import type { DatabaseSync } from 'node:sqlite';
import type { AppDatabase } from './database-contract.ts';
import { put } from '@vercel/blob';
import catalog from '../public/catalog.json' with { type: 'json' };
import type { User } from '../shared/types.ts';
export interface AppOptions {
    dbPath?: string;
    dataDir?: string;
    publicDir?: string;
    production?: boolean;
    database?: AppDatabase;
    hosted?: boolean;
    uploadAsset?: (filename: string, bytes: Buffer, mime: string) => Promise<string>;
    emailTransport?: {
        sendMail: (mail: any) => Promise<any>;
    };
}
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const text = (max = 120) => z.string().trim().min(1).max(max);
const localAsset = z.string().max(500).refine(value => /^\/(media|uploads)\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) || /^https:\/\/[A-Za-z0-9-]+\.public\.blob\.vercel-storage\.com\/[A-Za-z0-9._-]+$/.test(value), 'Use mídia local autorizada.');
const password = z.string().min(12, 'A senha precisa ter pelo menos 12 caracteres.').max(128);
const userInput = z.object({ name: text(80), email: z.email().max(254).transform(s => s.toLowerCase()), password });
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
type AuthRequest = Request & {
    user?: User;
};
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
export function createApp(options: AppOptions & { database: AppDatabase }): { app: ReturnType<typeof express>; db: AppDatabase; close: () => void | Promise<void> };
export function createApp(options?: AppOptions): { app: ReturnType<typeof express>; db: DatabaseSync; close: () => void | Promise<void> };
export function createApp(options: AppOptions = {}) {
    const app = express();
    if (options.hosted) app.set('trust proxy', 1);
    const production = options.production ?? process.env.NODE_ENV === 'production';
    const dataDir = resolve(options.dataDir || process.env.DATA_DIR || 'data');
    const publicDir = resolve(options.publicDir || 'public');
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const uploadDir = join(dataDir, 'uploads');
    mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
    const dbPath = options.dbPath || process.env.DATABASE_PATH || join(dataDir, 'spotfy.sqlite');
    const db: AppDatabase = options.database ?? createDatabase(dbPath, join(publicDir, 'catalog.json'));
    if (!options.database && dbPath !== ':memory:' && existsSync(dbPath))
        chmodSync(dbPath, 0o600);
    const transaction = async <T>(work: () => Promise<T>): Promise<T> => {
        if (db.transaction) return db.transaction(work);
        await db.exec('BEGIN IMMEDIATE');
        try {
            const result = await work();
            await db.exec('COMMIT');
            return result;
        } catch (error) {
            await db.exec('ROLLBACK');
            throw error;
        }
    };
    const audit = async (actor: string | null, action: string, entity: string | null = null, detail = '') => await db.prepare('INSERT INTO audit_logs(actor_id,action,entity_id,detail) VALUES(?,?,?,?)').run(actor, action, entity, detail);
    app.disable('x-powered-by');
    app.use(helmet({
        crossOriginResourcePolicy: { policy: 'same-origin' },
        contentSecurityPolicy: production ? {
            directives: {
                imgSrc: ["'self'", 'data:', 'https://*.public.blob.vercel-storage.com'],
                mediaSrc: ["'self'", 'https://*.public.blob.vercel-storage.com'],
            },
        } : false,
    }));
    app.use(express.json({ limit: '128kb' }));
    app.use(cookieParser());
    app.use('/api', rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Muitas solicitações. Aguarde um minuto.' } }));
    app.use('/api', async (req: AuthRequest, res, next) => {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            const origin = req.get('origin');
            const expected = process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
            if ((origin && origin !== expected && (production || !['http://localhost:5173', 'http://127.0.0.1:5173'].includes(origin))) || req.get('sec-fetch-site') === 'cross-site')
                return res.status(403).json({ error: 'Origem da solicitação não autorizada.' });
        }
        const token = req.cookies?.spotfy_session;
        if (typeof token === 'string' && token.length === 64) {
            const row = await db.prepare('SELECT u.* FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?').get(hashToken(token), Date.now());
            if (row)
                req.user = publicUser(row);
        }
        next();
    });
    const required = (req: AuthRequest, res: Response, next: NextFunction) => req.user ? next() : res.status(401).json({ error: 'Entre na sua conta para continuar.' });
    const admin = (req: AuthRequest, res: Response, next: NextFunction) => !req.user ? res.status(401).json({ error: 'Autenticação necessária.' }) : req.user.role !== 'admin' ? res.status(403).json({ error: 'Acesso restrito à administração.' }) : next();
    const authLimit = rateLimit({ windowMs: 15 * 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' } });
    const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.COOKIE_SECURE === 'false' ? false : production, path: '/', maxAge: SESSION_TTL };
    const newSession = async (req: Request, res: Response, userId: string) => {
        if (typeof req.cookies?.spotfy_session === 'string')
            await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(req.cookies.spotfy_session));
        await db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
        const token = randomBytes(32).toString('hex');
        await db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hashToken(token), userId, Date.now() + SESSION_TTL);
        res.cookie('spotfy_session', token, cookieOptions);
    };
    app.get('/api/health', async (_req, res) => { await db.prepare('SELECT 1').get(); res.json({ status: 'ok', database: 'connected' }); });
    app.get('/api/me', async (req: AuthRequest, res) => res.json({ user: req.user ?? null }));
    app.post('/api/auth/register', authLimit, async (req, res) => {
        const input = userInput.parse(req.body);
        if (await db.prepare('SELECT id FROM users WHERE email=?').get(input.email))
            throw fail(409, 'Não foi possível cadastrar este endereço. Entre ou recupere a senha.');
        const user = { id: id(), name: input.name, email: input.email, role: 'user' as const };
        await db.prepare('INSERT INTO users(id,name,email,password_hash) VALUES(?,?,?,?)').run(user.id, user.name, user.email, passwordHash(input.password));
        await newSession(req, res, user.id);
        await audit(user.id, 'auth.register', user.id);
        res.status(201).json({ user });
    });
    const dummyHash = passwordHash(randomBytes(24).toString('hex'));
    app.post('/api/auth/login', authLimit, async (req, res) => {
        const input = z.object({ email: z.email().max(254).transform(s => s.toLowerCase()), password: z.string().min(1).max(128) }).parse(req.body);
        const row = await db.prepare('SELECT * FROM users WHERE email=?').get(input.email) as any;
        const matched = passwordMatches(input.password, row?.password_hash ?? dummyHash);
        if (!row || !matched)
            throw fail(401, 'E-mail ou senha incorretos.');
        await newSession(req, res, row.id);
        await audit(row.id, 'auth.login', row.id);
        res.json({ user: publicUser(row) });
    });
    app.post('/api/auth/logout', async (req: AuthRequest, res) => {
        if (typeof req.cookies?.spotfy_session === 'string')
            await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(req.cookies.spotfy_session));
        res.clearCookie('spotfy_session', { ...cookieOptions, maxAge: undefined });
        res.json({ message: 'Sessão encerrada.' });
    });
    app.patch('/api/me', required, async (req: AuthRequest, res) => {
        const input = z.object({ name: text(80), email: z.email().max(254).transform(s => s.toLowerCase()).optional() }).parse(req.body);
        if (input.email && input.email !== req.user!.email)
            throw fail(400, 'A alteração de e-mail requer verificação e ainda não está disponível.');
        await db.prepare('UPDATE users SET name=? WHERE id=?').run(input.name, req.user!.id);
        await audit(req.user!.id, 'profile.update', req.user!.id);
        res.json({ user: { ...req.user, name: input.name } });
    });
    app.post('/api/auth/forgot-password', authLimit, async (req, res) => {
        const { email } = z.object({ email: z.email().max(254).transform(s => s.toLowerCase()) }).parse(req.body);
        const user = await db.prepare('SELECT id FROM users WHERE email=?').get(email) as any;
        const transport = options.emailTransport || (process.env.SMTP_HOST ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined }) : undefined);
        if (user && (transport || !production)) {
            const token = randomBytes(32).toString('hex');
            await db.prepare('DELETE FROM password_resets WHERE user_id=? OR expires_at<?').run(user.id, Date.now());
            await db.prepare('INSERT INTO password_resets VALUES(?,?,?)').run(hashToken(token), user.id, Date.now() + 30 * 60000);
            const origin = process.env.APP_ORIGIN || (options.hosted ? `${req.protocol}://${req.get('host')}` : 'http://localhost:5173');
            const resetUrl = `${origin}/reset-password?token=${token}`;
            const mail = { from: process.env.SMTP_FROM || 'Spotfy <noreply@localhost>', to: email, subject: 'Recuperar acesso ao Spotfy', text: `Use este link em até 30 minutos para redefinir sua senha: ${resetUrl}\nSe não solicitou, ignore esta mensagem.` };
            try {
                if (transport)
                    await transport.sendMail(mail);
                else {
                    const outbox = join(dataDir, 'outbox');
                    mkdirSync(outbox, { recursive: true, mode: 0o700 });
                    writeFileSync(join(outbox, `${Date.now()}-${id()}.eml`), `To: ${mail.to}\nSubject: ${mail.subject}\nContent-Type: text/plain; charset=utf-8\n\n${mail.text}`, { mode: 0o600 });
                }
                await audit(user.id, 'auth.reset_requested', user.id);
            }
            catch {
                await db.prepare('DELETE FROM password_resets WHERE user_id=?').run(user.id);
                await audit(user.id, 'error.password_email', user.id, 'Não foi possível entregar a mensagem.');
            }
        }
        else if (user)
            await audit(user.id, 'error.password_email', user.id, 'SMTP não configurado.');
        res.status(202).json({ message: 'Se o endereço estiver cadastrado, você receberá instruções de recuperação.' });
    });
    app.post('/api/auth/reset-password', authLimit, async (req, res) => {
        const input = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password }).parse(req.body);
        const reset = await db.prepare('SELECT user_id FROM password_resets WHERE token_hash=? AND expires_at>?').get(hashToken(input.token), Date.now()) as any;
        if (!reset)
            throw fail(400, 'O link expirou ou já foi utilizado. Solicite outro.');
        await transaction(async () => {
            await db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash(input.password), reset.user_id);
            await db.prepare('DELETE FROM password_resets WHERE user_id=?').run(reset.user_id);
            await db.prepare('DELETE FROM sessions WHERE user_id=?').run(reset.user_id);
        });
        await audit(reset.user_id, 'auth.password_reset', reset.user_id);
        res.clearCookie('spotfy_session', { path: '/' });
        res.json({ message: 'Senha atualizada. Entre novamente.' });
    });
    app.get('/api/catalog', async (req: AuthRequest, res) => {
        const q = z.string().max(120).parse(req.query.q ?? '');
        const offset = z.coerce.number().int().min(0).max(100000).parse(req.query.offset ?? 0);
        const limit = z.coerce.number().int().min(1).max(100).parse(req.query.limit ?? 50);
        const match = (...parts: string[]) => normalize(parts.join(' ')).includes(normalize(q));
        const tracks = (await getTracks(db)).filter(t => match(t.title, t.artistName, t.albumTitle, t.category));
        res.json({ tracks: tracks.slice(offset, offset + limit), total: tracks.length, artists: (await getArtists(db)).filter(a => match(a.name, a.bio)), albums: (await getAlbums(db)).filter(a => match(a.title, a.artistName)), playlists: (await getPlaylists(db, 'p.is_public=1 OR p.owner_id=?', req.user?.id ?? '')).filter(p => match(p.name, p.description)) });
    });
    app.get('/api/library', required, async (req: AuthRequest, res) => res.json({ likedTrackIds: (await db.prepare('SELECT track_id FROM liked_tracks WHERE user_id=? ORDER BY created_at DESC').all(req.user!.id)).map((r: any) => r.track_id), savedAlbumIds: (await db.prepare('SELECT album_id FROM saved_albums WHERE user_id=?').all(req.user!.id)).map((r: any) => r.album_id), followedArtistIds: (await db.prepare('SELECT artist_id FROM follows WHERE user_id=?').all(req.user!.id)).map((r: any) => r.artist_id), playlists: await getPlaylists(db, 'p.owner_id=?', req.user!.id) }));
    for (const [route, table, column, target] of [['tracks', 'liked_tracks', 'track_id', 'tracks'], ['albums', 'saved_albums', 'album_id', 'albums'], ['artists', 'follows', 'artist_id', 'artists']]) {
        app.put(`/api/library/${route}/:id`, required, async (req: AuthRequest, res) => { if (!await db.prepare(`SELECT id FROM ${target} WHERE id=?`).get(String(req.params.id)))
            throw fail(404, 'Item não encontrado.'); await db.prepare(`INSERT OR IGNORE INTO ${table}(user_id,${column}) VALUES(?,?)`).run(req.user!.id, String(req.params.id)); res.json({ saved: true }); });
        app.delete(`/api/library/${route}/:id`, required, async (req: AuthRequest, res) => { await db.prepare(`DELETE FROM ${table} WHERE user_id=? AND ${column}=?`).run(req.user!.id, String(req.params.id)); res.json({ saved: false }); });
    }
    const playlistInput = z.object({ name: text(100), description: z.string().trim().max(1000).default(''), isPublic: z.boolean().default(false), trackIds: z.array(text(100)).max(1000).optional() });
    const selectedPlaylist = async (playlistId: string, user?: User, edit = false) => { const p = (await getPlaylists(db, 'p.id=?', playlistId))[0]; if (!p || (p.ownerId !== user?.id && user?.role !== 'admin' && (edit || !p.isPublic)))
        throw fail(404, 'Playlist não encontrada.'); return p; };
    const setTracks = async (playlistId: string, trackIds: string[]) => {
        if (new Set(trackIds).size !== trackIds.length)
            throw fail(400, 'A playlist não pode conter faixas duplicadas.');
        for (const trackId of trackIds) {
            if (!await db.prepare('SELECT id FROM tracks WHERE id=?').get(trackId))
                throw fail(400, 'Uma das faixas não existe.');
        }
        await db.prepare('DELETE FROM playlist_tracks WHERE playlist_id=?').run(playlistId);
        for (const [position, trackId] of trackIds.entries())
            await db.prepare('INSERT INTO playlist_tracks VALUES(?,?,?)').run(playlistId, trackId, position);
    };
    app.post('/api/playlists', required, async (req: AuthRequest, res) => {
        const input = playlistInput.parse(req.body);
        const pid = id();
        await transaction(async () => {
            await db.prepare('INSERT INTO playlists(id,name,description,cover,owner_id,is_public) VALUES(?,?,?,?,?,?)').run(pid, input.name, input.description, '', req.user!.id, Number(input.isPublic));
            if (input.trackIds)
                await setTracks(pid, input.trackIds);
        });
        await audit(req.user!.id, 'playlist.create', pid);
        res.status(201).json({ playlist: (await getPlaylists(db, 'p.id=?', pid))[0] });
    });
    app.get('/api/playlists/:id', async (req: AuthRequest, res) => res.json({ playlist: await selectedPlaylist(String(req.params.id), req.user) }));
    app.patch('/api/playlists/:id', required, async (req: AuthRequest, res) => {
        const pid = String(req.params.id);
        const p = await selectedPlaylist(pid, req.user, true);
        const input = playlistInput.partial().parse(req.body);
        await transaction(async () => {
            await db.prepare('UPDATE playlists SET name=?,description=?,is_public=? WHERE id=?').run(input.name ?? p.name, input.description ?? p.description, Number(input.isPublic ?? p.isPublic), pid);
            if (input.trackIds)
                await setTracks(pid, input.trackIds);
        });
        await audit(req.user!.id, 'playlist.update', pid);
        res.json({ playlist: (await getPlaylists(db, 'p.id=?', pid))[0] });
    });
    app.delete('/api/playlists/:id', required, async (req: AuthRequest, res) => { const pid = String(req.params.id); await selectedPlaylist(pid, req.user, true); await db.prepare('DELETE FROM playlists WHERE id=?').run(pid); await audit(req.user!.id, 'playlist.delete', pid); res.json({ deleted: true }); });
    app.get('/api/preferences', required, async (req: AuthRequest, res) => { const r = await db.prepare('SELECT volume,shuffle,repeat_mode repeat FROM playback_preferences WHERE user_id=?').get(req.user!.id) as any; res.json({ preferences: r ? { ...r, shuffle: !!r.shuffle } : { volume: .7, shuffle: false, repeat: 'off' } }); });
    app.put('/api/preferences', required, async (req: AuthRequest, res) => { const p = z.object({ volume: z.number().min(0).max(1), shuffle: z.boolean(), repeat: z.enum(['off', 'all', 'one']) }).parse(req.body); await db.prepare('INSERT INTO playback_preferences VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET volume=excluded.volume,shuffle=excluded.shuffle,repeat_mode=excluded.repeat_mode').run(req.user!.id, p.volume, Number(p.shuffle), p.repeat); res.json({ preferences: p }); });
    app.post('/api/history', required, async (req: AuthRequest, res) => { const { trackId } = z.object({ trackId: text(100) }).parse(req.body); if (!await db.prepare('SELECT id FROM tracks WHERE id=?').get(trackId))
        throw fail(404, 'Faixa não encontrada.'); await db.prepare('INSERT INTO listening_history(user_id,track_id) VALUES(?,?)').run(req.user!.id, trackId); res.status(201).json({ recorded: true }); });
    app.get('/api/history', required, async (req: AuthRequest, res) => res.json({ history: await db.prepare('SELECT track_id "trackId",listened_at "listenedAt" FROM listening_history WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user!.id) }));
    app.use('/api/admin', admin);
    app.get('/api/admin/stats', async (_req, res) => {
        const count = async (table: string) => Number((await db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as any).n);
        res.json({ users: await count('users'), tracks: await count('tracks'), artists: await count('artists'), albums: await count('albums'), playlists: await count('playlists'), plays: await count('listening_history'), errors: Number((await db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action LIKE 'error.%'").get() as any).n) });
    });
    app.get('/api/admin/users', async (_req, res) => res.json({ users: await db.prepare('SELECT id,name,email,role FROM users ORDER BY created_at DESC').all() }));
    app.patch('/api/admin/users/:id', async (req: AuthRequest, res) => {
        const uid = String(req.params.id);
        const input = z.object({ role: z.enum(['user', 'admin']) }).parse(req.body);
        if (uid === req.user!.id && input.role !== 'admin')
            throw fail(400, 'Você não pode remover sua própria permissão administrativa.');
        const r = await db.prepare('UPDATE users SET role=? WHERE id=?').run(input.role, uid);
        if (!r.changes)
            throw fail(404, 'Usuário não encontrado.');
        await audit(req.user!.id, 'admin.user.role', uid, input.role);
        res.json({ user: publicUser(await db.prepare('SELECT * FROM users WHERE id=?').get(uid)) });
    });
    app.delete('/api/admin/users/:id', async (req: AuthRequest, res) => {
        const uid = String(req.params.id);
        if (uid === req.user!.id)
            throw fail(400, 'Você não pode excluir sua própria conta administrativa.');
        const r = await db.prepare('DELETE FROM users WHERE id=?').run(uid);
        if (!r.changes)
            throw fail(404, 'Usuário não encontrado.');
        await audit(req.user!.id, 'admin.user.delete', uid);
        res.json({ deleted: true });
    });
    app.get('/api/admin/audit', async (_req, res) => res.json({ logs: await db.prepare('SELECT l.id,l.action,l.entity_id "entityId",l.detail,l.created_at "createdAt",u.name "actorName" FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_id ORDER BY l.id DESC LIMIT 200').all() }));
    const artistInput = z.object({ name: text(120), bio: z.string().trim().max(4000).default(''), image: localAsset.or(z.literal('')).default('') });
    const albumInput = z.object({ title: text(150), artistId: text(100), cover: localAsset.or(z.literal('')).default(''), year: z.number().int().min(1900).max(2100) });
    const trackInput = z.object({ title: text(150), artistId: text(100), albumId: text(100), cover: localAsset.or(z.literal('')).default(''), duration: z.number().positive().max(86400), audioUrl: localAsset, category: text(80), license: text(500) });
    const artistExists = async (aid: string) => { if (!await db.prepare('SELECT id FROM artists WHERE id=?').get(aid))
        throw fail(400, 'Artista não encontrado.'); };
    const trackRelations = async (t: {
        artistId: string;
        albumId: string;
        audioUrl: string;
    }) => {
        await artistExists(t.artistId);
        const album = await db.prepare('SELECT artist_id FROM albums WHERE id=?').get(t.albumId) as any;
        if (!album || album.artist_id !== t.artistId)
            throw fail(400, 'O álbum deve pertencer ao artista da faixa.');
        if (options.hosted) {
            if (t.audioUrl.startsWith('/media/') && catalog.tracks.some(track => track.audioUrl === t.audioUrl)) return;
            const asset = await db.prepare('SELECT mime FROM media_assets WHERE path=?').get(t.audioUrl) as { mime: string } | undefined;
            if (!asset?.mime.startsWith('audio/')) throw fail(400, 'Envie um arquivo de áudio autorizado antes de cadastrar a faixa.');
            return;
        }
        const disk = t.audioUrl.startsWith('/uploads/') ? join(uploadDir, t.audioUrl.slice('/uploads/'.length)) : join(publicDir, t.audioUrl.slice(1));
        if (!existsSync(disk) || !statSync(disk).isFile())
            throw fail(400, 'Envie um arquivo de áudio autorizado antes de cadastrar a faixa.');
        const fd = openSync(disk, 'r');
        const header = Buffer.alloc(44);
        let bytesRead: number;
        try {
            bytesRead = readSync(fd, header, 0, 44, 0);
        }
        finally {
            closeSync(fd);
        }
        const isAudio = (bytesRead >= 44 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WAVE') || (bytesRead > 10 && (header.toString('ascii', 0, 3) === 'ID3' || (header[0] === 0xff && (header[1]! & 0xe0) === 0xe0))) || (bytesRead > 28 && header.toString('ascii', 0, 4) === 'OggS') || (bytesRead > 42 && header.toString('ascii', 0, 4) === 'fLaC');
        if (!isAudio)
            throw fail(400, 'O arquivo selecionado não é um áudio em formato suportado.');
    };
    app.get('/api/admin/artists', async (_req, res) => res.json({ artists: await getArtists(db) }));
    app.get('/api/admin/albums', async (_req, res) => res.json({ albums: await getAlbums(db) }));
    app.get('/api/admin/tracks', async (_req, res) => res.json({ tracks: await getTracks(db) }));
    app.post('/api/admin/artists', async (req: AuthRequest, res) => { const p = artistInput.parse(req.body), aid = id(); await db.prepare('INSERT INTO artists VALUES(?,?,?,?)').run(aid, p.name, p.bio, p.image); await audit(req.user!.id, 'admin.artist.create', aid); res.status(201).json({ artist: (await getArtists(db)).find(a => a.id === aid) }); });
    app.patch('/api/admin/artists/:id', async (req: AuthRequest, res) => { const aid = String(req.params.id), old = (await getArtists(db)).find(a => a.id === aid); if (!old)
        throw fail(404, 'Artista não encontrado.'); const p = artistInput.parse({ ...old, ...artistInput.partial().parse(req.body) }); await db.prepare('UPDATE artists SET name=?,bio=?,image=? WHERE id=?').run(p.name, p.bio, p.image, aid); await audit(req.user!.id, 'admin.artist.update', aid); res.json({ artist: (await getArtists(db)).find(a => a.id === aid) }); });
    app.post('/api/admin/albums', async (req: AuthRequest, res) => { const p = albumInput.parse(req.body), aid = id(); await artistExists(p.artistId); await db.prepare('INSERT INTO albums VALUES(?,?,?,?,?)').run(aid, p.title, p.artistId, p.cover, p.year); await audit(req.user!.id, 'admin.album.create', aid); res.status(201).json({ album: (await getAlbums(db)).find(a => a.id === aid) }); });
    app.patch('/api/admin/albums/:id', async (req: AuthRequest, res) => { const aid = String(req.params.id), old = (await getAlbums(db)).find(a => a.id === aid); if (!old)
        throw fail(404, 'Álbum não encontrado.'); const p = albumInput.parse({ ...old, ...albumInput.partial().parse(req.body) }); await artistExists(p.artistId); if (p.artistId !== old.artistId && await db.prepare('SELECT id FROM tracks WHERE album_id=? LIMIT 1').get(aid))
        throw fail(409, 'Remova as faixas antes de alterar o artista do álbum.'); await db.prepare('UPDATE albums SET title=?,artist_id=?,cover=?,year=? WHERE id=?').run(p.title, p.artistId, p.cover, p.year, aid); await audit(req.user!.id, 'admin.album.update', aid); res.json({ album: (await getAlbums(db)).find(a => a.id === aid) }); });
    app.post('/api/admin/tracks', async (req: AuthRequest, res) => { const p = trackInput.parse(req.body), tid = id(); await trackRelations(p); await db.prepare('INSERT INTO tracks(id,title,artist_id,album_id,cover,duration,audio_url,category,license) VALUES(?,?,?,?,?,?,?,?,?)').run(tid, p.title, p.artistId, p.albumId, p.cover, p.duration, p.audioUrl, p.category, p.license); await audit(req.user!.id, 'admin.track.create', tid); res.status(201).json({ track: (await getTracks(db)).find(a => a.id === tid) }); });
    app.patch('/api/admin/tracks/:id', async (req: AuthRequest, res) => { const tid = String(req.params.id), old = (await getTracks(db)).find(t => t.id === tid); if (!old)
        throw fail(404, 'Faixa não encontrada.'); const p = trackInput.parse({ ...old, ...trackInput.partial().parse(req.body) }); await trackRelations(p); await db.prepare('UPDATE tracks SET title=?,artist_id=?,album_id=?,cover=?,duration=?,audio_url=?,category=?,license=? WHERE id=?').run(p.title, p.artistId, p.albumId, p.cover, p.duration, p.audioUrl, p.category, p.license, tid); await audit(req.user!.id, 'admin.track.update', tid); res.json({ track: (await getTracks(db)).find(t => t.id === tid) }); });
    for (const [route, table, label] of [['artists', 'artists', 'Artista'], ['albums', 'albums', 'Álbum'], ['tracks', 'tracks', 'Faixa']]) {
        app.delete(`/api/admin/${route}/:id`, async (req: AuthRequest, res) => { const targetId = String(req.params.id); const r = await db.prepare(`DELETE FROM ${table} WHERE id=?`).run(targetId); if (!r.changes)
            throw fail(404, `${label} não encontrado.`); await audit(req.user!.id, `admin.${route}.delete`, targetId); res.json({ deleted: true }); });
    }
    app.get('/api/admin/playlists', async (_req, res) => res.json({ playlists: await getPlaylists(db) }));
    app.post('/api/admin/playlists', async (req: AuthRequest, res) => {
        const input = playlistInput.parse(req.body), pid = id();
        await transaction(async () => {
            await db.prepare('INSERT INTO playlists(id,name,description,cover,owner_id,is_public) VALUES(?,?,?,?,?,?)').run(pid, input.name, input.description, '', null, Number(input.isPublic));
            if (input.trackIds) await setTracks(pid, input.trackIds);
        });
        await audit(req.user!.id, 'admin.playlist.create', pid);
        res.status(201).json({ playlist: (await getPlaylists(db, 'p.id=?', pid))[0] });
    });
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: (options.hosted ? 4 : 25) * 1024 * 1024, files: 1, fields: 2 } });
    app.post('/api/admin/media', upload.single('file'), async (req: AuthRequest, res) => {
        const license = text(500).parse(req.body.license);
        const file = req.file;
        if (!file)
            throw fail(400, 'Selecione um arquivo de áudio ou imagem.');
        const bytes = file.buffer;
        let ext = '', mime = '';
        if (bytes.length >= 44 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') {
            ext = 'wav';
            mime = 'audio/wav';
        }
        else if (bytes.length > 10 && (bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0))) {
            ext = 'mp3';
            mime = 'audio/mpeg';
        }
        else if (bytes.length > 28 && bytes.toString('ascii', 0, 4) === 'OggS') {
            ext = 'ogg';
            mime = 'audio/ogg';
        }
        else if (bytes.length > 42 && bytes.toString('ascii', 0, 4) === 'fLaC') {
            ext = 'flac';
            mime = 'audio/flac';
        }
        else if (bytes.length > 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
            ext = 'png';
            mime = 'image/png';
        }
        else if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
            ext = 'jpg';
            mime = 'image/jpeg';
        }
        else if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
            ext = 'webp';
            mime = 'image/webp';
        }
        if (!ext)
            throw fail(400, 'Formato não permitido. Use WAV, MP3, OGG, FLAC, PNG, JPEG ou WebP.');
        const assetId = id(), filename = `${assetId}.${ext}`;
        const url = options.hosted
            ? await (options.uploadAsset?.(filename, bytes, mime) ?? put(filename, bytes, { access: 'public', contentType: mime, addRandomSuffix: false }).then(asset => asset.url))
            : `/uploads/${filename}`;
        if (!options.hosted) writeFileSync(join(uploadDir, filename), bytes, { mode: 0o600, flag: 'wx' });
        await db.prepare('INSERT INTO media_assets(id,path,mime,size,license,uploader_id) VALUES(?,?,?,?,?,?)').run(assetId, url, mime, bytes.length, license, req.user!.id);
        await audit(req.user!.id, 'admin.media.create', assetId);
        res.status(201).json({ url, asset: { id: assetId, path: url, mime, size: bytes.length, license } });
    });
    app.get('/api/admin/media', async (_req, res) => {
        const assets = await db.prepare('SELECT id,path,mime,size,license,created_at "createdAt" FROM media_assets ORDER BY created_at DESC').all();
        res.json({ assets: assets.map((asset: any) => ({ ...asset, size: Number(asset.size) })) });
    });
    app.use('/api', async (_req, res) => res.status(404).json({ error: 'Operação não encontrada.' }));
    app.use('/uploads', express.static(uploadDir, { index: false, dotfiles: 'deny', setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') }));
    app.use('/media', express.static(join(publicDir, 'media'), { index: false, dotfiles: 'deny' }));
    if (production && !options.hosted) {
        const dist = resolve('dist');
        app.use(express.static(dist));
        app.get('/{*path}', async (req, res, next) => { if (req.path.startsWith('/uploads/') || req.path.startsWith('/media/'))
            return next(); res.sendFile(join(dist, 'index.html')); });
    }
    app.use(async (error: any, req: AuthRequest, res: Response, _next: NextFunction) => {
        if (error instanceof z.ZodError)
            return res.status(400).json({ error: error.issues.map(i => i.message).slice(0, 3).join(' ') });
        if (error instanceof multer.MulterError)
            return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? `O arquivo excede ${options.hosted ? 4 : 25} MB.` : 'Arquivo inválido ou quantidade excedida.' });
        if (['23503','23505','23514'].includes(error?.code) || error?.code?.includes('CONSTRAINT') || String(error?.message).includes('constraint failed'))
            return res.status(409).json({ error: 'A operação conflita com dados existentes. Remova os vínculos antes de excluir.' });
        if (error?.type === 'entity.parse.failed')
            return res.status(400).json({ error: 'JSON inválido.' });
        if (error?.type === 'entity.too.large')
            return res.status(413).json({ error: 'Solicitação muito grande.' });
        const status = Number(error.status) || 500;
        if (status >= 500) {
            try { await audit(req.user?.id ?? null, 'error.server', null, 'Falha interna ao processar solicitação.'); } catch { /* the original failure still gets a response */ }
            console.error('Falha interna no servidor. Consulte os registros administrativos.');
        }
        res.status(status).json({ error: status >= 500 ? 'Não foi possível concluir a operação. Tente novamente.' : error.message });
    });
    return { app, db, close: () => db.close() };
}
