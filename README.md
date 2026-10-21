# Kurio — NFT Marketplace

Marketplace de NFTs em React + TypeScript, com interface alinhada ao protótipo Kurio do Figma. Inclui catálogo, filtros, detalhe da obra, autenticação, favoritos, carrinho, checkout com pedidos e atualizações em tempo real. O backend é totalmente simulado no navegador (MSW + Socket.IO simulado). Veja [ARCHITECTURE.md](./ARCHITECTURE.md) para a estrutura e as decisões técnicas.

## Requisitos

- Node.js 20+
- npm 9+

## Passo a passo para rodar localmente

1. Abra o terminal na pasta do projeto (`jungle-nft-marketplace`).

2. Instale as dependências:

```bash
npm install
```

3. (Opcional) Copie as variáveis de ambiente: `cp .env.example .env` (no Windows: `Copy-Item .env.example .env`). Os valores padrão já funcionam.

4. Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

5. Acesse no navegador:

```text
http://localhost:5173
```

Se a porta 5173 estiver ocupada, o Vite exibirá o endereço correto no terminal.

### Credenciais de demonstração

| Usuário | E-mail | Senha |
|---|---|---|
| Principal | `demo@kurio.app` | `KurioDemo123!` |
| Segundo (testa isolamento de dados) | `outro@kurio.app` | `KurioDemo123!` |

Também é possível criar uma conta nova. Cupom válido: `KURIO10` (10%); `KURIO-OLD` está expirado.

### Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `VITE_ENABLE_MOCKS` | `true` | Liga a API simulada. Mantenha `true` também em produção. |
| `VITE_MOCK_SCENARIO` | `default` | `default`, `slow`, `flaky`, `payment-declined`, `payment-timeout`, `payment-hold`. Também aceito na URL: `?mockScenario=slow`. |

### Controles do mock

A API simulada expõe, no próprio navegador, endpoints de controle (`POST /api/__mock/...`): `reset`, `scenario`, `fail` (falhas programadas por prefixo/método/status), `nft/:id` (altera preço/disponibilidade e emite evento), `order/:id/settle`, `socket/{disconnect,reconnect,drop,emit,status}` e `session/expire`. Os testes e2e os usam; veja `e2e/fixtures.ts`.

**Reset:** `POST /api/__mock/reset` restaura o banco, o cenário e o socket; limpar `localStorage` (`kurio-mock-db`) tem o mesmo efeito.

**Reproduzir fluxos de falha** (abra o site com o parâmetro e refaça o checkout):

| Fluxo | Como reproduzir |
|---|---|
| API lenta / skeletons | `/?mockScenario=slow` |
| Erros transitórios e retry | `/?mockScenario=flaky` |
| Pagamento recusado | `/?mockScenario=payment-declined` |
| Timeout de pagamento (retomada idempotente) | `/?mockScenario=payment-timeout` |
| Pedido pendente (aguardando liquidação) | `/?mockScenario=payment-hold` |
| Sessão expirada | `POST /api/__mock/session/expire` |
| Queda do socket | `POST /api/__mock/socket/disconnect` e depois `socket/reconnect` |
| Preço muda no checkout | `POST /api/__mock/nft/42` com novo preço |

## Como testar o projeto

| Comando | O que faz |
|---|---|
| `npm run typecheck` | Verificação de tipos (`tsc -b`) |
| `npm run lint` | Lint com oxlint |
| `npm run build` | Typecheck + build de produção |
| `npm run preview` | Serve o build em `http://localhost:4173` |
| `npm run test:e2e` | Testes Playwright (gera o build e sobe o preview sozinho) |
| `npm run test:e2e:update` | Regrava as imagens-base da regressão visual |
| `npm run test:e2e:report` | Abre o relatório HTML do Playwright |
| `npm run lighthouse` | Build + Lighthouse (3 execuções por página); resultados em [lighthouse/README.md](./lighthouse/README.md) |

Na primeira vez, instale o navegador do Playwright: `npx playwright install chromium`.

**Contra o deploy publicado** (sem build nem servidor local):

```powershell
$env:E2E_BASE_URL = "https://jungle-nft-marketplace-plum.vercel.app"; npm run test:e2e
$env:LH_URL = "https://jungle-nft-marketplace-plum.vercel.app"; npm run lighthouse   # saída em lighthouse/producao
```

Os testes de regressão visual comparam com imagens geradas localmente; diferenças mínimas de renderização contra o deploy devem ser avaliadas com o relatório HTML.

