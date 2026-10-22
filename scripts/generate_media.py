"""Render original instrumental miniatures; no downloaded recordings or samples.
Run from repository root with Python 3. Creates reproducible PCM WAV and SVG covers.
The compositions, generated recordings and artwork are dedicated to CC0-1.0.
"""
from pathlib import Path
import array, json, math, random, wave
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'public'/'media'; OUT.mkdir(parents=True,exist_ok=True)
ARTISTS=[('aurora','Aurora Coletiva','Paisagens sonoras para desacelerar.'),('atlas','Atlas Sonoro','Pequenas viagens em grandes frequências.'),('lume','Lume','Texturas quentes, melodias leves.'),('norte','Norte Azul','Entre o jazz eletrônico e o horizonte.'),('soma','Soma','Pulso, movimento e novas perspectivas.'),('brisa','Brisa Estúdio','Espaço para respirar e ouvir.')]
ALBUMS=[('horizontes','Horizontes','aurora',2026,'#234f50','#e7b486'),('orbita','Órbita','atlas',2026,'#31245b','#f69c79'),('golden','Depois das seis','lume',2026,'#934c23','#f4c471'),('azul','Tudo azul','norte',2026,'#173d67','#9bb8b7'),('fluxo','Em movimento','soma',2026,'#3d2854','#e396bc'),('silencio','Um lugar tranquilo','brisa',2026,'#385c3e','#b9cf91')]
TITLES=['Primeira luz','Cidade ao longe','Entre planetas','Gravidade leve','Café na janela','Fim de tarde','Mar aberto','Linha do horizonte','Passos na chuva','Sem pressa','Pausa para respirar','Jardim interior']
CATEGORIES=['Chill','Chill','Foco','Foco','Jazz','Jazz','Ambiente','Ambiente','Eletrônica','Eletrônica','Foco','Ambiente']
for i,(aid,title,artist,year,c1,c2) in enumerate(ALBUMS):
    circles=''.join(f'<circle cx="{120+j*34}" cy="{215-j*15}" r="{126-j*17}" fill="none" stroke="{c2}" stroke-width="2" opacity="{.16+j*.1}"/>' for j in range(5))
    svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><defs><linearGradient id="b" x2="1" y2="1"><stop stop-color="{c1}"/><stop offset="1" stop-color="#13191d"/></linearGradient><radialGradient id="g"><stop stop-color="{c2}"/><stop offset="1" stop-color="{c1}"/></radialGradient><filter id="n"><feTurbulence baseFrequency=".72" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".08"/></feComponentTransfer></filter></defs><rect width="600" height="600" fill="url(#b)"/><circle cx="{320+i*8}" cy="{235-i*7}" r="174" fill="url(#g)"/>{circles}<path d="M0 420 Q150 {240+i*10} 300 410 T600 380V600H0" fill="{c1}"/><path d="M0 470 Q160 330 320 455 T600 420V600H0" fill="#142129" opacity=".8"/><rect width="600" height="600" filter="url(#n)" opacity=".8"/><text x="36" y="52" fill="#fff" font-family="sans-serif" font-size="13" letter-spacing="5">SPOTFY ORIGINALS · 0{i+1}</text><text x="36" y="520" fill="#fff" font-family="sans-serif" font-size="40" font-weight="700">{title}</text><text x="38" y="555" fill="{c2}" font-family="sans-serif" font-size="17" letter-spacing="2">{next(x[1] for x in ARTISTS if x[0]==artist).upper()}</text></svg>'''
    (OUT/f'{aid}.svg').write_text(svg)
artists=[dict(id=a,name=n,bio=b,image=f'/media/{ALBUMS[i][0]}.svg') for i,(a,n,b) in enumerate(ARTISTS)]
albums=[dict(id=a,title=t,artistId=ar,artistName=next(x[1] for x in ARTISTS if x[0]==ar),cover=f'/media/{a}.svg',year=y) for a,t,ar,y,*_ in ALBUMS]
tracks=[]; sr=16000
for i,title in enumerate(TITLES):
    a=albums[i//2]; duration=40+(i%4)*4; path=OUT/f'track-{i+1:02}.wav'
    tracks.append(dict(id=f'track-{i+1:02}',title=title,artistId=a['artistId'],artistName=a['artistName'],albumId=a['id'],albumTitle=a['title'],cover=a['cover'],duration=duration,audioUrl=f'/media/{path.name}',category=CATEGORIES[i],license='CC0-1.0 — composição, gravação e arte originais Spotfy'))
    if path.exists(): continue
    rng=random.Random(120+i); bpm=76+i*3; beat=60/bpm; notes=[0,7,12,10,7,3,5,7,12,15,10,7,5,3,7,0]; base=130.8128*2**((i%6)/12); pcm=array.array('h')
    for k in range(duration*sr):
        t=k/sr; b=t/beat; step=int(b*2); phase=(b*2)%1; note=notes[(step+i)%len(notes)]; freq=base*2**(note/12)
        env=math.exp(-phase*4)*(1-math.exp(-phase*60)); melody=math.sin(math.tau*freq*t)*env*.23
        chord=[0,3,7,10][int(b//8)%4]; pad=sum(math.sin(math.tau*base*2**((chord+n)/12)*t) for n in [0,7,12])*.045
        pulse=b%1; kick=math.sin(math.tau*(52*t+3*math.exp(-pulse*20)))*math.exp(-pulse*22)*.19
        tick=(rng.random()*2-1)*math.exp(-((b*2)%1)*32)*.025
        fade=min(1,t/2,(duration-t)/3); value=max(-1,min(1,(melody+pad+kick+tick)*fade)); pcm.append(int(value*29000))
    with wave.open(str(path),'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm.tobytes())
playlists=[dict(id='editorial-chill',name='Seu momento de paz',description='Desligue o mundo. Aumente o som.',cover=albums[0]['cover'],ownerId=None,ownerName='Spotfy',isPublic=True,trackIds=[t['id'] for t in tracks if t['category'] in ['Chill','Ambiente']]),dict(id='editorial-focus',name='Foco profundo',description='Uma trilha para suas melhores ideias.',cover=albums[1]['cover'],ownerId=None,ownerName='Spotfy',isPublic=True,trackIds=[t['id'] for t in tracks if t['category']=='Foco']),dict(id='editorial-all',name='Descobertas da semana',description='Novos sons, novas histórias. Só originais.',cover=albums[4]['cover'],ownerId=None,ownerName='Spotfy',isPublic=True,trackIds=[t['id'] for t in tracks])]
(ROOT/'public'/'catalog.json').write_text(json.dumps(dict(tracks=tracks,artists=artists,albums=albums,playlists=playlists,total=len(tracks)),ensure_ascii=False,indent=2)+'\n')
print(f'{len(tracks)} faixas originais; {sum(t["duration"] for t in tracks)} segundos de áudio PCM; {len(albums)} capas.')
