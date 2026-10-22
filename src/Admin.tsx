import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Activity,
  Album,
  Check,
  Music2,
  Plus,
  Shield,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import type { Track, Artist, Album as AlbumType, Playlist, User } from "../shared/types";
import { api, json } from "./api";
import { useApp } from "./state";
type Kind = "tracks" | "artists" | "albums" | "playlists";
type Entry = Track | Artist | AlbumType | Playlist;
export function Admin() {
  const app = useApp();
  const [tab, setTab] = useState<Kind | "users" | "audit">("tracks");
  const [stats, setStats] = useState<Record<string, number>>({});
  const [users, setUsers] = useState<User[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (app.user?.role !== "admin") return;
    void Promise.all([
      api<Record<string, number>>("/admin/stats").then((r) => setStats(r)),
      api<{ users: User[] }>("/admin/users").then((r) => setUsers(r.users)),
      api<{ playlists: Playlist[] }>("/admin/playlists").then((r) => setPlaylists(r.playlists)),
      api<{ logs: Record<string, unknown>[] }>("/admin/audit").then((r) =>
        setLogs(r.logs),
      ),
    ]).catch((e) => setError(e.message));
  }, [app.user, app.catalog]);
  if (!app.user)
    return (
      <div className="empty-state">
        <Shield size={44} />
        <h1>Acesso restrito</h1>
        <p>Entre com uma conta de administração.</p>
        <button
          className="button green"
          onClick={() => app.setAuthMode("login")}
        >
          Entrar
        </button>
      </div>
    );
  if (app.user.role !== "admin")
    return (
      <div className="empty-state">
        <Shield size={44} />
        <h1>Acesso restrito</h1>
        <p>Sua conta não tem permissão para administrar o catálogo.</p>
      </div>
    );
  async function remove(id: string) {
    if (
      !confirm(
        "Excluir este registro? Registros com dependências podem não ser excluídos.",
      )
    )
      return;
    try {
      await api(`/${tab === "playlists" ? "playlists" : `admin/${tab}`}/${id}`, json("DELETE"));
      await app.refreshCatalog();
      if (tab === "playlists") setPlaylists((items) => items.filter((item) => item.id !== id));
      app.notify("Registro excluído.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = Object.fromEntries(data.entries());
    if (tab === "playlists") {
      payload.isPublic = data.has("isPublic");
      const selected = data.getAll("trackIds").map(String);
      const previous = editing === "new" ? [] : (editing as Playlist).trackIds;
      payload.trackIds = [
        ...previous.filter((trackId) => selected.includes(trackId)),
        ...selected.filter((trackId) => !previous.includes(trackId)),
      ];
    }
    for (const key of ["duration", "year"])
      if (key in payload) payload[key] = Number(payload[key]);
    try {
      await api(
        tab === "playlists"
          ? editing === "new" ? "/admin/playlists" : `/playlists/${(editing as Entry).id}`
          : `/admin/${tab}${editing === "new" ? "" : `/${(editing as Entry).id}`}`,
        json(editing === "new" ? "POST" : "PATCH", payload),
      );
      await app.refreshCatalog();
      if (tab === "playlists") {
        const result = await api<{ playlists: Playlist[] }>("/admin/playlists");
        setPlaylists(result.playlists);
      }
      setEditing(null);
      app.notify("Registro salvo.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const entries =
    tab === "tracks"
      ? app.catalog!.tracks
      : tab === "artists"
        ? app.catalog!.artists
        : tab === "albums"
          ? app.catalog!.albums
          : tab === "playlists"
            ? playlists
          : [];
  return (
    <div className="page admin-page">
      <span className="eyebrow">GESTÃO DO SEU UNIVERSO MUSICAL</span>
      <h1>Administração</h1>
      <div className="stats-grid">
        {[
          {
            label: "Músicas",
            value: stats.tracks ?? app.catalog!.tracks.length,
            icon: Music2,
          },
          {
            label: "Artistas",
            value: stats.artists ?? app.catalog!.artists.length,
            icon: Activity,
          },
          {
            label: "Álbuns",
            value: stats.albums ?? app.catalog!.albums.length,
            icon: Album,
          },
          {
            label: "Usuários",
            value: stats.users ?? users.length,
            icon: Users,
          },
          { label: "Playlists", value: stats.playlists ?? playlists.length, icon: Music2 },
          { label: "Reproduções", value: stats.plays ?? 0, icon: Activity },
          { label: "Erros", value: stats.errors ?? 0, icon: Shield },
        ].map((s) => (
          <div className="surface stat-card" key={s.label}>
            <s.icon size={20} />
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      <div className="home-filters">
        {(["tracks", "artists", "albums", "playlists", "users", "audit"] as const).map(
          (t) => (
            <button
              className={`chip ${tab === t ? "selected" : ""}`}
              key={t}
              onClick={() => {
                setTab(t);
                setEditing(null);
                setError("");
              }}
            >
              {
                {
                  tracks: "Músicas",
                  artists: "Artistas",
                  albums: "Álbuns",
                  playlists: "Playlists",
                  users: "Usuários",
                  audit: "Registros",
                }[t]
              }
            </button>
          ),
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {tab === "users" ? (
        <div className="admin-table">
          {users.map((u) => (
            <div className="admin-row" key={u.id}>
              <span>
                <strong>{u.name}</strong>
                <small>{u.email}</small>
              </span>
              <label className="sr-only" htmlFor={`role-${u.id}`}>
                Permissão de {u.name}
              </label>
              <select
                id={`role-${u.id}`}
                value={u.role}
                disabled={u.id === app.user!.id}
                onChange={(e) => {
                  const role = e.target.value;
                  void api(`/admin/users/${u.id}`, json("PATCH", { role }))
                    .then(() => {
                      setUsers(
                        users.map((x) =>
                          x.id === u.id
                            ? { ...x, role: role as User["role"] }
                            : x,
                        ),
                      );
                      app.notify("Permissão atualizada.");
                    })
                    .catch((e) => setError(e.message));
                }}
              >
                <option value="user">Usuário</option>
                <option value="admin">Administrador</option>
              </select>
              {u.id !== app.user!.id && <button className="icon-button" aria-label={`Excluir usuário ${u.name}`} onClick={() => {
                if (!confirm(`Excluir ${u.name} e seus dados?`)) return;
                void api(`/admin/users/${u.id}`, json("DELETE"))
                  .then(() => { setUsers((items) => items.filter((item) => item.id !== u.id)); app.notify("Usuário excluído."); })
                  .catch((e) => setError(e.message));
              }}><Trash2 size={18}/></button>}
            </div>
          ))}
        </div>
      ) : tab === "audit" ? (
        <div className="admin-table">
          {logs.length ? (
            logs.map((log, i) => (
              <div className="audit-row" key={String(log.id || i)}>
                <Activity size={18} />
                <code>{JSON.stringify(log)}</code>
              </div>
            ))
          ) : (
            <p className="muted">Nenhum registro de auditoria disponível.</p>
          )}
        </div>
      ) : (
        <>
          <div className="section-heading">
            <h2>
              {
                {
                  tracks: "Catálogo de músicas",
                  artists: "Artistas",
                  albums: "Álbuns",
                  playlists: "Playlists",
                }[tab]
              }
            </h2>
            <button
              className="button green small"
              onClick={() => setEditing("new")}
            >
              <Plus size={17} />
              Adicionar
            </button>
          </div>
          {editing && (
            <form
              className="surface form-stack admin-edit"
              onSubmit={(e) => void save(e)}
            >
              <div className="section-heading">
                <h2>
                  {editing === "new" ? "Novo registro" : "Editar registro"}
                </h2>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Cancelar edição"
                  onClick={() => setEditing(null)}
                >
                  <X />
                </button>
              </div>
              {tab === "playlists" ? (
                <>
                  <Field name="name" label="Nome da playlist" value={editing === "new" ? "" : (editing as Playlist).name} />
                  <label>Descrição<textarea name="description" defaultValue={editing === "new" ? "" : (editing as Playlist).description} maxLength={1000}/></label>
                  <label className="checkbox-label"><input type="checkbox" name="isPublic" defaultChecked={editing === "new" || (editing as Playlist).isPublic}/>Pública</label>
                  <fieldset className="admin-track-picker"><legend>Faixas da playlist</legend>
                    {app.catalog!.tracks.map((track) => <label className="checkbox-label" key={track.id}>
                      <input type="checkbox" name="trackIds" value={track.id} defaultChecked={editing !== "new" && (editing as Playlist).trackIds.includes(track.id)}/>{track.title} · {track.artistName}
                    </label>)}
                  </fieldset>
                </>
              ) : tab === "artists" ? (
                <>
                  <Field
                    name="name"
                    label="Nome do artista"
                    value={editing === "new" ? "" : (editing as Artist).name}
                  />
                  <Field
                    name="bio"
                    label="Biografia"
                    value={editing === "new" ? "" : (editing as Artist).bio}
                  />
                  <AssetField
                    key={editing === "new" ? "artist-new" : (editing as Artist).id}
                    name="image"
                    label="Imagem"
                    value={editing === "new" ? "" : (editing as Artist).image}
                    accept="image/*"
                  />
                </>
              ) : (
                <>
                  <Field
                    name="title"
                    label={
                      tab === "tracks" ? "Título da música" : "Título do álbum"
                    }
                    value={
                      editing === "new"
                        ? ""
                        : (editing as Track | AlbumType).title
                    }
                  />
                  <label>
                    Artista
                    <select
                      name="artistId"
                      required
                      defaultValue={
                        editing === "new"
                          ? ""
                          : (editing as Track | AlbumType).artistId
                      }
                    >
                      <option value="">Selecione um artista</option>
                      {app.catalog!.artists.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {tab === "albums" ? (
                    <Field
                      name="year"
                      label="Ano"
                      type="number"
                      value={
                        editing === "new"
                          ? new Date().getFullYear()
                          : (editing as AlbumType).year
                      }
                    />
                  ) : (
                    <>
                      <label>
                        Álbum
                        <select
                          name="albumId"
                          required
                          defaultValue={
                            editing === "new" ? "" : (editing as Track).albumId
                          }
                        >
                          <option value="">Selecione um álbum</option>
                          {app.catalog!.albums.map((a) => (
                            <option value={a.id} key={a.id}>
                              {a.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Field
                        name="category"
                        label="Categoria"
                        value={
                          editing === "new" ? "" : (editing as Track).category
                        }
                      />
                      <Field
                        name="duration"
                        label="Duração em segundos"
                        type="number"
                        value={
                          editing === "new" ? "" : (editing as Track).duration
                        }
                      />
                      <Field
                        name="license"
                        label="Licença / autorização"
                        value={
                          editing === "new" ? "" : (editing as Track).license
                        }
                      />
                      <AssetField
                        key={editing === "new" ? "audio-new" : (editing as Track).id}
                        name="audioUrl"
                        label="Arquivo de áudio autorizado"
                        value={
                          editing === "new" ? "" : (editing as Track).audioUrl
                        }
                        accept="audio/*"
                      />
                    </>
                  )}
                  <AssetField
                    key={editing === "new" ? "cover-new" : (editing as Track | AlbumType).id}
                    name="cover"
                    label="Capa"
                    value={
                      editing === "new"
                        ? ""
                        : (editing as Track | AlbumType).cover
                    }
                    accept="image/*"
                  />
                </>
              )}
              <button className="button green" disabled={busy}>
                <Check size={18} />
                {busy ? "Salvando…" : "Salvar registro"}
              </button>
            </form>
          )}
          <div className="admin-table">
            {entries.map((entry) => (
              <div className="admin-row" key={entry.id}>
                <span>
                  {"cover" in entry && <img src={entry.cover} alt="" />}
                  <span>
                    <strong>
                      {"title" in entry ? entry.title : entry.name}
                    </strong>
                    <small>
                      {"artistName" in entry ? entry.artistName : entry.id}
                    </small>
                  </span>
                </span>
                <div>
                  <button
                    className="button outline small"
                    onClick={() => setEditing(entry)}
                  >
                    Editar
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Excluir ${"title" in entry ? entry.title : entry.name}`}
                    onClick={() => void remove(entry.id)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
function Field({
  name,
  label,
  value,
  type = "text",
}: {
  name: string;
  label: string;
  value: string | number;
  type?: string;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required
        min={type === "number" ? 1 : undefined}
      />
    </label>
  );
}
function AssetField({
  name,
  label,
  value,
  accept,
}: {
  name: string;
  label: string;
  value: string;
  accept: string;
}) {
  const [url, setUrl] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <label>
      {label}
      <div className="asset-field">
        <input
          name={name}
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="/uploads/arquivo ou URL autorizada"
        />
        <span className="button outline small upload-label">
          <Upload size={16} />
          {busy ? "Enviando…" : "Enviar arquivo"}
          <input
            type="file"
            accept={accept}
            aria-label={`Enviar ${label.toLowerCase()}`}
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const data = new FormData();
              data.append("file", file);
              data.append(
                "license",
                "Conteúdo próprio ou com autorização declarada pelo administrador",
              );
              setBusy(true);
              setError("");
              void api<{ url: string }>("/admin/media", {
                method: "POST",
                body: data,
              })
                .then((r) => setUrl(r.url))
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          />
        </span>
      </div>
      {error && (
        <span className="form-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
