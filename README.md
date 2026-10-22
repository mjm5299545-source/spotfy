# Spotfy

Aplicativo de música independente com React, TypeScript e Express. Usa SQLite localmente e PostgreSQL persistente na hospedagem. Navegação, áudio real, busca, biblioteca pessoal, playlists, autenticação e administração em uma interface escura inspirada no padrão de players de música. Não é afiliado ao Spotify e não utiliza seu catálogo ou serviços privados.

## Executar

Requer **Node.js 24.15+ na série 24**, npm e Python 3 (para gerar as composições).

```sh
npm ci
npm run media:generate
npm run dev
```

Vite usa a porta 5173; API usa 3001. Abra a aplicação pelo servidor Vite. O catálogo é servido pelo banco SQLite, inicializado com `public/catalog.json`. Os 12 arquivos WAV reais e as seis capas originais são produzidos pelo script reprodutível `scripts/generate_media.py`, sob CC0. Nenhum cadastro é necessário para ouvir. Para biblioteca pessoal, crie sua conta na interface; não há contas ou senhas padrão.

O repositório inicial tinha somente `README.md`. Não havia frontend ou serviços existentes; a auditoria dessa base está em [ENGENHARIA_REVERSA.md](ENGENHARIA_REVERSA.md).

## Banco, sessões e administração

O banco local é criado em `data/spotfy.sqlite` com foreign keys, índices e migração inicial idempotente. Dados, sessões, uploads e mensagens locais ficam em `data/`, fora do Git. Preserve esse diretório e faça backup consistente do SQLite, incluindo o WAL, antes de operações de manutenção. Na hospedagem, o PostgreSQL conserva contas, sessões e biblioteca, e o Vercel Blob conserva uploads. Veja [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md).

A conta administrativa é criada de forma explícita:

```sh
# Configure ADMIN_EMAIL, ADMIN_PASSWORD e opcionalmente ADMIN_NAME
# no ambiente seguro antes deste comando.
npm run admin:create
```

O comando não sobrescreve contas existentes. Com `DATABASE_URL` configurada, cria o administrador no PostgreSQL; caso contrário, no SQLite local. Depois entre normalmente e abra a administração pelo menu do perfil. As operações administrativas verificam a sessão e a função no servidor. Upload de mídia exige declaração de licença e aceita WAV, MP3, OGG, FLAC, PNG, JPEG ou WebP até 25 MB localmente ou 4 MB na função hospedada. Use apenas conteúdo próprio ou autorizado.

Senhas são armazenadas com scrypt e salt; o cookie contém um token opaco, cuja versão com hash fica no banco. Logout e redefinição de senha invalidam sessões. A origem é validada nas mutações. O perfil permite editar o nome; alteração de e-mail permanece indisponível até existir um fluxo de verificação.

## Variáveis e e-mail

Veja [.env.example](.env.example) para nomes e exemplos sem credenciais. Exporte as variáveis no processo ou no gerenciador do ambiente; o servidor não carrega arquivos `.env` automaticamente.

`APP_ORIGIN`, quando configurada, deve ser a origem exata do frontend. Em desenvolvimento com outro hostname, configure-a de acordo com o navegador. Sem configuração, a validação de origem usa o host da requisição. O link de recuperação usa `http://localhost:5173` localmente ou a origem HTTPS da requisição na hospedagem.

Em desenvolvimento, sem SMTP, solicitações de recuperação geram mensagens privadas em `data/outbox/`; o token não é devolvido pela API. **Envio real de e-mails requer SMTP_HOST, SMTP_PORT, SMTP_SECURE e, quando necessário, SMTP_USER, SMTP_PASSWORD e SMTP_FROM.** Em produção sem SMTP não há caixa de saída de desenvolvimento. Tokens expiram em 30 minutos e só podem ser usados uma vez.

## Produção local

```sh
npm run build
npm start
```

O servidor Express entrega o frontend compilado, a API e mídia. Na Vercel, os arquivos estáticos ficam no frontend e a API roda como função Node.js, com PostgreSQL e Blob persistentes. Cookies são `Secure` em produção. Para testar produção exclusivamente em HTTP local, use `COOKIE_SECURE=false`. A configuração para Vercel está preparada, mas ainda não há uma conta/projeto conectado nem deploy confirmado.

## Verificar

```sh
npm run typecheck
npm run lint
npm test
# Com um PostgreSQL de teste isolado em DATABASE_URL_TEST:
npm run test:postgres
npm run build
npm run test:e2e
npm audit --audit-level=moderate
```

Os testes de navegador usam Chromium do sistema quando disponível; em outro ambiente execute `npx playwright install --with-deps chromium`. Os testes E2E iniciam servidores e usam dados isolados. Resultados efetivamente executados estão em [RELATORIO_TESTES.md](RELATORIO_TESTES.md). A configuração de CI reproduz esses comandos, mas sua existência não significa que o workflow já foi executado no GitHub.

## Documentação

- [Engenharia reversa, evidências e auditoria inicial](ENGENHARIA_REVERSA.md)
- [Inventário e critérios de aceitação](INVENTARIO_FUNCIONALIDADES.md)
- [Arquitetura e contratos](ARQUITETURA.md)
- [Testes e limitações](RELATORIO_TESTES.md)
- [Continuidade e publicação](CONTINUIDADE_CODEX.md)
- [Preparação da hospedagem Vercel](DEPLOY_VERCEL.md)

A inspeção ao vivo da referência foi impedida pelo proxy do ambiente. A interface é uma implementação independente baseada nos requisitos fornecidos. Não foi comprovada equivalência visual pixel a pixel ou acesso a comportamentos autenticados do Spotify.
