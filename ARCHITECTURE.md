# Arquitetura

Aplicação de página única (SPA) em React 19 + TypeScript, empacotada com Vite. Não há backend real: toda a API REST e o canal de tempo real são **simulados no navegador** pelo MSW, inclusive no deploy.

## Stack

| Área | Tecnologia |
|---|---|
| UI | React 19, CSS por tela + Tailwind 3 e shadcn/ui (Radix) em componentes compartilhados (`src/components/ui`) |
| Roteamento | TanStack Router (rotas em `src/router.tsx`, guarda de autenticação em `beforeLoad`) |
| Dados do servidor | TanStack Query (`useQuery`/`useMutation`) sobre Axios |
| API simulada | MSW 2 (Service Worker) + `socket.io` simulado sobre WebSocket interceptado |
| Tempo real | `socket.io-client`, path `/realtime` |
| Testes | Playwright (e2e + regressão visual), Lighthouse via script |

## Estrutura

```text
src/
  main.tsx            bootstrap: QueryClient -> MSW -> import dinâmico do router
  router.tsx          rotas: /, /nft/$nftId, /cart, /payment, /order/$orderId, /profile, /wallets, 404
  api/                camada cliente (único ponto que conhece HTTP/WebSocket)
    client.ts         instância Axios, token Bearer, erros tipados (ApiError)
    contracts.ts      DTOs e eventos compartilhados com o mock
    endpoints.ts      uma função por endpoint REST
    hooks.ts          queries/mutations e chaves de cache (queryKeys)
    socket.ts         conexão Socket.IO única por sessão, status e reconexão
    RealtimeBridge.tsx aplica eventos no cache do Query
  auth/               sessão, modal de login/cadastro, guarda de rotas
  mocks/              "backend" no navegador
    handlers.ts       auth, perfil, carteiras + composição dos demais handlers
    handlers/index.ts catálogo, favoritos, carrinho, cotação, pedidos, controles /api/__mock
    db.ts / seed.ts   banco em memória persistido por usuário, dados iniciais
    commerce.ts       regras de preço, estoque, pedidos e liquidação
    socketServer.ts   servidor Socket.IO simulado (nft.updated, order.updated)
    session.ts        tokens de sessão e expiração
e2e/                  specs Playwright, fixtures e helpers de checkout
scripts/lighthouse.mjs medição de performance/acessibilidade/SEO
```

## Fluxo de dados

1. `main.tsx` cria o `QueryClient` (401 global leva ao login) e chama `enableMocking()`.
2. O MSW sobe antes do router porque `engine.io-client` captura `globalThis.WebSocket` ao ser carregado; por isso nada do grafo estático de `main.tsx` pode importar `socket.ts`.
3. Telas consomem hooks de `api/hooks.ts`; os hooks chamam `api/endpoints.ts` (Axios), que o MSW intercepta.
4. Mutations usam atualização otimista com rollback (favoritos, carrinho) e invalidam as chaves afetadas.
5. O `RealtimeBridge` (carregado quando o navegador está ocioso) recebe eventos Socket.IO e atualiza o cache.

## Decisões importantes

- **Isolamento por usuário**: sessão por token; favoritos, carrinho, carteiras, pedidos e perfil são particionados por `userId`. Trocar de conta ou sair limpa o cache privado.
- **Pagamento idempotente**: `POST /api/orders` exige `Idempotency-Key`; repetir a chave (clique duplo, timeout seguido de nova tentativa) devolve o mesmo pedido, sem cobrança dupla.
- **Preço congelado**: o recibo guarda um snapshot dos valores revisados. Se o preço mudar durante o checkout (evento `nft.updated`), a confirmação é bloqueada até o usuário revisar.
- **Versões em eventos**: cada evento carrega `version` e `eventId`; eventos repetidos ou antigos são descartados.
- **Consistência após queda**: ao reconectar o socket, o REST é a fonte de verdade e as queries são revalidadas; pedidos pendentes são retomados.
- **Estados de UI**: skeletons para carregamento, mensagens com ação de repetir para erros, 404 dedicada e respeito a `prefers-reduced-motion`.
- **Busca e filtros na URL**: o catálogo é compartilhável e sobrevive a refresh (`catalogSearch.ts`).
- **Mocks em produção**: o deploy mantém `VITE_ENABLE_MOCKS=true`, pois não existe API real.

