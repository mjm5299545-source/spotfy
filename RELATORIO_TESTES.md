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

As duas verificações visuais com Playwright passaram contra os novos snapshots em `tests/e2e/music.spec.ts-snapshots/` (desktop 1440×900 e mobile 360×800, tolerância de 2%). O primeiro registro do baseline foi feito com `--update-snapshots` e depois os testes passaram sem esse parâmetro. Não havia screenshot da aplicação anterior, e a referência Spotify não pôde ser carregada; logo os snapshots não comprovam fidelidade à referência.

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
| CI no GitHub | **Em andamento** após push e PR #1; dois checks `quality` observados como `pending` | Conferir conclusão do workflow na página do PR; não contar como aprovado antes disso |
| Deploy público, HTTPS, backups externos | **Não executados** | Planejamento operacional separado; não solicitado nesta entrega |

Não foram contabilizados testes bloqueados como aprovados. O status da publicação fica em [CONTINUIDADE_CODEX.md](CONTINUIDADE_CODEX.md).