A suíte e2e cobre catálogo/busca/filtros, detalhe, autenticação e isolamento entre usuários, favoritos, carrinho, compra, falhas de pagamento (recusa, clique repetido, timeout com idempotência, pedido pendente), perfil e carteiras, tempo real (queda e retomada do socket), navegação por teclado, estados de carregamento/erro e regressão visual em desktop, tablet e celular.

1. Abra o catálogo pelo botão **Explorar** ou pela navegação **Mercado**.
2. Clique em **Entrar** para abrir o modal. Crie uma conta com e-mail fictício e senha de pelo menos 8 caracteres, ou entre com as mesmas credenciais depois de sair.
3. Teste a confirmação de senha, a mensagem de senha incorreta e o conflito de e-mail ao tentar cadastrar uma conta já existente.
4. Atualize a página para conferir a recuperação da sessão. **Sair** encerra a sessão e limpa o cache de consultas privado.
5. Abra **Meu perfil** pelo ícone de usuário no cabeçalho. Edite nome, usuário, e-mail, ENS e apelido da carteira; carregue ou remova o avatar e salve. Atualize a página para conferir a persistência.
6. Acesse **Carteiras** pelo menu lateral. Cadastre ou atualize os dados da carteira principal e, se desejar, adicione uma secundária; use a opção de repetir os dados da principal e teste a validação de endereços. Atualize a página e confirme que as carteiras continuam disponíveis.
7. Em **Alterar senha**, informe a senha atual, uma nova senha com pelo menos 8 caracteres e sua confirmação. Uma senha atual incorreta deve ser rejeitada; depois da alteração, entre com a nova senha.
8. Pesquise pelo nome de uma obra, use os filtros, altere as categorias do catálogo e navegue entre as páginas de resultados.
9. Tente favoritar uma obra ou abrir **Favoritos** sem sessão; depois de autenticar, a ação solicitada deve continuar. Os favoritos são separados por conta.
10. Abra um NFT para conferir a rota de detalhes, selecionar uma edição, ajustar a quantidade, consultar as avaliações e navegar por outras obras.
11. Adicione um NFT pelo catálogo ou compre-o pela página de detalhes; confira o conteúdo em **/cart**.
12. Na página do carrinho, altere quantidades, remova itens, teste o cupom `KURIO10` e avance para **/payment**. Sem sessão, o login é solicitado e o checkout é retomado depois da autenticação.
13. No pagamento, confira as carteiras salvas em **Carteiras**, preencha os dados obrigatórios, conecte uma carteira simulada, selecione a rede, revise os valores e envie o pedido.
14. Na confirmação, conclua a transação simulada ou simule uma recusa; atualize a tela pendente para verificar a recuperação.
15. Confira no recibo confirmado que os valores foram congelados no snapshot e que somente as quantidades compradas saíram do carrinho.
16. No celular, abra **Filtros** no catálogo, confira a barra fixa de compra na página de detalhes e os controles fixos do carrinho/pagamento; confira também a navegação e os formulários responsivos em **/profile** e **/wallets**.
17. Atualize a página para verificar a persistência local de carrinho, sessão, perfil, avatar, carteiras e pedidos pendentes.

A autenticação e a edição de perfil usam endpoints REST simulados pelo MSW e consumidos via Axios. Cadastro, login, perfil, troca de senha e sessão são locais; senhas são armazenadas somente como hashes PBKDF2 com salt, e nenhuma conexão real, pagamento ou transação blockchain é realizada. Os dados de conta e os dados privados do colecionador ficam separados por usuário no `localStorage`. Pedidos pendentes e recibos também são separados por usuário e usam snapshots dos valores apresentados na revisão.

## Fluxo de trabalho recomendado

- Desenvolver/ajustar a interface com `npm run dev -- --host`
- Validar qualidade com `npm run lint`
- Garantir que o build gere corretamente com `npm run build`
- Caso queira testar a versão final, use `npm run preview -- --host`

## Observações

- Os dados de demonstração do catálogo ficam em `src/mocks/seed.ts`; a API simulada persiste carrinho, favoritos, perfil, carteiras e pedidos por conta no `localStorage` deste navegador.
- As imagens das obras estão em `public/nfts/` e os ícones usados pela interface em `src/assets/icons/`.
- Deploy na Vercel: https://jungle-nft-marketplace-plum.vercel.app. O `vercel.json` define o rewrite SPA e os cabeçalhos do `mockServiceWorker.js`. Para publicar: `npx vercel login` e `npx vercel --prod`, mantendo `VITE_ENABLE_MOCKS=true` (não há API real).
