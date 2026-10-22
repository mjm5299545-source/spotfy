# Análise da referência e decisões de implementação

## Alcance e evidências

A referência solicitada é `https://open.spotify.com/intl-pt`. O alvo de implementação é `mjm5299545-source/spotfy`, a partir do commit `55b820f2c96cc485101a6b2c0de2bb35f923c13e`.

| Evidência | Origem | O que estabelece | Limite |
| --- | --- | --- | --- |
| E01 | [Auditoria inicial](docs/evidence/initial-audit.json) | O commit inicial contém somente `README.md`, de 8 bytes; árvore inicialmente limpa | Não existia aplicativo a executar ou aparência a comparar |
| E02 | `git ls-remote origin refs/heads/main` | O remoto selecionado apontava para o mesmo commit inicial | Leitura Git não demonstra permissão de push ou criação de PR |
| E03 | [Tentativa de acesso público](docs/evidence/spotify-access.txt) | O proxy respondeu CONNECT 403 antes de carregar a referência | Nenhum comportamento do Spotify foi observado |
| E04 | Prompt mestre fornecido pelo usuário | Define funcionalidades, preservação, segurança e critérios de aceitação pretendidos | Requisito não equivale a comportamento observado no produto de referência |
| E05 | Código, catálogo próprio e relatórios desta implementação | Estabelecem o desenho adotado e os resultados locais explicitamente executados | Não demonstram funcionamento interno ou equivalência integral ao Spotify |

As observações da referência ficaram bloqueadas pela política de rede. Não foram obtidas capturas de tela, DOM, capturas de rede, APIs privadas, sessões autenticadas ou arquivos de áudio do Spotify. A negativa é de acesso ao túnel; não foi interpretada como falha do serviço.

O rascunho do ambiente acrescentou os domínios necessários à inspeção pública. Esse salvamento não aplica a política nem publica o ambiente. A inspeção poderá ser retomada depois de uma alteração efetiva do acesso. A implementação independente não depende desse acesso.

## Estado inicial e preservação

Não existiam componentes, páginas, rotas, integrações, banco, testes, lockfile ou design estabelecido. Assim, a preservação consiste em manter o histórico e o `README.md` original recuperáveis. Não houve reconstrução de frontend existente: o primeiro frontend foi criado nesta tarefa.

Foi criada a referência Git `backup/pre-music-app-55b820f`, antes das alterações, e a branch `feat/music-player`. Para consultar o estado inicial sem perder trabalho: `git show backup/pre-music-app-55b820f:README.md`. Não executar reset destrutivo sobre alterações posteriores.

Não havia testes iniciais; “nenhum teste existente” não foi contado como aprovação. Os riscos iniciais eram construir contratos inconsistentes, expor rotas administrativas, simular reprodução, perder estado ao navegar e afirmar fidelidade sem evidências. As validações locais e os limites deste documento tratam esses riscos.

## Decisões próprias de interface

O pedido orienta uma experiência de player musical com navegação lateral, busca, biblioteca, conteúdo em cards e player persistente inferior. A implementação adota esses padrões e a identidade `Spotfy`, com superfícies escuras, acento verde, capas originais e textos em português.

Essas escolhas são decisões de produto desta implementação, não medições da página de referência. Não há afirmação de tipografia, espaçamentos, animações, breakpoints ou composição pixel a pixel do Spotify atual. A matriz de funcionalidades separa os requisitos da evidência disponível.

A interface contempla rotas próprias de início, pesquisa, biblioteca, favoritos, artista, álbum e playlist; autenticação e gestão administrativa; estados de espera, erro e vazio; e adaptação para telas menores. A confirmação de cada comportamento pertence ao [relatório de testes](RELATORIO_TESTES.md).

## Mapa das investigações e seus limites

| Área pedida | Evidência da referência nesta sessão | Tratamento adotado |
| --- | --- | --- |
| Estrutura, menus, cards, modais, tipografia e espaçamento | Bloqueada | Componentes próprios e critérios locais de acessibilidade; fidelidade visual não comprovada |
| Navegação e busca | Bloqueada | Rotas próprias e consulta ao banco do aplicativo |
| Play, pausa, avanço, progresso, volume, fila, aleatório e repetição | Bloqueada | API nativa de áudio do navegador, com estado derivado de eventos reais |
| Biblioteca, favoritos, playlists e preferências | Bloqueada | Persistência própria com isolamento entre usuários |
| Cadastro, login, recuperação e perfil | Bloqueada | Autenticação própria; não usa conta Spotify nem se apresenta como login do Spotify |
| Conteúdo, metadados e catálogo | Não acessados | Composições e imagens próprias; nenhuma música protegida extraída |
| Backend interno, banco e protocolos privados do Spotify | Não observados | Arquitetura própria, sem inferir tecnologias privadas |
| Responsividade e regressão visual | Não observadas na referência | Testes da interface local; não equivalem à comparação com screenshots de referência |

## Reprodução e conteúdo autorizado

O catálogo inicial usa arquivos de áudio instrumentais originais produzidos pelo script do projeto, com capas vetoriais próprias e licença documentada. O player carrega esses arquivos e usa `HTMLAudioElement`; não há contador artificial substituindo reprodução.

A autorização de novos conteúdos é responsabilidade do administrador que os cadastra. O painel exige metadados de licença; uma declaração de licença não é verificação jurídica automática. O aplicativo não implementa extração de catálogo, download de músicas, contorno de DRM ou reprodução protegida do Spotify.

## Método de validação

Foram definidos contratos explícitos entre frontend, API e banco; integridade e permissões devem ser verificadas no servidor. O player deve ser avaliado por carregamento real, avanço de `currentTime`, pausa, seek, fim de faixa e tratamento de erro. Para persistência, uma nova leitura deve confirmar o dado gravado, inclusive depois de reabrir o banco. Para autorização, respostas a usuários diferentes devem demonstrar isolamento.

Build, lint e tipos não substituem esses testes. As execuções, quantidades, falhas e bloqueios são registrados em `RELATORIO_TESTES.md`; nenhuma linha deste documento aprova checks não executados.

## O que ainda exige evidência externa

1. Carregar a referência pública depois da aplicação efetiva da política de rede e registrar screenshots, DOM e ações acessíveis.
2. Se necessário, o usuário disponibilizar uma sessão legítima para observar fluxos autenticados; não fornecer senhas ou tokens no chat.
3. Definir cenários comparáveis e atualizar a matriz com observações reais, preservando diferenças deliberadas de conteúdo e identidade.
4. Fazer testes auditivos e de acessibilidade assistiva em dispositivos reais. Testes automatizados de eventos de áudio não comprovam qualidade sonora ou usabilidade universal.

Esta entrega não afirma engenharia reversa completa do serviço Spotify nem equivalência global visual ou funcional.
