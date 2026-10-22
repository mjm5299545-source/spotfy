import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Preferences, Track } from '../../shared/types.ts';
import { nextQueueIndex, normalizePreferences } from './queue.ts';

type PlayerContextValue = {
  current: Track | null; playing: boolean; loading: boolean; error: string | null;
  queue: Track[]; queueIndex: number; time: number; duration: number; volume: number;
  muted: boolean; shuffle: boolean; repeat: Preferences['repeat'];
  play(track: Track, tracks?: Track[]): void; toggle(): void; next(): void; previous(): void;
  seek(time: number): void; setVolume(volume: number): void; toggleMute(): void;
  toggleShuffle(): void; cycleRepeat(): void; addToQueue(track: Track): void;
  removeFromQueue(index: number): void; playQueueIndex(index: number): void;
  clearQueue(): void; retry(): void; refreshPreferences(): void;
};
const PlayerContext = createContext<PlayerContextValue | null>(null);
const STORAGE = 'spotfy:playback-preferences';
function readPreferences(): Preferences {
  try { return normalizePreferences(JSON.parse(localStorage.getItem(STORAGE) || '{}')); }
  catch { return normalizePreferences(null); }
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [audio] = useState(() => {
    const element = new Audio();
    element.preload = 'metadata';
    element.dataset.testid = 'audio-player';
    return element;
  });
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [preferences, setPreferences] = useState(readPreferences);
  const [muted, setMuted] = useState(false);
  const audioHost = useRef<HTMLDivElement>(null);
  const shuffleVisited = useRef(new Set<number>());
  const intent = useRef(false);
  const request = useRef(0);
  const authenticated = useRef(false);
  const history = useRef<string | null>(null);
  const model = useRef({ queue, queueIndex, preferences });
  model.current = { queue, queueIndex, preferences };
  const current = queue[queueIndex] ?? null;
  const currentRef = useRef(current);
  currentRef.current = current;
  const moveNext = useRef<() => void>(() => {});

  const attemptPlay = useCallback(() => {
    const token = ++request.current;
    intent.current = true;
    setError(null);
    setLoading(true);
    void audio.play().catch((cause: unknown) => {
      if (request.current !== token) return;
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setLoading(false);
      setPlaying(false);
      intent.current = false;
      setError(cause instanceof DOMException && cause.name === 'NotAllowedError'
        ? 'O navegador precisa de um clique em Reproduzir para iniciar o áudio.'
        : 'Não foi possível reproduzir esta faixa. Tente novamente ou avance para a próxima.');
    });
  }, [audio]);

  const selectQueueIndex = useCallback((index: number) => {
    const tracks = model.current.queue;
    if (!tracks[index]) return;
    intent.current = true;
    setError(null);
    if (index === model.current.queueIndex || tracks[index]?.id === currentRef.current?.id) {
      audio.currentTime = 0;
      attemptPlay();
      setQueueIndex(index);
    } else setQueueIndex(index);
  }, [audio, attemptPlay]);

  const next = useCallback(() => {
    const value = model.current;
    if (value.preferences.shuffle) shuffleVisited.current.add(value.queueIndex);
    const index = nextQueueIndex(value.queue.length, value.queueIndex, value.preferences.repeat, value.preferences.shuffle, Math.random, shuffleVisited.current);
    if (value.preferences.shuffle && index !== null && shuffleVisited.current.has(index)) {
      shuffleVisited.current.clear();
      shuffleVisited.current.add(value.queueIndex);
    }
    if (index === null) {
      intent.current = false;
      audio.pause();
      setLoading(false);
      return;
    }
    selectQueueIndex(index);
  }, [audio, selectQueueIndex]);
  moveNext.current = next;

  const previous = useCallback(() => {
    if (!currentRef.current) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const value = model.current;
    const index = value.queueIndex > 0 ? value.queueIndex - 1 : value.preferences.repeat === 'all' ? value.queue.length - 1 : 0;
    selectQueueIndex(index);
  }, [audio, selectQueueIndex]);

  const play = useCallback((track: Track, tracks?: Track[]) => {
    const selection = tracks?.length ? [...tracks] : [track];
    let index = selection.findIndex(candidate => candidate.id === track.id);
    if (index < 0) { selection.unshift(track); index = 0; }
    const sameQueue = selection.length === model.current.queue.length && selection.every((entry, position) => entry.id === model.current.queue[position]?.id);
    if (sameQueue && index === model.current.queueIndex) { attemptPlay(); return; }
    intent.current = true;
    shuffleVisited.current.clear();
    setError(null);
    if (currentRef.current?.id === track.id) attemptPlay();
    setQueue(selection);
    setQueueIndex(index);
  }, [attemptPlay]);

  const toggle = useCallback(() => {
    if (!currentRef.current) return;
    if (!audio.paused) {
      intent.current = false;
      ++request.current;
      audio.pause();
      setLoading(false);
    } else attemptPlay();
  }, [audio, attemptPlay]);
  const seek = useCallback((position: number) => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = Math.max(0, Math.min(audio.duration, position));
      setTime(audio.currentTime);
    }
  }, [audio]);
  const setVolume = useCallback((volume: number) => {
    if (!Number.isFinite(volume)) return;
    setPreferences(value => ({ ...value, volume: Math.max(0, Math.min(1, volume)) }));
    setMuted(false);
  }, []);
  const toggleMute = useCallback(() => {
    if (model.current.preferences.volume === 0) { setPreferences(value => ({ ...value, volume: .7 })); setMuted(false); }
    else setMuted(value => !value);
  }, []);
  const toggleShuffle = useCallback(() => { shuffleVisited.current.clear(); setPreferences(value => ({ ...value, shuffle: !value.shuffle })); }, []);
  const cycleRepeat = useCallback(() => setPreferences(value => ({ ...value, repeat: value.repeat === 'off' ? 'all' : value.repeat === 'all' ? 'one' : 'off' })), []);
  const refreshPreferences = useCallback(() => {
    void fetch('/api/preferences', { credentials: 'same-origin' }).then(async response => {
      authenticated.current = response.ok;
      if (response.ok) {
        const body: { preferences?: unknown } = await response.json();
        setPreferences(normalizePreferences(body.preferences));
      }
    }).catch(() => { authenticated.current = false; });
  }, []);

  useEffect(() => {
    audioHost.current?.appendChild(audio);
    return () => { audio.remove(); };
  }, [audio]);

  useEffect(() => {
    refreshPreferences();
    window.addEventListener('spotfy:auth-changed', refreshPreferences);
    return () => window.removeEventListener('spotfy:auth-changed', refreshPreferences);
  }, [refreshPreferences]);

  useEffect(() => {
    audio.volume = preferences.volume;
    audio.muted = muted;
    try { localStorage.setItem(STORAGE, JSON.stringify(preferences)); } catch { /* Playback remains available if storage is full. */ }
    const timer = window.setTimeout(() => {
      if (authenticated.current) void fetch('/api/preferences', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(preferences),
      }).then(response => { if (response.status === 401) authenticated.current = false; }).catch(() => {});
    }, 350);
    return () => window.clearTimeout(timer);
  }, [audio, preferences, muted]);

  useEffect(() => {
    if (!current) return;
    ++request.current;
    audio.pause();
    setTime(0);
    setDuration(0);
    setError(null);
    history.current = null;
    setLoading(intent.current);
    audio.src = current.audioUrl;
    audio.load();
    if (intent.current) attemptPlay();
  }, [audio, current?.id, current?.audioUrl, attemptPlay]);

  useEffect(() => {
    const events = {
      play: () => { setPlaying(true); },
      playing: () => {
        setPlaying(true); setLoading(false); setError(null);
        const track = currentRef.current;
        if (track && history.current !== track.id) {
          history.current = track.id;
          if (authenticated.current) void fetch('/api/history', {
            method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackId: track.id }),
          }).catch(() => {});
        }
      },
      pause: () => setPlaying(false),
      waiting: () => { if (intent.current) setLoading(true); },
      stalled: () => { if (intent.current) setLoading(true); },
      canplay: () => setLoading(false),
      timeupdate: () => setTime(audio.currentTime),
      durationchange: () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0),
      ended: () => {
        if (model.current.preferences.repeat === 'one') { audio.currentTime = 0; attemptPlay(); }
        else moveNext.current();
      },
      error: () => {
        setLoading(false); setPlaying(false); intent.current = false;
        const code = audio.error?.code;
        setError(code === 2 ? 'Falha de rede ao carregar a faixa. Verifique sua conexão e tente novamente.'
          : code === 4 ? 'Arquivo de áudio indisponível ou formato não suportado. Tente outra faixa.'
          : 'Não foi possível carregar o áudio. Tente novamente.');
      },
    };
    for (const [event, listener] of Object.entries(events)) audio.addEventListener(event, listener);
    return () => {
      for (const [event, listener] of Object.entries(events)) audio.removeEventListener(event, listener);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, [audio, attemptPlay]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const element = event.target;
      if (event.ctrlKey || event.metaKey || event.altKey || element instanceof HTMLElement && (element.isContentEditable || element.closest('input,textarea,select,button,a,[role="slider"],[role="dialog"]'))) return;
      if (!currentRef.current) return;
      switch (event.code) {
        case 'Space': event.preventDefault(); toggle(); break;
        case 'ArrowRight': event.preventDefault(); if (event.shiftKey) next(); else seek(audio.currentTime + 5); break;
        case 'ArrowLeft': event.preventDefault(); if (event.shiftKey) previous(); else seek(audio.currentTime - 5); break;
        case 'ArrowUp': event.preventDefault(); setVolume(model.current.preferences.volume + .05); break;
        case 'ArrowDown': event.preventDefault(); setVolume(model.current.preferences.volume - .05); break;
        case 'KeyM': event.preventDefault(); toggleMute(); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [audio, toggle, next, previous, seek, setVolume, toggleMute]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: current.artistName, album: current.albumTitle, artwork: [{ src: current.cover }] });
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: attemptPlay, pause: () => { intent.current = false; audio.pause(); }, previoustrack: previous, nexttrack: next,
      seekto: details => { if (details.seekTime !== undefined) seek(details.seekTime); },
      seekbackward: details => seek(audio.currentTime - (details.seekOffset ?? 5)),
      seekforward: details => seek(audio.currentTime + (details.seekOffset ?? 5)),
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try { navigator.mediaSession.setActionHandler(action as MediaSessionAction, handler as MediaSessionActionHandler); } catch { /* Optional browser capability. */ }
    }
    return () => { for (const action of Object.keys(handlers)) { try { navigator.mediaSession.setActionHandler(action as MediaSessionAction, null); } catch { /* Optional browser capability. */ } } };
  }, [audio, current, attemptPlay, next, previous, seek]);

  useEffect(() => { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; }, [playing]);

  const addToQueue = useCallback((track: Track) => {
    shuffleVisited.current.clear();
    setQueue(items => [...items, track]);
    if (model.current.queueIndex < 0) setQueueIndex(0);
  }, []);
  const removeFromQueue = useCallback((index: number) => {
    const value = model.current;
    if (index === value.queueIndex || index < 0 || index >= value.queue.length) return;
    shuffleVisited.current.clear();
    setQueue(items => items.filter((_, position) => position !== index));
    if (index < value.queueIndex) setQueueIndex(value.queueIndex - 1);
  }, []);
  const clearQueue = useCallback(() => {
    const track = currentRef.current;
    shuffleVisited.current.clear();
    setQueue(track ? [track] : []);
    setQueueIndex(track ? 0 : -1);
  }, []);
  const retry = useCallback(() => { if (currentRef.current) { audio.load(); attemptPlay(); } }, [audio, attemptPlay]);

  return <PlayerContext.Provider value={{ current, playing, loading, error, queue, queueIndex, time, duration, volume: preferences.volume, muted, shuffle: preferences.shuffle, repeat: preferences.repeat, play, toggle, next, previous, seek, setVolume, toggleMute, toggleShuffle, cycleRepeat, addToQueue, removeFromQueue, playQueueIndex: selectQueueIndex, clearQueue, retry, refreshPreferences }}>{children}<div hidden ref={audioHost} /></PlayerContext.Provider>;
}
export function usePlayer(): PlayerContextValue {
  const value = useContext(PlayerContext);
  if (!value) throw new Error('usePlayer deve ser usado dentro de PlayerProvider.');
  return value;
}
