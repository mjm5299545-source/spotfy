import {test,expect,type Page} from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import type {Catalog} from '../../shared/types';

const password='Melodia-Segura-2026!';
const email=()=>`browser-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
async function catalog(page:Page):Promise<Catalog>{const r=await page.request.get('/api/catalog?limit=100');expect(r.ok()).toBeTruthy();return r.json();}
async function register(page:Page){
  const r=await page.request.post('/api/auth/register',{data:{email:email(),password,name:'Pessoa do navegador'}});
  expect(r.status()).toBe(201);
  return r.json();
}
async function navigateToTrackList(page:Page){
 const c=await catalog(page);expect(c.tracks.length).toBeGreaterThan(1);
 const first=c.tracks[0];await page.goto(`/album/${first.albumId}`);
 await expect(page.getByRole('button',{name:`Reproduzir ${first.title}`,exact:true})).toBeVisible();
 return c.tracks.filter(t=>t.albumId===first.albumId);
}

test('cadastro pela interface, sessão persistida e logout',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Inscreva-se',exact:true}).first().click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Como podemos chamar você?').fill('Pessoa de teste');
 const account=email();await dialog.getByLabel('E-mail',{exact:true}).fill(account);
 await dialog.getByLabel('Senha',{exact:true}).fill(password);
 await dialog.getByRole('button',{name:'Criar conta',exact:true}).click();
 await expect(dialog).not.toBeVisible();
 await page.reload();
 const me=await page.request.get('/api/me');expect((await me.json()).user.email).toBe(account);
 await expect(page.getByLabel('Menu da conta')).toBeVisible();
 await page.getByLabel('Menu da conta').click();
 await expect(page.getByText('Pessoa de teste',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Sair',exact:true}).click();
 expect((await (await page.request.get('/api/me')).json()).user).toBeNull();
 await expect(page.getByRole('button',{name:'Entrar',exact:true}).first()).toBeVisible();
 await page.getByRole('button',{name:'Entrar',exact:true}).first().click();
 await dialog.getByLabel('E-mail',{exact:true}).fill(account);
 await dialog.getByLabel('Senha',{exact:true}).fill(password);
 await dialog.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(dialog).not.toBeVisible();
 expect((await (await page.request.get('/api/me')).json()).user.email).toBe(account);
});

test('favoritos e playlist persistem após recarregar a página',async({page})=>{
 await register(page);const tracks=await navigateToTrackList(page);const track=tracks[0];
 await page.getByRole('button',{name:`Adicionar aos favoritos: ${track.title}`,exact:true}).click();
 await expect(page.getByRole('button',{name:`Remover dos favoritos: ${track.title}`,exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:`Remover dos favoritos: ${track.title}`,exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Criar playlist',exact:true}).first().click();
 const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:/playlist/i})});
 await dialog.getByLabel('Nome da playlist', {exact:true}).fill('Viagem de teste');
 await dialog.getByRole('button',{name:'Criar playlist',exact:true}).click();
 await expect(dialog).not.toBeVisible();
 await page.goto(`/album/${track.albumId}`);
 await page.getByLabel(`Opções de ${track.title}`,{exact:true}).click();
 await page.getByRole('button',{name:'Viagem de teste',exact:true}).click();
 const library=await (await page.request.get('/api/library')).json();
 const playlist=library.playlists.find((p:{name:string})=>p.name==='Viagem de teste');
 expect(playlist.trackIds).toContain(track.id);
 await page.goto(`/playlist/${playlist.id}`);
 await expect(page.getByRole('heading',{name:'Viagem de teste',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:track.title,exact:true})).toBeVisible();
});

test('busca consulta dados reais e exibe estado sem resultados',async({page})=>{
 await page.goto('/');const c=await catalog(page);const track=c.tracks[0];
 const search=page.getByRole('textbox',{name:'O que você quer ouvir?'});
 await search.fill(track.title);
 await expect(page.getByRole('button',{name:track.title,exact:true})).toBeVisible();
 await search.fill('zzzzz-inexistente-827364');
 await expect(page.getByText(/nenhum resultado|não encontramos/i).first()).toBeVisible();
});

test('busca carrega mais faixas sem repetir resultados',async({page})=>{
 await page.goto('/search');
 const c=await catalog(page);
 expect(c.tracks.length).toBeGreaterThan(8);
 await expect(page.getByRole('button',{name:c.tracks[0].title,exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:c.tracks[8].title,exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Mostrar mais músicas'}).click();
 await expect(page.getByRole('button',{name:c.tracks[8].title,exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:c.tracks[0].title,exact:true})).toHaveCount(1);
});

test('áudio real avança, pausa, busca posição e controla volume',async({page})=>{
 const tracks=await navigateToTrackList(page);const first=tracks[0];
 await page.getByRole('button',{name:`Reproduzir ${first.title}`,exact:true}).click();
 const audio=page.locator('audio');
 await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>({playing:!a.paused,time:a.currentTime}))).toMatchObject({playing:true});
 await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(0.25);
 await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.duration)).toBeGreaterThan(10);
 await page.getByRole('button',{name:'Pausar',exact:true}).click();
 await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true);
 const seek=page.getByRole('slider',{name:/progresso|posição/i});
 await seek.fill('10');await seek.dispatchEvent('change');
 await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThanOrEqual(9.5);
 const volume=page.getByRole('slider',{name:'Volume',exact:true});await volume.fill('0.3');await volume.dispatchEvent('change');
 await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.volume)).toBeCloseTo(0.3,1);
 await page.getByRole('button',{name:/silenciar|mudo/i}).click();
 await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.muted||a.volume===0)).toBe(true);
});

test('falha de mídia avisa a pessoa e a próxima faixa recupera a reprodução',async({page})=>{
 const tracks=await navigateToTrackList(page);
 await page.route(`**${tracks[0].audioUrl}`,route=>route.abort('failed'));
 await page.getByRole('button',{name:`Reproduzir ${tracks[0].title}`,exact:true}).click();
 await expect(page.getByRole('alert')).toContainText(/áudio|rede|reproduzir/i);
 await page.getByRole('alert').getByRole('button',{name:'Próxima faixa'}).click();
 const audio=page.getByTestId('audio-player');
 await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.currentSrc)).toContain(tracks[1].audioUrl);
 await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>!a.paused&&a.currentTime>0)).toBe(true);
});

test('falha do catálogo é visível e pode ser recuperada',async({page})=>{
 await page.route('**/api/catalog?**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Catálogo indisponível para este teste.'})}));
 await page.goto('/');await expect(page.getByText('Catálogo indisponível para este teste.')).toBeVisible();
 await page.unroute('**/api/catalog?**');await page.reload();
 const c=await catalog(page);await expect(page.getByText(c.albums[0].title,{exact:true}).first()).toBeVisible();
});

test('recuperação de senha permanece acessível quando o catálogo falha',async({page})=>{
 await page.route('**/api/catalog?**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Catálogo indisponível.'})}));
 await page.goto('/reset-password?token=invalid');
 await expect(page.getByRole('heading',{name:'Uma nova senha, um novo começo.'})).toBeVisible();
 await expect(page.getByLabel('Nova senha')).toBeVisible();
});

test('mobile 360px mantém navegação, conteúdo e player dentro da tela',async({page})=>{
 await page.setViewportSize({width:360,height:800});await page.goto('/');
 await expect(page.getByRole('main')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/mobile-home.png',fullPage:true});
 await navigateToTrackList(page);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/mobile-album.png',fullPage:true});
});

test('painel administrativo não revela dados a visitante',async({page})=>{
 await page.goto('/admin');
 await expect(page.getByText(/acesso restrito|administrador|entrar/i).first()).toBeVisible();
 const r=await page.request.get('/api/admin/users');expect([401,403]).toContain(r.status());
});

test('administrador autenticado gerencia playlists públicas no painel',async({page})=>{
 const {user}=await register(page);
 const dbPath=process.env.SPOTFY_E2E_DB_PATH;
 expect(dbPath).toBeTruthy();
 const db=new DatabaseSync(dbPath!);
 try {db.prepare("UPDATE users SET role='admin' WHERE id=?").run(user.id);} finally {db.close();}
 await page.goto('/admin');
 await expect(page.getByRole('heading',{name:'Administração'})).toBeVisible();
 await page.getByRole('button',{name:'Playlists',exact:true}).click();
 await page.getByRole('button',{name:'Adicionar',exact:true}).click();
 await page.getByLabel('Nome da playlist').fill('Curadoria do navegador');
 await page.getByRole('button',{name:'Salvar registro'}).click();
 await expect(page.getByText('Curadoria do navegador',{exact:true})).toBeVisible();
 const found=(await (await page.request.get('/api/catalog?limit=100')).json()).playlists.find((item:{name:string})=>item.name==='Curadoria do navegador');
 expect(found).toBeTruthy();
 await page.getByRole('button',{name:'Registros',exact:true}).click();
 await expect(page.getByText(/admin\.playlist\.create/)).toBeVisible();
});

test('fila, repetição, atalhos e navegação preservam a reprodução',async({page})=>{
 const tracks=await navigateToTrackList(page);expect(tracks.length).toBeGreaterThan(1);
 await page.getByRole('button',{name:`Reproduzir ${tracks[0].title}`,exact:true}).click();
 const audio=page.getByTestId('audio-player');
 await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>!a.paused&&a.currentTime>0)).toBe(true);
 await page.getByRole('button',{name:'Fila de reprodução',exact:true}).click();
 const queue=page.getByRole('complementary',{name:'Fila de reprodução',exact:true});
 await expect(queue).toBeVisible();
 await queue.getByRole('button',{name:`Reproduzir ${tracks[1].title} da fila`,exact:true}).click();
 await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.currentSrc)).toContain(tracks[1].audioUrl);
 await page.getByRole('button',{name:'Ativar repetição',exact:true}).click();
 await expect(page.getByRole('button',{name:'Repetir uma faixa',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Próxima faixa',exact:true}).click();
 await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.currentSrc)).toContain(tracks[0].audioUrl);
 await page.getByRole('button',{name:'Reprodução aleatória',exact:true}).click();
 await expect(page.getByRole('button',{name:'Reprodução aleatória',exact:true})).toHaveAttribute('aria-pressed','true');
 await queue.getByRole('button',{name:'Fechar fila',exact:true}).click();
 await page.getByRole('link',{name:'Spotfy início',exact:true}).click();
 await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>!a.paused)).toBe(true);
 await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.currentSrc)).toContain(tracks[0].audioUrl);
 await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
 await page.keyboard.press('Space');
 await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true);
});

test('playlist permite reordenar, editar e excluir pela interface',async({page})=>{
 await register(page);const c=await catalog(page);const tracks=c.tracks.slice(0,2);
 const r=await page.request.post('/api/playlists',{data:{name:'Ordem original',description:'Teste de edição',isPublic:false}});
 expect(r.status()).toBe(201);const {playlist}=await r.json();
 expect((await page.request.patch(`/api/playlists/${playlist.id}`,{data:{trackIds:tracks.map(t=>t.id)}})).ok()).toBeTruthy();
 await page.goto(`/playlist/${playlist.id}`);
 await page.getByLabel(`Opções de ${tracks[1].title}`,{exact:true}).click();
 await page.getByRole('button',{name:'Mover para cima',exact:true}).last().click();
 await expect.poll(async()=>((await (await page.request.get(`/api/playlists/${playlist.id}`)).json()).playlist.trackIds)).toEqual([tracks[1].id,tracks[0].id]);
 await page.getByRole('button',{name:'Editar playlist',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByLabel('Nome da playlist').fill('Ordem revisada');
 await dialog.getByRole('button',{name:'Salvar alterações',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Ordem revisada',exact:true})).toBeVisible();
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Excluir playlist',exact:true}).click();
 await expect(page).toHaveURL(/\/library/);
 expect((await page.request.get(`/api/playlists/${playlist.id}`)).status()).toBe(404);
});

for(const viewport of [{name:'desktop',width:1440,height:900},{name:'mobile',width:360,height:800}]){
 test(`baseline visual inicial ${viewport.name}`,async({page})=>{
  await page.setViewportSize({width:viewport.width,height:viewport.height});
  await page.clock.setFixedTime(new Date('2026-10-20T15:00:00-03:00'));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Feito para o seu momento',exact:true})).toBeVisible();
  await page.evaluate(async()=>{await document.fonts.ready;});
  const maxDiffPixelRatio = process.env.CI ? (viewport.name === 'mobile' ? 0.08 : 0.04) : 0.02;
  await expect(page).toHaveScreenshot(`home-${viewport.name}.png`,{animations:'disabled',maxDiffPixelRatio});
 });
}
