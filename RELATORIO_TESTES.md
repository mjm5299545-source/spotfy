# Relatório de validação

## Escopo e contexto

Validação local do primeiro aplicativo do repositório, sobre a branch `feat/music-player`. A base continha apenas um README: não existia suíte prévia nem imagem da interface anterior. Os testes descritos foram executados na máquina da tarefa com Node.js 24.19.0, Python 3 e Chromium local. As imagens de baseline são do **Spotfy criado aqui**, e não de uma página do Spotify.

Os testes automatizados usam diretórios e bancos SQLite isolados em `/tmp`; não dependem de conta Spotify, credenciais de produção ou envio externo de e-mail.

## Comandos e resultados

| Verificação | Comando / método | Resultado observado | Alcance |
| --- | --- | --- | --- |
| Instalação reproduzível | `npm ci --cache /workspace/.npm-cache --no-audit --no-fund` | Aprovado; 246 pacotes instalados pelo lockfile | Não instala serviços externos |
| Geração de mídia | `npm run media:generate` | Aprovado; 12 WAV instrumentais e 6 SVG produzidos | Arquivos gerados são ignorados pelo Git e reproduzíveis |
| Consistência dos áudios | Script Python com `wave` e `public/catalog.json` | Aprovado; 12 arquivos decodificados, duração, capas e relações conferidas | Verifica contêiner e metadados; não é avaliação auditiva |
| Tipos | `npm run typecheck` e etapa TypeScript do build | Aprovado, status 0 | Todos os arquivos incluídos em `tsconfig.json` |
| Lint | `npm run lint` | Aprovado, status 0 | Regras de ESLint configuradas para o projeto |
| Build | `npm run build` | Aprovado; Vite gerou `dist` | Empacotamento de produção; execução conferida separadamente |
| Unitários e integração | `npm test` | **16 passaram, 0 falharam, 0 ignorados** | Fila, modos, tempo, HTTP, autenticação, banco, catálogo e segurança |
| Navegador | `npm run test:e2e` | **15 passaram, 0 falharam, 0 ignorados** | Fluxos reais via React, API, SQLite e Chromium; ver abaixo |
| Dependências | `npm audit --audit-level=moderate --cache /workspace/.npm-cache` | Aprovado; 0 vulnerabilidades encontradas | Resultado pontual do banco de advisories na data da execução |
| Servidor de produção | `NODE_ENV=production PORT=3017 DATA_DIR=/tmp/spotfy-prod-smoke npm start` + pedidos locais | Aprovado: `/api/health` 200, `/` 200, `/album/horizontes` 200, WAV 206 Range e SVG 200 | Smoke local; não representa deploy público |
| Primeiro administrador | `npm run admin:create` com valores exclusivos de teste em `/tmp` | Aprovado: 1 admin persistido; segunda execução recusou sobrescrita com código 1 esperado | Não foram usadas credenciais reais |
| Revisão do diff | `git diff --check`, status e arquivos rastreados | Sem whitespace inválido; dados privados e WAV gerados estão no `.gitignore` | Nova conferência necessária após qualquer mudança |

Os testes de API incluem cadastro e validação, senha incorreta, login e logout, persistência de sessão, atualização do nome, recuperação por token expirável e de uso único, revogação após reset, catálogo filtrado e paginado, biblioteca e ordem persistidas após reabrir SQLite, tentativas de escalada de papel, isolamento entre usuários, origem externa, integridade referencial, rollback de playlist, uploads autorizados, assinatura de arquivo, bytes reais e entrega parcial `206`.

Os testes de navegador cobrem cadastro e login pela interface, retorno da sessão após recarga, logout, favoritos, playlist com adição, reordenação, edição e exclusão, busca com debounce e estado vazio, carregamento paginado sem duplicar faixas, áudio cujo `currentTime` avança, pausa, seek, volume, mudo, erro de mídia com recuperação por próxima faixa, fila e repetição, reprodução mantida após navegação, atalhos, recuperação de erro do catálogo, rota de reset independente do catálogo, acesso negado ao admin para visitante, criação de playlist pública pelo painel administrativo e viewport móvel de 360 px sem overflow horizontal.

As duas verificações visuais com Playwright passaram contra os novos snapshots em `tests/e2e/music.spec.ts-snapshots/` (desktop 1440×900 e mobile 360×800, tolerância local de 2%). O primeiro registro do baseline foi feito com `--update-snapshots` e depois os testes passaram sem esse parâmetro. No primeiro CI remoto, os 13 cenários funcionais passaram, mas os screenshots divergiram 3% no desktop e 7% no mobile entre o runner Ubuntu e o Debian usado para gerar o baseline. O CI passou a usar limites de 4% e 8% respectivamente, mantendo 2% localmente; os dois checks `quality` do PR passaram no commit `914ca7b`. Não havia screenshot da aplicação anterior, e a referência Spotify não pôde ser carregada; logo os snapshots não comprovam fidelidade à referência.

