import { Link } from "react-router-dom";
import {
  Clock3,
  Play,
  Pause,
  Heart,
  MoreHorizontal,
  ListPlus,
  Plus,
  ChevronUp,
  ChevronDown,
  Trash2,
} from "lucide-react";
import type { Track } from "../shared/types";
import { duration, api, json } from "./api";
import { useApp } from "./state";
import { usePlayer } from "./player/PlayerProvider";
export function TrackList({
  tracks,
  playlistId,
  onChange,
}: {
  tracks: Track[];
  playlistId?: string;
  onChange?: () => void;
}) {
  const { library, toggleSave, notify, requireUser, refreshLibrary } = useApp();
  const player = usePlayer();
  const playlist = library.playlists.find((p) => p.id === playlistId);
  async function addToPlaylist(id: string, track: Track) {
    const p = library.playlists.find((p) => p.id === id);
    if (!p) return;
    try {
      await api(
        `/playlists/${id}`,
        json("PATCH", { trackIds: [...p.trackIds, track.id] }),
      );
      await refreshLibrary();
      notify("Música adicionada à playlist.");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function reorder(index: number, offset: number) {
    if (!playlist) return;
    const ids = [...playlist.trackIds];
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    try {
      await api(`/playlists/${playlist.id}`, json("PATCH", { trackIds: ids }));
      await refreshLibrary();
      onChange?.();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function remove(index: number) {
    if (!playlist) return;
    try {
      await api(
        `/playlists/${playlist.id}`,
        json("PATCH", {
          trackIds: playlist.trackIds.filter((_, i) => i !== index),
        }),
      );
      await refreshLibrary();
      onChange?.();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return tracks.length ? (
    <div className="track-table">
      <div className="track-heading">
        <span>#</span>
        <span>Título</span>
        <span className="track-album">Álbum</span>
        <span />
        <Clock3 size={17} />
        <span />
      </div>
      {tracks.map((track, i) => (
        <div
          className={`track-row ${player.current?.id === track.id ? "is-current" : ""}`}
          key={`${track.id}-${i}`}
        >
          <button
            className="track-number icon-button"
            aria-label={`${player.current?.id === track.id && player.playing ? "Pausar" : "Reproduzir"} ${track.title}`}
            onClick={() => {
              if (player.current?.id === track.id) player.toggle();
              else player.play(track, tracks);
            }}
          >
            <span>
              {player.current?.id === track.id && player.playing ? (
                <span className="equalizer">▂▆▃</span>
              ) : (
                i + 1
              )}
            </span>
            {player.current?.id === track.id && player.playing ? (
              <Pause className="row-play" size={17} fill="currentColor" />
            ) : (
              <Play className="row-play" size={17} fill="currentColor" />
            )}
          </button>
          <div className="track-title-cell">
            <img src={track.cover} alt="" loading="lazy" />
            <div>
              <button
                className="track-title"
                onClick={() => player.play(track, tracks)}
              >
                {track.title}
              </button>
              <Link className="muted" to={`/artist/${track.artistId}`}>
                {track.artistName}
              </Link>
            </div>
          </div>
          <Link className="track-album muted" to={`/album/${track.albumId}`}>
            {track.albumTitle}
          </Link>
          <button
            className={`icon-button like-button ${library.likedTrackIds.includes(track.id) ? "liked" : ""}`}
            aria-label={`${library.likedTrackIds.includes(track.id) ? "Remover dos" : "Adicionar aos"} favoritos: ${track.title}`}
            onClick={() => void toggleSave("tracks", track.id)}
          >
            <Heart
              size={18}
              fill={
                library.likedTrackIds.includes(track.id)
                  ? "currentColor"
                  : "none"
              }
            />
          </button>
          <span className="track-duration muted">
            {duration(track.duration)}
          </span>
          <details className="track-menu">
            <summary aria-label={`Opções de ${track.title}`}>
              <MoreHorizontal size={20} />
            </summary>
            <div className="menu-panel">
              <button
                onClick={() => {
                  player.addToQueue(track);
                  notify("Adicionada à fila.");
                }}
              >
                <ListPlus size={17} /> Adicionar à fila
              </button>
              {playlist && (
                <>
                  <button
                    disabled={i === 0}
                    onClick={() => void reorder(i, -1)}
                  >
                    <ChevronUp size={17} /> Mover para cima
                  </button>
                  <button
                    disabled={i === tracks.length - 1}
                    onClick={() => void reorder(i, 1)}
                  >
                    <ChevronDown size={17} /> Mover para baixo
                  </button>
                  <button onClick={() => void remove(i)}>
                    <Trash2 size={17} /> Remover da playlist
                  </button>
                </>
              )}
              {library.playlists.map((p) => (
                <button
                  key={p.id}
                  onClick={() => void addToPlaylist(p.id, track)}
                >
                  <Plus size={17} /> {p.name}
                </button>
              ))}
              {!library.playlists.length && (
                <button
                  onClick={() => {
                    if (requireUser())
                      notify(
                        "Crie uma playlist na sua biblioteca para adicionar músicas.",
                      );
                  }}
                >
                  <Plus size={17} /> Adicionar a uma playlist
                </button>
              )}
            </div>
          </details>
        </div>
      ))}
    </div>
  ) : (
    <div className="empty-state">
      <ListPlus size={40} />
      <h3>A próxima descoberta está por vir.</h3>
      <p>Explore o catálogo e adicione suas músicas favoritas.</p>
      <Link className="button outline" to="/search">
        Encontrar músicas
      </Link>
    </div>
  );
}
