import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Compass,
  Heart,
  Home,
  Library,
  LogOut,
  Menu,
  Music2,
  Plus,
  Search,
  Shield,
  UserRound,
  X,
  Play,
  Pause,
  Pencil,
  Trash2,
  Album as AlbumIcon,
  Disc3,
} from "lucide-react";
import type { Album, Artist, Catalog, Playlist } from "../shared/types";
import { api, json } from "./api";
import { useApp } from "./state";
import { usePlayer } from "./player/PlayerProvider";
import { Player } from "./player/Player";
import { AuthModal, ResetPassword } from "./Auth";
import { TrackList } from "./TrackList";
import { Admin } from "./Admin";

export default function App() {
  const app = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebar, setSidebar] = useState(false);
  const [playlist, setPlaylist] = useState<Playlist | "new" | null>(null);
  const [profile, setProfile] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(
    new URLSearchParams(location.search).get("q") || "",
  );
  useEffect(() => {
    setSidebar(false);
    if (location.pathname === "/search")
      setQuery(new URLSearchParams(location.search).get("q") || "");
  }, [location]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        search.current?.focus();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const create = () => {
    if (app.requireUser()) setPlaylist("new");
  };
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Ir para o conteúdo
      </a>
      <header className="topbar">
        <button
          className="icon-button mobile-menu"
          aria-label="Abrir biblioteca"
          onClick={() => setSidebar(!sidebar)}
        >
          <Menu />
        </button>
        <Link className="brand" to="/" aria-label="Spotfy início">
          <span className="brand-symbol">
            <Music2 size={26} />
          </span>
          <span>
            Spotfy<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="header-navigation">
          <NavLink to="/" className="home-button" aria-label="Início">
            <Home size={23} fill="currentColor" />
          </NavLink>
          <form
            className="search-box"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/search?q=${encodeURIComponent(query)}`);
            }}
          >
            <Search size={23} />
            <input
              ref={search}
              aria-label="O que você quer ouvir?"
              placeholder="O que você quer ouvir?"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                navigate(`/search?q=${encodeURIComponent(e.target.value)}`, {
                  replace: location.pathname === "/search",
                });
              }}
            />
            <kbd>/</kbd>
            <span className="search-divider" />
            <Compass size={23} />
          </form>
        </div>
        <div className="header-account">
          {app.user ? (
            <>
              <span className="greeting-header">Seu som. Seu espaço.</span>
              <details className="account-menu">
                <summary aria-label="Menu da conta">
                  <span className="avatar">
                    {app.user.name.slice(0, 1).toUpperCase()}
                  </span>
                  <ChevronDown size={14} />
                </summary>
                <div className="menu-panel">
                  <strong>{app.user.name}</strong>
                  <span className="muted">{app.user.email}</span>
                  <button onClick={() => setProfile(true)}>
                    <UserRound size={17} />
                    Editar perfil
                  </button>
                  {app.user.role === "admin" && (
                    <Link to="/admin">
                      <Shield size={17} />
                      Administração
                    </Link>
                  )}
                  <button
                    onClick={() =>
                      void api("/auth/logout", json("POST"))
                        .then(() => {
                          app.setUser(null);
                          app.notify("Você saiu da sua conta.");
                          navigate("/");
                        })
                        .catch((e) => app.notify(e.message))
                    }
                  >
                    <LogOut size={17} />
                    Sair
                  </button>
                </div>
              </details>
            </>
          ) : (
            <>
              <button
                className="signup-link"
                onClick={() => app.setAuthMode("signup")}
              >
                Inscreva-se
              </button>
              <button
                className="button light"
                onClick={() => app.setAuthMode("login")}
              >
                Entrar
              </button>
            </>
          )}
        </div>
      </header>
      <div className="workspace">
        <aside
          className={`sidebar ${sidebar ? "open" : ""}`}
          aria-label="Sua biblioteca"
        >
          <div className="sidebar-title">
            <div>
              <Library size={23} />
              <h2>Sua biblioteca</h2>
            </div>
            <button
              className="icon-button"
              aria-label="Criar playlist"
              onClick={create}
            >
              <Plus size={22} />
            </button>
          </div>
          <div className="library-filters">
            <NavLink to="/library" className="chip">
              Tudo
            </NavLink>
            <NavLink to="/library?filter=playlists" className="chip">
              Playlists
            </NavLink>
            <NavLink to="/library?filter=artists" className="chip">
              Artistas
            </NavLink>
          </div>
          <div className="sidebar-section-label">
            <Search size={17} />
            <span>Suas coleções</span>
            <ArrowDown size={14} />
          </div>
          <nav className="library-list">
            <NavLink className="library-item" to="/liked">
              <div className="liked-art">
                <Heart size={23} fill="white" />
              </div>
              <div>
                <strong>Músicas curtidas</strong>
                <span>
                  Playlist · {app.library.likedTrackIds.length} músicas
                </span>
              </div>
            </NavLink>
            {app.library.playlists.map((p) => (
              <NavLink
                className="library-item"
                to={`/playlist/${p.id}`}
                key={p.id}
              >
                <img src={p.cover || "/icon.svg"} alt="" />
                <div>
                  <strong>{p.name}</strong>
                  <span>Playlist · {p.ownerName || app.user?.name}</span>
                </div>
              </NavLink>
            ))}
            {app.catalog?.albums
              .filter((a) => app.library.savedAlbumIds.includes(a.id))
              .map((a) => (
                <NavLink
                  className="library-item"
                  to={`/album/${a.id}`}
                  key={a.id}
                >
                  <img src={a.cover} alt="" />
                  <div>
                    <strong>{a.title}</strong>
                    <span>Álbum · {a.artistName}</span>
                  </div>
                </NavLink>
              ))}
          </nav>
          {!app.user && (
            <div className="library-prompt">
              <h3>O começo da sua trilha sonora</h3>
              <p>Guarde suas favoritas e crie uma playlist com a sua cara.</p>
              <button className="button light small" onClick={create}>
                Criar playlist
              </button>
            </div>
          )}
          <div className="sidebar-bottom">
            <span className="online-dot" /> Música independente. Novas
            possibilidades.
            <p>
              Áudios e capas originais · <Link to="/about">Sobre o Spotfy</Link>
            </p>
          </div>
        </aside>
        {sidebar && (
          <button
            className="sidebar-backdrop"
            aria-label="Fechar biblioteca"
            onClick={() => setSidebar(false)}
          />
        )}
        <main id="main-content" className="main-panel">
          <div className="navigation-row">
            <div>
              <button
                className="icon-button round-dark"
                aria-label="Voltar"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft size={18} />
              </button>
              <button
                className="icon-button round-dark"
                aria-label="Avançar"
                onClick={() => navigate(1)}
              >
                <ArrowRight size={18} />
              </button>
            </div>
            <span className="independent-tag">
              <span className="online-dot" /> Descubra o independente
            </span>
          </div>
          {app.loading && location.pathname !== "/reset-password" ? (
            <Loading />
          ) : app.error && location.pathname !== "/reset-password" ? (
            <div className="empty-state">
              <Music2 size={44} />
              <h2>O som deu uma pausa.</h2>
              <p role="alert">{app.error}</p>
              <button
                className="button green"
                onClick={() => void app.refreshCatalog()}
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route
                path="/album/:id"
                element={<CollectionPage type="album" onEdit={setPlaylist} />}
              />
              <Route path="/artist/:id" element={<ArtistPage />} />
              <Route
                path="/playlist/:id"
                element={
                  <CollectionPage type="playlist" onEdit={setPlaylist} />
                }
              />
              <Route
                path="/liked"
                element={<CollectionPage type="liked" onEdit={setPlaylist} />}
              />
              <Route
                path="/library"
                element={<LibraryPage onCreate={create} />}
              />
              <Route path="/admin" element={<Admin />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/about" element={<About />} />
              <Route
                path="*"
                element={
                  <div className="empty-state">
                    <h1>Esse caminho está em silêncio.</h1>
                    <Link to="/" className="button green">
                      Voltar ao início
                    </Link>
                  </div>
                }
              />
            </Routes>
          )}
        </main>
      </div>
      <Player
        onLike={(track) => void app.toggleSave("tracks", track.id)}
        likedTrackIds={app.library.likedTrackIds}
      />
      <nav className="mobile-tabs">
        <NavLink to="/">
          <Home size={20} />
          Início
        </NavLink>
        <NavLink to="/search">
          <Search size={20} />
          Buscar
        </NavLink>
        <NavLink to="/library">
          <Library size={20} />
          Biblioteca
        </NavLink>
      </nav>
      <AuthModal />
      {playlist && (
        <PlaylistModal playlist={playlist} onClose={() => setPlaylist(null)} />
      )}{" "}
      {profile && <ProfileModal onClose={() => setProfile(false)} />}
      <div className={`toast ${app.notice ? "visible" : ""}`} role="status">
        {app.notice}
      </div>
    </div>
  );
}
function Loading() {
  return (
    <div className="page" aria-label="Carregando catálogo" role="status">
      <div className="skeleton skeleton-heading" />
      <div className="card-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton skeleton-card" />
        ))}
      </div>
      <span className="sr-only">Carregando músicas…</span>
    </div>
  );
}
function Section({
  title,
  subtitle,
  children,
  link,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  link?: string;
}) {
  return (
    <section className="music-section">
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {link && (
          <Link to={link}>
            Mostrar tudo <ArrowUpRight size={15} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
function AlbumCard({ album }: { album: Album }) {
  const { catalog } = useApp();
  const player = usePlayer();
  return (
    <article className="music-card">
      <div className="card-cover">
        <Link to={`/album/${album.id}`}>
          <img
            src={album.cover}
            alt={`Capa de ${album.title}`}
            loading="lazy"
          />
        </Link>
        <button
          className="card-play"
          aria-label={`Reproduzir álbum ${album.title}`}
          onClick={() => {
            const tracks = catalog!.tracks.filter(
              (t) => t.albumId === album.id,
            );
            if (tracks[0]) player.play(tracks[0], tracks);
          }}
        >
          <Play size={23} fill="currentColor" />
        </button>
      </div>
      <Link className="card-title" to={`/album/${album.id}`}>
        {album.title}
      </Link>
      <Link className="card-description" to={`/artist/${album.artistId}`}>
        {album.artistName}
      </Link>
    </article>
  );
}
function PlaylistCard({ playlist }: { playlist: Playlist }) {
  const { catalog } = useApp();
  const player = usePlayer();
  return (
    <article className="music-card">
      <div className="card-cover">
        <Link to={`/playlist/${playlist.id}`}>
          <img
            src={playlist.cover || "/icon.svg"}
            alt={`Capa de ${playlist.name}`}
            loading="lazy"
          />
        </Link>
        <button
          className="card-play"
          aria-label={`Reproduzir playlist ${playlist.name}`}
          onClick={() => {
            const tracks = playlist.trackIds.flatMap((id) =>
              catalog!.tracks.filter((t) => t.id === id),
            );
            if (tracks[0]) player.play(tracks[0], tracks);
          }}
        >
          <Play size={23} fill="currentColor" />
        </button>
      </div>
      <Link className="card-title" to={`/playlist/${playlist.id}`}>
        {playlist.name}
      </Link>
      <p className="card-description">
        {playlist.description || `Por ${playlist.ownerName}`}
      </p>
    </article>
  );
}
function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <article className="music-card artist-card">
      <Link to={`/artist/${artist.id}`}>
        <img src={artist.image} alt={artist.name} loading="lazy" />
      </Link>
      <Link className="card-title" to={`/artist/${artist.id}`}>
        {artist.name}
      </Link>
      <p className="card-description">Artista</p>
    </article>
  );
}
function HomePage() {
  const { catalog, user } = useApp();
  const player = usePlayer();
  const [filter, setFilter] = useState("Tudo");
  if (!catalog) return null;
  const categories = [
    "Tudo",
    ...new Set(catalog.tracks.map((t) => t.category)),
  ];
  const albums =
    filter === "Tudo"
      ? catalog.albums
      : catalog.albums.filter((a) =>
          catalog.tracks.some(
            (t) => t.albumId === a.id && t.category === filter,
          ),
        );
  return (
    <div className="page home-page">
      <div className="home-filters">
        {categories.slice(0, 6).map((c) => (
          <button
            key={c}
            className={`chip ${filter === c ? "selected" : ""}`}
            onClick={() => setFilter(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="home-intro">
        <span className="eyebrow">O SEU PRÓXIMO PLAY COMEÇA AQUI</span>
        <h1>
          {new Date().getHours() < 12
            ? "Bom dia"
            : new Date().getHours() < 18
              ? "Boa tarde"
              : "Boa noite"}
          {user ? `, ${user.name.split(" ")[0]}` : ""}
          <span className="green-dot">.</span>
        </h1>
        <p>Encontre o ritmo certo para o seu momento.</p>
      </div>
      <div className="quick-grid">
        {albums.slice(0, 6).map((a) => (
          <div className="quick-item" key={a.id}>
            <Link to={`/album/${a.id}`}>
              <img src={a.cover} alt="" />
              <strong>{a.title}</strong>
            </Link>
            <button
              aria-label={`Reproduzir ${a.title}`}
              onClick={() => {
                const tracks = catalog.tracks.filter((t) => t.albumId === a.id);
                if (tracks[0]) player.play(tracks[0], tracks);
              }}
            >
              <Play size={19} fill="currentColor" />
            </button>
          </div>
        ))}
      </div>
      <Section
        title="Feito para o seu momento"
        subtitle="Um universo de sons. Um ritmo que é só seu."
        link="/search"
      >
        <div className="card-grid">
          {albums.map((a) => (
            <AlbumCard album={a} key={a.id} />
          ))}
        </div>
      </Section>
      {catalog.playlists.length > 0 && (
        <Section
          title="Dê o play em algo novo"
          subtitle="Seleções para acompanhar o seu dia."
          link="/library"
        >
          <div className="card-grid">
            {catalog.playlists.map((p) => (
              <PlaylistCard playlist={p} key={p.id} />
            ))}
          </div>
        </Section>
      )}
      <Section
        title="Artistas para descobrir"
        subtitle="Novas vozes, novas perspectivas."
        link="/search?type=artists"
      >
        <div className="card-grid">
          {catalog.artists.map((a) => (
            <ArtistCard key={a.id} artist={a} />
          ))}
        </div>
      </Section>
      <footer className="main-footer">
        <Link className="brand" to="/">
          Spotfy<span className="brand-dot">.</span>
        </Link>
        <p>Um espaço para ouvir, descobrir e sentir.</p>
        <Link to="/about">
          Conheça o projeto <ArrowUpRight size={15} />
        </Link>
      </footer>
    </div>
  );
}
function SearchPage() {
  const pageSize = 8;
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const [result, setResult] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [tab, setTab] = useState("Tudo");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setResult(null);
    setError("");
    setMoreError("");
    const timer = setTimeout(() => {
      void api<Catalog>(`/catalog?q=${encodeURIComponent(q)}&limit=${pageSize}&offset=0`)
        .then((r) => {
          if (active) {
            setResult(r);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q]);
  async function loadMore() {
    if (!result || loadingMore) return;
    setLoadingMore(true);
    setMoreError("");
    try {
      const next = await api<Catalog>(`/catalog?q=${encodeURIComponent(q)}&limit=${pageSize}&offset=${result.tracks.length}`);
      setResult((previous) => previous ? { ...previous, tracks: [...previous.tracks, ...next.tracks], total: next.total } : next);
    } catch (cause) {
      setMoreError((cause as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }
  return (
    <div className="page search-page">
      <span className="eyebrow">EXPLORE NOVAS FREQUÊNCIAS</span>
      <h1>{q ? `Resultados para “${q}”` : "Encontre o seu próximo som."}</h1>
      <div className="home-filters">
        {["Tudo", "Músicas", "Artistas", "Álbuns", "Playlists"].map((t) => (
          <button
            key={t}
            className={`chip ${tab === t ? "selected" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : (
        result && (
          <>
            {(tab === "Tudo" || tab === "Músicas") && (
              <Section title="Músicas">
                <TrackList tracks={result.tracks} />
                {result.tracks.length < result.total && <button className="button outline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Carregando…' : 'Mostrar mais músicas'}</button>}
                {moreError && <p className="form-error" role="alert">{moreError}</p>}
              </Section>
            )}
            {(tab === "Tudo" || tab === "Álbuns") &&
              result.albums.length > 0 && (
                <Section title="Álbuns">
                  <div className="card-grid">
                    {result.albums.map((a) => (
                      <AlbumCard key={a.id} album={a} />
                    ))}
                  </div>
                </Section>
              )}
            {(tab === "Tudo" || tab === "Artistas") &&
              result.artists.length > 0 && (
                <Section title="Artistas">
                  <div className="card-grid">
                    {result.artists.map((a) => (
                      <ArtistCard key={a.id} artist={a} />
                    ))}
                  </div>
                </Section>
              )}
            {(tab === "Tudo" || tab === "Playlists") &&
              result.playlists.length > 0 && (
                <Section title="Playlists">
                  <div className="card-grid">
                    {result.playlists.map((p) => (
                      <PlaylistCard key={p.id} playlist={p} />
                    ))}
                  </div>
                </Section>
              )}
            {!result.tracks.length &&
              !result.artists.length &&
              !result.albums.length &&
              !result.playlists.length && (
                <div className="empty-state">
                  <Search size={40} />
                  <h2>Nenhum resultado encontrado.</h2>
                  <p>Tente outro nome de música, artista, álbum ou playlist.</p>
                </div>
              )}
          </>
        )
      )}
    </div>
  );
}
function CollectionPage({
  type,
  onEdit,
}: {
  type: "album" | "playlist" | "liked";
  onEdit: (p: Playlist) => void;
}) {
  const { id } = useParams();
  const app = useApp();
  const player = usePlayer();
  const [remote, setRemote] = useState<Playlist | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setRemote(null);
    setError("");
    if (type === "playlist" && id) {
      setBusy(true);
      void api<{ playlist: Playlist }>(`/playlists/${id}`)
        .then((r) => setRemote(r.playlist))
        .catch((e) => setError(e.message))
        .finally(() => setBusy(false));
    }
  }, [id, type, app.library]);
  const album = app.catalog?.albums.find((a) => a.id === id);
  const playlist =
    app.library.playlists.find((p) => p.id === id) ||
    app.catalog?.playlists.find((p) => p.id === id) ||
    remote;
  const navigate = useNavigate();
  if (busy && !playlist) return <Loading />;
  if (error)
    return (
      <div className="empty-state">
        <h2>Não foi possível abrir esta playlist.</h2>
        <p role="alert">{error}</p>
      </div>
    );
  if (type !== "liked" && !album && !playlist)
    return (
      <div className="empty-state">
        <h2>Coleção não encontrada.</h2>
        <Link to="/">Voltar ao início</Link>
      </div>
    );
  const title =
    type === "liked"
      ? "Músicas curtidas"
      : type === "album"
        ? album!.title
        : playlist!.name;
  const ids =
    type === "liked"
      ? app.library.likedTrackIds
      : type === "playlist"
        ? playlist!.trackIds
        : null;
  const tracks = ids
    ? ids.flatMap((id) => app.catalog!.tracks.filter((t) => t.id === id))
    : app.catalog!.tracks.filter((t) => t.albumId === id);
  const own = type === "playlist" && playlist?.ownerId === app.user?.id;
  const active =
    player.current && tracks.some((t) => t.id === player.current!.id);
  return (
    <div className={`collection-page ${type === "liked" ? "liked-page" : ""}`}>
      <section className="collection-hero">
        {type === "liked" ? (
          <div className="collection-art liked-art">
            <Heart size={80} fill="white" />
          </div>
        ) : (
          <img
            className="collection-art"
            src={
              type === "album" ? album!.cover : playlist!.cover || "/icon.svg"
            }
            alt={`Capa de ${title}`}
          />
        )}
        <div className="collection-info">
          <span className="eyebrow">
            {type === "album" ? "ÁLBUM" : "PLAYLIST"}
          </span>
          <h1>{title}</h1>
          {type === "playlist" && <p>{playlist!.description}</p>}
          <div className="collection-byline">
            <span className="mini-brand">
              <Music2 size={14} />
            </span>
            <strong>
              {type === "album"
                ? album!.artistName
                : type === "liked"
                  ? app.user?.name || "Sua coleção"
                  : playlist!.ownerName}
            </strong>
            <span>•</span>
            {type === "album" && (
              <>
                <span>{album!.year}</span>
                <span>•</span>
              </>
            )}
            <span>{tracks.length} músicas</span>
            <span className="muted">
              {Math.round(tracks.reduce((n, t) => n + t.duration, 0) / 60)} min
            </span>
          </div>
        </div>
      </section>
      <div className="collection-body">
        <div className="collection-actions">
          <button
            className="large-play"
            disabled={!tracks.length}
            aria-label={`Reproduzir ${title}`}
            onClick={() => {
              if (active) player.toggle();
              else if (tracks[0]) player.play(tracks[0], tracks);
            }}
          >
            {active && player.playing ? (
              <Pause size={27} fill="currentColor" />
            ) : (
              <Play size={27} fill="currentColor" />
            )}
          </button>
          {type === "album" && (
            <button
              className={`icon-button save-collection ${app.library.savedAlbumIds.includes(id!) ? "liked" : ""}`}
              aria-label={
                app.library.savedAlbumIds.includes(id!)
                  ? "Remover álbum salvo"
                  : "Salvar álbum"
              }
              onClick={() => void app.toggleSave("albums", id!)}
            >
              {app.library.savedAlbumIds.includes(id!) ? (
                <Check size={29} />
              ) : (
                <Plus size={29} />
              )}
            </button>
          )}
          {own && (
            <>
              <button
                className="icon-button"
                aria-label="Editar playlist"
                onClick={() => onEdit(playlist!)}
              >
                <Pencil size={22} />
              </button>
              <button
                className="icon-button"
                aria-label="Excluir playlist"
                onClick={() => {
                  if (confirm(`Excluir a playlist “${title}”?`))
                    void api(`/playlists/${id}`, json("DELETE"))
                      .then(() => {
                        void app.refreshLibrary();
                        navigate("/library");
                        app.notify("Playlist excluída.");
                      })
                      .catch((e) => app.notify(e.message));
                }}
              >
                <Trash2 size={22} />
              </button>
            </>
          )}
        </div>
        {type === "liked" && !app.user ? (
          <div className="empty-state">
            <Heart size={40} />
            <h2>Suas favoritas moram aqui.</h2>
            <p>Entre para criar sua coleção pessoal.</p>
            <button
              className="button green"
              onClick={() => app.setAuthMode("login")}
            >
              Entrar
            </button>
          </div>
        ) : (
          <TrackList tracks={tracks} playlistId={own ? id : undefined} />
        )}
        <p className="collection-note">
          {type === "album" ? `${album!.year} · ` : ""}Áudio original · Conteúdo
          autorizado para reprodução.
        </p>
      </div>
    </div>
  );
}
function ArtistPage() {
  const { id } = useParams();
  const app = useApp();
  const player = usePlayer();
  const artist = app.catalog?.artists.find((a) => a.id === id);
  if (!artist)
    return (
      <div className="empty-state">
        <h2>Artista não encontrado.</h2>
      </div>
    );
  const tracks = app.catalog!.tracks.filter((t) => t.artistId === id);
  const following = app.library.followedArtistIds.includes(id!);
  return (
    <div className="artist-page">
      <section
        className="artist-hero"
        style={{
          backgroundImage: `linear-gradient(90deg,rgba(0,0,0,.55),transparent),url("${artist.image}")`,
        }}
      >
        <span className="verified">
          <Check size={14} /> Artista independente
        </span>
        <h1>{artist.name}</h1>
        <p>{tracks.length} faixas no catálogo</p>
      </section>
      <div className="page">
        <div className="collection-actions">
          <button
            className="large-play"
            aria-label={`Reproduzir ${artist.name}`}
            onClick={() => tracks[0] && player.play(tracks[0], tracks)}
          >
            <Play fill="currentColor" size={27} />
          </button>
          <button
            className="button outline"
            onClick={() => void app.toggleSave("artists", id!)}
          >
            {following ? "Seguindo" : "Seguir"}
          </button>
        </div>
        <Section title="Músicas">
          <TrackList tracks={tracks} />
        </Section>
        <Section title="Discografia">
          <div className="card-grid">
            {app
              .catalog!.albums.filter((a) => a.artistId === id)
              .map((a) => (
                <AlbumCard key={a.id} album={a} />
              ))}
          </div>
        </Section>
        <Section title="Sobre o artista">
          <p className="artist-bio">{artist.bio}</p>
        </Section>
      </div>
    </div>
  );
}
function LibraryPage({ onCreate }: { onCreate: () => void }) {
  const app = useApp();
  const [params] = useSearchParams();
  const filter = params.get("filter");
  return (
    <div className="page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">SEU UNIVERSO MUSICAL</span>
          <h1>Sua biblioteca</h1>
        </div>
        <button className="button green" onClick={onCreate}>
          <Plus size={18} /> Criar playlist
        </button>
      </div>
      {!app.user ? (
        <div className="empty-state">
          <Library size={44} />
          <h2>As melhores coleções começam com você.</h2>
          <p>Entre para salvar músicas, álbuns e artistas.</p>
          <button
            className="button light"
            onClick={() => app.setAuthMode("login")}
          >
            Entrar
          </button>
        </div>
      ) : (
        <>
          {(!filter || filter === "playlists") && (
            <Section title="Suas playlists">
              <div className="card-grid">
                <Link className="liked-library-card" to="/liked">
                  <Heart fill="white" size={38} />
                  <h2>Músicas curtidas</h2>
                  <p>{app.library.likedTrackIds.length} músicas</p>
                </Link>
                {app.library.playlists.map((p) => (
                  <PlaylistCard key={p.id} playlist={p} />
                ))}
              </div>
            </Section>
          )}
          {!filter && (
            <Section title="Álbuns salvos">
              <div className="card-grid">
                {app
                  .catalog!.albums.filter((a) =>
                    app.library.savedAlbumIds.includes(a.id),
                  )
                  .map((a) => (
                    <AlbumCard key={a.id} album={a} />
                  ))}
              </div>
              {!app.library.savedAlbumIds.length && (
                <p className="muted">Salve um álbum para encontrá-lo aqui.</p>
              )}
            </Section>
          )}
          {(!filter || filter === "artists") && (
            <Section title="Artistas que você segue">
              <div className="card-grid">
                {app
                  .catalog!.artists.filter((a) =>
                    app.library.followedArtistIds.includes(a.id),
                  )
                  .map((a) => (
                    <ArtistCard key={a.id} artist={a} />
                  ))}
              </div>
              {!app.library.followedArtistIds.length && (
                <p className="muted">
                  Siga artistas para acompanhar suas descobertas.
                </p>
              )}
            </Section>
          )}
        </>
      )}
    </div>
  );
}
function PlaylistModal({
  playlist,
  onClose,
}: {
  playlist: Playlist | "new";
  onClose: () => void;
}) {
  const app = useApp();
  const navigate = useNavigate();
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const data = new FormData(e.currentTarget);
    try {
      const { playlist: p } = await api<{ playlist: Playlist }>(
        playlist === "new" ? "/playlists" : `/playlists/${playlist.id}`,
        json(playlist === "new" ? "POST" : "PATCH", {
          name: data.get("name"),
          description: data.get("description"),
          isPublic: data.get("isPublic") === "on",
        }),
      );
      await app.refreshLibrary();
      await app.refreshCatalog();
      onClose();
      navigate(`/playlist/${p.id}`);
      app.notify(
        playlist === "new"
          ? "Playlist criada. Agora é só escolher as músicas."
          : "Playlist atualizada.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog className="modal" ref={ref} onCancel={onClose}>
      <button
        className="icon-button modal-close"
        aria-label="Fechar"
        onClick={onClose}
      >
        <X />
      </button>
      <div className="modal-icon">
        <Disc3 size={32} />
      </div>
      <h2>
        {playlist === "new"
          ? "Uma playlist com a sua cara."
          : "Editar playlist"}
      </h2>
      <form className="form-stack" onSubmit={(e) => void submit(e)}>
        <label>
          Nome da playlist
          <input
            name="name"
            autoFocus
            required
            maxLength={100}
            defaultValue={playlist === "new" ? "" : playlist.name}
            placeholder="Dê um nome para esse momento"
          />
        </label>
        <label>
          Descrição
          <textarea
            name="description"
            maxLength={1000}
            defaultValue={playlist === "new" ? "" : playlist.description}
            placeholder="O que faz essa seleção especial?"
          />
        </label>
        <label className="checkbox-label">
          <input
            name="isPublic"
            type="checkbox"
            defaultChecked={playlist !== "new" && playlist.isPublic}
          />
          Tornar pública no catálogo
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button green" disabled={busy}>
          {busy
            ? "Salvando…"
            : playlist === "new"
              ? "Criar playlist"
              : "Salvar alterações"}
        </button>
      </form>
    </dialog>
  );
}
function ProfileModal({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="modal" onCancel={onClose}>
      <button
        className="icon-button modal-close"
        aria-label="Fechar"
        onClick={onClose}
      >
        <X />
      </button>
      <h2>Seu perfil</h2>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          const data = new FormData(e.currentTarget);
          void api<{ user: NonNullable<typeof app.user> }>(
            "/me",
            json("PATCH", { name: data.get("name") }),
          )
            .then((r) => {
              app.setUser(r.user);
              app.notify("Perfil atualizado.");
              onClose();
            })
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <label>
          Nome
          <input
            required
            name="name"
            minLength={2}
            maxLength={80}
            defaultValue={app.user?.name}
          />
        </label>
        <label>
          E-mail
          <input readOnly value={app.user?.email || ""} />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button green" disabled={busy}>
          Salvar perfil
        </button>
      </form>
    </dialog>
  );
}
function About() {
  return (
    <div className="page narrow">
      <span className="eyebrow">MÚSICA COM IDENTIDADE PRÓPRIA</span>
      <h1>Seu som. Seu espaço.</h1>
      <p>
        O Spotfy é um player independente para descobrir composições originais,
        criar playlists e guardar seus favoritos.
      </p>
      <div className="surface">
        <AlbumIcon size={32} />
        <h2>Um catálogo original</h2>
        <p>
          As faixas e as capas incluídas foram criadas para este projeto. Cada
          música é um arquivo de áudio real. Os nomes de artistas identificam os
          projetos musicais dessas composições.
        </p>
      </div>
      <p className="muted">
        Projeto independente, sem associação ou integração com o Spotify. O
        catálogo pode receber novos conteúdos autorizados pela administração.
      </p>
    </div>
  );
}
