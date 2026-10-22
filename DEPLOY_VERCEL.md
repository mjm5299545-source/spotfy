# Preparação para a Vercel

O aplicativo possui configuração para frontend estático e função Node.js em `vercel.json`. A função usa PostgreSQL para contas, sessões, catálogo, biblioteca, administração e auditoria; uploads administrativos vão para Vercel Blob. Os 12 WAV autorais (cerca de 17 MB) e as capas estão versionados em `public/media/` e entram no build estático. O SQLite continua sendo o modo local.

## Serviços necessários

1. O projeto `spotfy` já publica `main` em `https://spotfy-tau.vercel.app/`. Conferir no painel da conta Vercel que as integrações e variáveis abaixo pertencem ao ambiente **Production** desse projeto.
2. Provisionar um PostgreSQL persistente, por exemplo Neon pela integração de armazenamento da Vercel, e um Vercel Blob público. Usar bancos e stores distintos para preview e produção, se ambos forem habilitados.
3. Configurar `DATABASE_URL` (URL de conexão PostgreSQL) e `BLOB_READ_WRITE_TOKEN` nos ambientes adequados do projeto. Não colocar valores no Git, no chat nem em URLs públicas. Se a integração expuser outro nome de variável, mapeá-lo para `DATABASE_URL`.
4. A versão exige Node.js 24. A Vercel executa `npm run build`, publica `dist` e encaminha `/api/*` para a função `api/index.ts`. `APP_ORIGIN` é opcional em preview; para domínio fixo de produção, defina sua origem HTTPS exata. Para entrega real de recuperação de senha, configure também SMTP conforme `.env.example`.
5. Criar a primeira conta administrativa com `npm run admin:create` em um ambiente seguro que tenha `DATABASE_URL`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` (12+ caracteres). O comando não sobrescreve uma conta existente.

## Verificação após conectar os serviços

- Abrir a URL HTTPS e confirmar `/api/health` com `database: connected`.
- Abrir catálogo e reproduzir uma faixa WAV; conferir resposta `206` para Range e avanço real do tempo.
- Cadastrar uma conta, recarregar e confirmar sessão; criar playlist, atualizar a página e verificar persistência.
- Entrar como administrador e enviar um áudio e uma imagem pequenos. O upload na função é limitado a 4 MB por arquivo; o retorno deve ser uma URL pública do Blob. Criar uma faixa com o áudio e reproduzi-la.
- Fazer novo deploy e repetir leitura de conta, playlist e mídia para comprovar persistência. Testar recuperação de senha em caixa controlada após configurar SMTP.

Antes da conexão externa, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` e os testes de PostgreSQL isolado com `DATABASE_URL_TEST` verificam o código local. Esses testes não comprovam publicação nem conectividade de Neon/Blob na conta do usuário.

## Limites operacionais

- Em 22/10/2026, a URL pública está ativa, mas `/api/health` responde `503` com `code: missing_database_url`: `DATABASE_URL` ainda não foi configurada em Production. A sessão CLI deste ambiente não tem acesso à conta Vercel; a presença de PostgreSQL e Blob não foi confirmada. O catálogo autoral e as faixas estáticas funcionam como fallback, mas cadastro, login, biblioteca e administração precisam da API persistente.
- O banco SQLite local não é copiado automaticamente. Na auditoria desta tarefa não havia dados de usuário no diretório `data/`; se outro ambiente já possuir usuários, uma exportação/importação controlada deve anteceder a troca de banco.
- As limitações de tamanho da função Vercel impedem arquivos administrativos maiores que 4 MB por esse formulário. Áudios autorais do catálogo já estão incluídos como arquivos estáticos. A limitação de tentativas por `express-rate-limit` é por instância de função; para um lançamento público com tráfego real, configurar limitação distribuída/WAF e monitoramento na conta Vercel.
- Sem SMTP, a redefinição de senha não entrega e-mail em produção. Credenciais de banco, Blob e SMTP devem permanecer nos segredos da plataforma.
