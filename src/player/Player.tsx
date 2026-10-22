import { useEffect, useRef, useState } from 'react';
import { ChevronDown, CirclePlus, ListMusic, LoaderCircle, Maximize2, Music2, Pause, Play, Repeat, Repeat1, RotateCw, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX, X } from 'lucide-react';
import type { Track } from '../../shared/types.ts';
import { usePlayer } from './PlayerProvider.tsx';
import { formatTime } from './queue.ts';
import './player.css';

type Props = { onLike?: (track: Track) => void; likedTrackIds?: string[] };
export function Player({ onLike, likedTrackIds = [] }: Props) {
  const p = usePlayer();
  const [queueOpen, setQueueOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!expanded && !queueOpen) return;
    const previous = document.activeElement;
    if (expanded) expandedRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setExpanded(false); setQueueOpen(false); }
      if (expanded && event.key === 'Tab') {
        const controls = Array.from(expandedRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') ?? []);
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (expanded && previous instanceof HTMLElement) previous.focus(); };
  }, [expanded, queueOpen]);
  const active = Boolean(p.current);
  const shownDuration = p.duration || p.current?.duration || 0;
  const progress = shownDuration > 0 ? Math.min(100, p.time / shownDuration * 100) : 0;
  const liked = p.current ? likedTrackIds.includes(p.current.id) : false;
  const Volume = p.muted || p.volume === 0 ? VolumeX : p.volume < .5 ? Volume1 : Volume2;
  const repeatLabel = p.repeat === 'off' ? 'Ativar repetição' : p.repeat === 'all' ? 'Repetir uma faixa' : 'Desativar repetição';
  const playButton = <button className="sp-player-play" aria-label={p.playing ? 'Pausar' : 'Reproduzir'} title={p.playing ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)'} disabled={!active} onClick={p.toggle}>
    {p.loading ? <LoaderCircle className="sp-player-spin" size={19}/> : p.playing ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}
  </button>;
  const progressBar = <div className="sp-player-progress">
    <span data-testid="playback-time">{formatTime(p.time)}</span>
    <input aria-label="Progresso da reprodução" title="Progresso da reprodução" type="range" min="0" max={shownDuration || 1} step="0.1" value={Math.min(p.time, shownDuration)} disabled={!active || !p.duration} style={{ background: `linear-gradient(to right, #b3b3b3 ${progress}%, #414141 ${progress}%)` }} onChange={event => p.seek(Number(event.target.value))}/>
    <span>{formatTime(shownDuration)}</span>
  </div>;
  return <>
    {p.error && <div role="alert" className="sp-player-error"><span>{p.error}</span><button onClick={p.retry}><RotateCw size={14}/> Tentar novamente</button><button onClick={p.next}>Próxima faixa</button></div>}
    {queueOpen && <aside className="sp-queue" aria-label="Fila de reprodução">
      <header><h2>Fila de reprodução</h2><button aria-label="Fechar fila" onClick={() => setQueueOpen(false)}><X size={20}/></button></header>
      {p.current && <><h3>Tocando agora</h3><div className="sp-queue-current"><img src={p.current.cover} alt=""/><div><strong>{p.current.title}</strong><span>{p.current.artistName}</span></div>{p.playing && <span className="sp-equalizer">▂▆▃</span>}</div></>}
      <div className="sp-queue-title"><h3>Na sua fila</h3>{p.queue.length > 1 && <button onClick={p.clearQueue}>Limpar fila</button>}</div>
      {!p.queue.length && <p className="sp-queue-empty">Adicione músicas à fila para continuar ouvindo.</p>}
      {p.queue.map((track, index) => index !== p.queueIndex && <div key={`${track.id}:${index}`} className="sp-queue-track">
        <button className="sp-queue-select" onClick={() => p.playQueueIndex(index)} aria-label={`Reproduzir ${track.title} da fila`}><img src={track.cover} alt=""/><span><strong>{track.title}</strong><small>{track.artistName}</small></span></button>
        <button aria-label={`Remover ${track.title} da fila`} onClick={() => p.removeFromQueue(index)}><X size={16}/></button>
      </div>)}
      {p.queue.length === 1 && <p className="sp-queue-empty">Sua fila está vazia. Escolha mais uma música.</p>}
    </aside>}
    {expanded && p.current && <section ref={expandedRef} className="sp-now-playing" role="dialog" aria-modal="true" aria-label="Tocando agora">
      <header><button aria-label="Fechar tocando agora" onClick={() => setExpanded(false)}><ChevronDown/></button><span>TOCANDO AGORA</span><span className="sp-now-brand">Spotfy</span></header>
      <img className="sp-now-cover" src={p.current.cover} alt={`Capa de ${p.current.albumTitle}`}/>
      <div className="sp-now-info"><h2>{p.current.title}</h2><p>{p.current.artistName}</p></div>
      <div className="sp-now-controls">{progressBar}<div className="sp-player-buttons"><button aria-label="Faixa anterior" onClick={p.previous}><SkipBack fill="currentColor"/></button>{playButton}<button aria-label="Próxima faixa" onClick={p.next}><SkipForward fill="currentColor"/></button></div></div>
      <p className="sp-now-license">Áudio original • {p.current.license}</p>
    </section>}
    <footer className="sp-player" aria-label="Player de música">
      <div className="sp-player-track">
        {p.current ? <button className="sp-player-cover" aria-label="Abrir tocando agora" onClick={() => setExpanded(true)}><img src={p.current.cover} alt={`Capa de ${p.current.albumTitle}`}/></button> : <div className="sp-player-placeholder"><Music2 size={23}/></div>}
        <div className="sp-player-track-text"><strong>{p.current?.title || 'Sua próxima descoberta'}</strong><span>{p.current?.artistName || 'Escolha uma música para começar'}</span></div>
        {onLike && p.current && <button className={`sp-player-like ${liked ? 'is-on' : ''}`} aria-label={liked ? 'Remover dos favoritos' : 'Salvar nos favoritos'} title={liked ? 'Remover dos favoritos' : 'Salvar nos favoritos'} onClick={() => onLike(p.current!)} aria-pressed={liked}><CirclePlus size={18} fill={liked ? 'currentColor' : 'none'}/></button>}
      </div>
      <div className="sp-player-center">
        <div className="sp-player-buttons">
          <button className={p.shuffle ? 'is-on sp-player-dot' : ''} aria-label="Reprodução aleatória" aria-pressed={p.shuffle} title="Reprodução aleatória" disabled={!active} onClick={p.toggleShuffle}><Shuffle size={17}/></button>
          <button aria-label="Faixa anterior" title="Faixa anterior (Shift + ←)" disabled={!active} onClick={p.previous}><SkipBack size={20} fill="currentColor"/></button>
          {playButton}
          <button aria-label="Próxima faixa" title="Próxima faixa (Shift + →)" disabled={!active} onClick={p.next}><SkipForward size={20} fill="currentColor"/></button>
          <button className={p.repeat !== 'off' ? 'is-on sp-player-dot' : ''} aria-label={repeatLabel} aria-pressed={p.repeat !== 'off'} title={repeatLabel} disabled={!active} onClick={p.cycleRepeat}>{p.repeat === 'one' ? <Repeat1 size={18}/> : <Repeat size={18}/>}</button>
        </div>
        {progressBar}
      </div>
      <div className="sp-player-tools">
        <button className={queueOpen ? 'is-on' : ''} aria-label="Fila de reprodução" title="Fila de reprodução" aria-expanded={queueOpen} onClick={() => setQueueOpen(value => !value)}><ListMusic size={19}/></button>
        <button aria-label={p.muted || p.volume === 0 ? 'Ativar som' : 'Silenciar'} title="Silenciar (M)" onClick={p.toggleMute}><Volume size={19}/></button>
        <input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={p.muted ? 0 : p.volume} style={{ background: `linear-gradient(to right, #b3b3b3 ${(p.muted ? 0 : p.volume) * 100}%, #414141 ${(p.muted ? 0 : p.volume) * 100}%)` }} onChange={event => p.setVolume(Number(event.target.value))}/>
        <button className="sp-player-expand" aria-label="Expandir player" title="Tocando agora" disabled={!active} onClick={() => setExpanded(true)}><Maximize2 size={17}/></button>
      </div>
    </footer>
  </>;
}
export default Player;
