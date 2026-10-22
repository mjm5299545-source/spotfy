# Preparação para a Vercel

O aplicativo possui configuração para frontend estático e função Node.js em `vercel.json`. A função usa PostgreSQL para contas, sessões, catálogo, biblioteca, administração e auditoria; o upload administrativo usa Vercel Blob quando configurado. Os 12 WAV autorais (cerca de 17 MB) e as capas estão versionados em `public/media/` e entram no build estático. O SQLite continua sendo o modo local.

## Serviços necessários

1. O projeto `spotfy` já publica `main` em `https://spotfy-tau.vercel.app/`. Conferir no painel da conta Vercel que as integrações e variáveis abaixo pertencem ao ambiente **Production** desse projeto.
2. Usar o projeto Supabase existente `yhoxyefiwbiqvxwsimzh` (PostgreSQL 17, região `us-east-1`). No painel Supabase, abrir **Connect** e copiar a URI do **Shared pooler, Transaction mode** para o backend serverless; a [documentação oficial](https://supabase.com/docs/guides/database/connecting-to-postgres) recomenda esse modo para funções que abrem conexões curtas. Conferir a URI exata e TLS no painel, sem supor conexão direta IPv6 nem desativar a validação do certificado. O driver `pg` não atribui nomes a prepared statements e define `search_path` com `SET LOCAL` dentro da transação, sem depender de estado de sessão do pooler.
3. Configurar a URI como segredo `DATABASE_URL` no ambiente **Production** do projeto Vercel e fazer redeploy. O bootstrap criará `spotfy_private`, fora dos schemas expostos pela API Supabase, e revogará acesso de `PUBLIC`, `anon` e `authenticated` às tabelas; a autenticação do Spotfy continua no backend. Não usar chave `anon` ou `service_role` como URL do banco, não incluir a URL no frontend, Git ou chat e não redefinir a senha existente. A [orientação de segurança da Supabase](https://supabase.com/docs/guides/api/securing-your-api) distingue grants/RLS de acesso pelo backend.
4. Verificar os recursos de armazenamento já disponíveis antes de criar outro. `BLOB_READ_WRITE_TOKEN` só é necessário para **uploads administrativos**, e deve ser configurado em Production se um Vercel Blob existente ou uma opção gratuita for escolhida. A ausência dele não bloqueia catálogo, cadastro, login ou biblioteca; upload responde 503 até estar configurado. Não contratar serviço pago sem aprovação. Separar recursos de preview e produção, se ambos forem usados.
5. A versão exige Node.js 24. A Vercel executa `npm run build`, publica `dist` e encaminha `/api/*` para a função `api/index.ts`. `APP_ORIGIN` é opcional em preview; para domínio fixo de produção, defina sua origem HTTPS exata. Para entrega real de recuperação de senha, configure também SMTP conforme `.env.example`.
6. Criar a primeira conta administrativa com `npm run admin:create` em um ambiente seguro que tenha `DATABASE_URL`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` (12+ caracteres). O comando não sobrescreve uma conta existente.

## Verificação após conectar os serviços

- Abrir a URL HTTPS e confirmar `/api/health` com `database: connected`.
- Abrir catálogo e reproduzir uma faixa WAV; conferir resposta `206` para Range e avanço real do tempo.
- Cadastrar uma conta, recarregar e confirmar sessão; criar playlist, atualizar a página e verificar persistência.
- Depois de configurar armazenamento, entrar como administrador e enviar um áudio e uma imagem pequenos. O upload na função é limitado a 4 MB por arquivo; com Vercel Blob, o retorno deve ser uma URL pública do Blob. Criar uma faixa com o áudio e reproduzi-la.
- Fazer novo deploy e repetir leitura de conta, playlist e mídia para comprovar persistência. Testar recuperação de senha em caixa controlada após configurar SMTP.

Antes da conexão externa, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` e os testes de PostgreSQL isolado com `DATABASE_URL_TEST` verificam o código local. Esses testes não comprovam conectividade com Supabase nem armazenamento da conta do usuário.

## Limites operacionais

- Em 22/10/2026, a URL pública está ativa, mas `/api/health` responde `503` com `code: missing_database_url`: o projeto Supabase existente ainda não foi ligado à variável `DATABASE_URL` de Production na Vercel. Este executor não tem acesso autenticado ao projeto Vercel nem ao conector Supabase; nenhuma tabela foi criada remotamente e o armazenamento não foi verificado. O catálogo autoral e as faixas estáticas funcionam como fallback, mas cadastro, login, biblioteca e administração precisam da API persistente.
- O banco SQLite local não é copiado automaticamente. Na auditoria desta tarefa não havia dados de usuário no diretório `data/`; se outro ambiente já possuir usuários, uma exportação/importação controlada deve anteceder a troca de banco.
- As limitações de tamanho da função Vercel impedem arquivos administrativos maiores que 4 MB por esse formulário. Áudios autorais do catálogo já estão incluídos como arquivos estáticos. A limitação de tentativas por `express-rate-limit` é por instância de função; para um lançamento público com tráfego real, configurar limitação distribuída/WAF e monitoramento na conta Vercel.
- Sem SMTP, a redefinição de senha não entrega e-mail em produção. Credenciais de banco, Blob e SMTP devem permanecer nos segredos da plataforma.