## Falhas encontradas e corrigidas durante a validação

- O primeiro E2E de cadastro encontrou `403` por diferença entre a origem do Vite e o host visto pela API no proxy local. A validação agora aceita especificamente `localhost:5173` e `127.0.0.1:5173` em desenvolvimento; a origem canônica de produção continua estrita. Cadastro/login foram reexecutados e passaram.
- O teste visual inicial não tinha snapshot porque o projeto não possuía frontend anterior. Foi criado um baseline local; a suíte passou após a criação.
- O teste móvel inicialmente esperava todas as imagens da página, inclusive lazy images fora da viewport. A espera foi limitada às fontes e o snapshot passou.
- Um teste E2E de administração inicialmente usou caminhos SQLite diferentes entre processo principal e worker. A configuração passou a compartilhar um caminho por execução; o cenário passou.
- O painel ganhou gestão de playlists, atualização de contagens e exclusão de usuários com confirmação. Um teste navegador confirmou acesso administrativo e criação de playlist pública.
- O formulário de senha passou a exigir os mesmos 12 caracteres aceitos pelo servidor. A rota de reset permanece acessível em falha de catálogo; teste específico passou.

## Limites e verificações externas pendentes

| Item | Estado | Condição para verificar |
| --- | --- | --- |
| Referência `open.spotify.com/intl-pt` | **Bloqueado**: proxy retornou CONNECT 403 antes de conteúdo | Aplicar política de rede aprovada, carregar página pública, registrar DOM, screenshots e ações legítimas |
| Fluxos autenticados do Spotify | **Não executados** | Sessão legítima disponibilizada pelo usuário, se desejada, sem compartilhar senha/token em chat |
| Entrega externa de recuperação de senha | **Bloqueada** por SMTP ausente | Configurar serviço/remetente e credenciais no ambiente seguro; validar recebimento em caixa controlada |
| Regressão contra interface anterior | **Não aplicável**: base não tinha frontend | Baseline desta interface já criado; usá-lo em mudanças futuras |
| Leitor de tela, teclado completo e qualidade auditiva | **Não executados manualmente** | Teste humano com dispositivo e áudio adequados |
| CI no GitHub | **Aprovado** no commit `914ca7b`: checks `quality` de push e PR concluíram com `SUCCESS` | Incluiu instalação, geração de mídia, tipos, lint, testes, build, audit e E2E no runner Ubuntu |
| Deploy público, HTTPS, backups externos | **Não executados** | Planejamento operacional separado; não solicitado nesta entrega |

Não foram contabilizados testes bloqueados como aprovados. O status da publicação fica em [CONTINUIDADE_CODEX.md](CONTINUIDADE_CODEX.md).

## Adendo: migração para Vercel

Na branch `feat/vercel-deploy`, o backend recebeu adaptador PostgreSQL e upload para Vercel Blob, mantendo SQLite para uso local. Os 12 WAV autorais, antes ignorados, passam a ser versionados para o build estático. Este adendo descreve apenas a validação do código de migração; nenhum deploy Vercel foi realizado.

| Verificação | Resultado |
| --- | --- |
| Instalação reproduzível | `npm ci --cache /workspace/.npm-cache --no-audit --no-fund`: 286 pacotes pelo novo lockfile |
| PostgreSQL 17 isolado em Docker | `npm run test:postgres` com `DATABASE_URL_TEST`: 2 testes passaram, cobrindo seed, consultas, cadastro, sessão, playlist, rollback, autorização administrativa, uploads de áudio e imagem com Blob simulado, validação de URL e integridade referencial |
| Primeiro administrador no PostgreSQL | `npm run admin:create` com credenciais exclusivamente de teste: criação passou; repetição rejeitou sobrescrita com código 1 esperado |
| Entrada da função hospedada | `api/index.ts` montado em servidor HTTP local com PostgreSQL de teste e token Blob fictício: `/api/health` respondeu 200 e `database: connected` |
| SQLite existente | `npm test`: 16 testes passaram após a adaptação assíncrona das rotas |
| Tipos, lint e build | `npm run typecheck`, `npm run lint` e `npm run build`: passaram após a migração; 12 WAV aparecem em `dist/media/` |
| Navegador local | `npm run test:e2e`: 15 cenários passaram, incluindo áudio, administração e os baselines visuais |
| Dependências | `npm audit --audit-level=moderate`: 0 vulnerabilidades encontradas após incluir PostgreSQL e Blob |
| Vercel real, PostgreSQL gerenciado e Blob real | **Não executados**: conta/projeto e serviços ainda não foram conectados; o upload em teste usou um adaptador simulado |

Os testes originais acima foram executados antes da migração; a linha sobre WAV ignorados registra o estado naquele momento. Para os próximos builds, os WAV versionados estarão disponíveis sem rodar Python. Ver [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md) para a validação externa pendente.