## API simulada

`GET /api/nfts`, `GET /api/nfts/:id`, `GET|PUT|DELETE /api/favorites[/:id]`, `GET /api/cart`, `POST|PATCH|DELETE /api/cart/items[/:id]`, `POST /api/cart/merge`, `POST /api/quote`, `GET|POST /api/orders`, `GET /api/orders/:id`, além de autenticação, perfil, carteiras e senha em `handlers.ts`.

Endpoints de controle (usados pelos testes e úteis para demonstrações): `/api/__mock/{reset,scenario,fail,nft/:id,order/:id/settle,socket/*,session/expire}`.

Cenários (`?mockScenario=` ou `VITE_MOCK_SCENARIO`): `default`, `slow`, `flaky`, `payment-declined`, `payment-timeout`, `payment-hold`.

## Contratos REST e eventos

Tipos em `src/api/contracts.ts`: `NftDto`, `NftListQuery`/`Response`, `CartDto`, `QuoteRequest`/`QuoteDto`, `CouponStatus`, `OrderDto`, `CreateOrderRequest` e `ApiErrorBody { code, message, fieldErrors, details }`.

Eventos Socket.IO:
- `nft.updated`: `{ eventId, nftId, version, priceEth, available }`
- `order.updated`: `{ eventId, orderId, userId, version, status }` (o servidor só entrega ao dono do pedido)

Valores monetários em ETH são calculados com precisão decimal inteira (sem somar `float`), e apresentados com ponto decimal.

## Sessão

Token Bearer com `expiresAt`, guardado em `kurio-auth-session`. Logout revoga o token (`revokedTokens`). Qualquer 401 limpa a sessão e leva ao login com retorno à rota original (`handleRejectedSession`). `/api/__mock/session/expire` força a expiração em testes.

## Carrinho

Persistido no "backend" simulado por dono: usuário autenticado ou visitante (`X-Guest-Id`). No login, `POST /api/cart/merge` une o carrinho do visitante ao da conta. Limite de 10 unidades por item; estoque é validado no servidor.

## Cache, retries e sincronização

- `staleTime` de 5 s e revalidação ao focar a janela.
- `retry` até 2 vezes, só para erros transitórios (rede, 5xx, timeout); erros 4xx não repetem.
- `keepPreviousData` na lista de NFTs e na cotação, evitando piscar ao filtrar.
- Toda query recebe `AbortSignal`: respostas obsoletas são descartadas.
- Pedido pendente faz polling a cada 4 s como rede de segurança para o socket.

## Reconciliação REST × Socket.IO

O REST é a fonte de verdade. Eventos aplicam um patch no cache apenas se `version` for maior que a já vista e o `eventId` inédito. Ao reconectar, as queries são revalidadas e pedidos pendentes retomados; se um evento se perder, o polling converge ao mesmo estado.

## Transporte do Socket.IO e limitações

O servidor roda no navegador: `@mswjs/socket.io-binding` sobre o MSW intercepta o `WebSocket` em `/realtime`. O cliente real (`socket.io-client`, `transports: ['websocket']`, reconexão de 500 ms a 4 s, token em `auth`) é o mesmo que seria usado com um servidor verdadeiro.

Limitações: o estado vive por aba (não há broadcast entre abas ou usuários reais); não há persistência fora do `localStorage`; o `WebSocket` precisa ser interceptado antes de importar `socket.io-client`.

## Decisões de UX e desvios do Figma

- Perfil e carteiras no mobile não têm frame no Figma; foram derivados do layout de pagamento (cabeçalho próprio, submenu em pílulas rolável).
- Ações fora do escopo (rodapé, "Atividade" etc.) não simulam sucesso.
- Assets: imagens de NFT são substitutas locais; ícones em `src/assets/icons/`.
- Acessibilidade: foco gerenciado em diálogos, `role="status"`/`alert` para feedback, rótulos em campos e `prefers-reduced-motion` respeitado.

## Testes e métricas

- `npm run test:e2e`: fluxos completos, falhas de pagamento, tempo real, teclado/foco, estados de erro/carregamento, regressão visual (desktop, tablet, mobile).
- `npm run lighthouse`: mede `/`, `/nft/42` e `/profile` (autenticada) em mobile e desktop, com mediana de 3 execuções; resultados em [`lighthouse/README.md`](./lighthouse/README.md).
