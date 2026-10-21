import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, LogOut, Search, Trash2 } from 'lucide-react'
import CartIcon from './assets/icons/Shop.svg'
import { apiErrorMessage } from './api/client'
import type { NftDto, QuoteLine } from './api/contracts'
import { useCart, useCartActions, useNftList, useQuote } from './api/hooks'
import { formatEth } from './lib/eth'
import { Skeleton } from './components/ui/skeleton'
import { Toast } from './components/ui/toast'
import { readCouponDraft, writeCouponDraft } from './checkoutDraft'
import { relatedNftOrder } from './relatedNfts'
import SiteFooter from './SiteFooter'
import './CartPage.css'
import { useAuth } from './auth/AuthContext'

function CartPage() {
  const navigate = useNavigate()
  const auth = useAuth()
  const cart = useCart()
  const cartActions = useCartActions()
  const [recommendationPage, setRecommendationPage] = useState(1)
  const [coupon, setCoupon] = useState(readCouponDraft)
  const [appliedCoupon, setAppliedCoupon] = useState(readCouponDraft)
  const [notice, setNotice] = useState('')

  const quote = useQuote({ items: cart.items, coupon: appliedCoupon, network: 'Ethereum' }, cart.isSuccess)
  const lines: QuoteLine[] = cart.items.length === 0 ? [] : quote.data?.lines ?? []
  const itemCount = cart.count
  const couponApplied = quote.data?.couponStatus === 'valid'
  const catalog = useNftList({ pageSize: 50 })
  const recommendationStart = recommendationPage === 0 ? 5 : recommendationPage === 1 ? 0 : 3
  const recommendations = Array.from({ length: 5 }, (_, index) => {
    const id = relatedNftOrder[(recommendationStart + index) % relatedNftOrder.length]
    return catalog.data?.items.find((nft) => nft.id === id)
  }).filter((nft): nft is NftDto => nft !== undefined)
  const recommendationOffsets = [5, 0, 3]

  const changeQuantity = (line: QuoteLine, delta: number) => {
    cartActions.setQuantity.mutate({ nftId: line.nftId, quantity: line.quantity + delta }, {
      onError: (reason) => setNotice(apiErrorMessage(reason, 'Não foi possível atualizar a quantidade. O valor anterior foi restaurado.')),
    })
  }

  const removeLine = (line: QuoteLine) => {
    cartActions.remove.mutate(line.nftId, {
      onError: (reason) => setNotice(apiErrorMessage(reason, 'Não foi possível remover o item. O carrinho foi restaurado.')),
    })
  }

  const applyCoupon = () => {
    const normalized = coupon.trim().toUpperCase()
    setAppliedCoupon(normalized)
    writeCouponDraft(normalized)
    if (!normalized) setNotice('Cupom removido.')
  }

  const viewNft = (nft: NftDto) => {
    void navigate({ to: '/nft/$nftId', params: { nftId: String(nft.id) } })
  }

  const openPayment = () => {
    writeCouponDraft(couponApplied ? appliedCoupon : '')
    void navigate({ to: '/payment' })
  }

  return (
    <div className="kurio-app cart-page-app">
      <div className="cart-mobile-header">
        <Link to="/" search={{ cart: false }} hash="catalogo" aria-label="Voltar ao mercado"><ArrowLeft size={21} /></Link>
        <h1>Carrinho de NFTs</h1>
        <span aria-label={`${itemCount} itens no carrinho`}>{itemCount}</span>
      </div>
      <header className="site-header cart-site-header">
        <Link className="wordmark" to="/" search={{ cart: false }} hash="inicio" aria-label="Kurio início">KURIO</Link>
        <nav className="main-nav" aria-label="Navegação principal">
          <Link to="/" search={{ cart: false }} hash="inicio">Início</Link>
          <Link className="current" to="/" search={{ cart: false }} hash="catalogo">Mercado</Link>
          <Link to="/" search={{ cart: false }} hash="criadores">Criadores</Link>
          <Link to="/" search={{ cart: false }} hash="rodape">Aprenda</Link>
        </nav>
        <div className="header-tools">
          <Link className="cart-page-search" to="/" search={{ cart: false }} hash="catalogo" aria-label="Buscar NFTs"><Search size={20} /></Link>
          <Link className="icon-button cart-trigger" to="/cart" aria-label={`Carrinho, ${itemCount} itens`}>
            <img src={CartIcon} alt="" />
            {itemCount > 0 && <span className="cart-count">{itemCount}</span>}
          </Link>
          <button className="login-button" type="button" onClick={() => {
            if (auth.session) void auth.logout()
            else auth.openAuth()
          }}>
            <LogOut size={20} /> {auth.session ? 'Sair' : 'Entrar'}
          </button>
        </div>
      </header>

      <main className="cart-page-main">
        <section className="cart-overview" aria-label="Conteúdo do carrinho">
          <nav className="cart-breadcrumb" aria-label="Caminho da página">
            <Link to="/" search={{ cart: false }} hash="inicio">Início</Link><span>/</span>
            <Link to="/" search={{ cart: false }} hash="catalogo">Mercado</Link><span>/</span>
            <span aria-current="page">Carrinho</span>
          </nav>
          <div className="cart-layout">
            <section className="cart-table" aria-label="NFTs no carrinho">
              <div className="cart-table-header">
                <h1>NFTs <span>({itemCount})</span></h1>
                <span>Preço</span>
                <span>Edições</span>
                <span>Total</span>
                <span className="cart-remove-heading sr-only">Remover</span>
              </div>
              <div className="cart-items" aria-busy={cart.isPending || quote.isFetching}>
                {cart.isError ? (
                  <div className="cart-empty" role="alert">
                    <h2>Não foi possível carregar o carrinho</h2>
                    <p>{apiErrorMessage(cart.error)}</p>
                    <button className="button button-primary" type="button" onClick={() => void cart.refetch()}>Tentar novamente</button>
                  </div>
                ) : cart.isPending || (cart.items.length > 0 && quote.isPending) ? (
                  <div className="grid gap-3" role="status" aria-label="Carregando carrinho">
                    <Skeleton className="h-20 w-full" data-testid="cart-skeleton" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : lines.length === 0 ? (
                  <div className="cart-empty">
                    <img src={CartIcon} alt="" />
                    <h2>Seu carrinho está vazio</h2>
                    <p>Encontre uma obra especial para começar sua coleção.</p>
                    <Link className="button button-primary" to="/" search={{ cart: false }} hash="catalogo">Explorar NFTs</Link>
                  </div>
                ) : lines.map((line) => (
                  <article className="cart-item" key={line.nftId}>
                    <div className="cart-item-art">
                      <img src={line.image} alt={line.name} />
                      <div className="cart-item-copy">
                        <h2>{line.name}</h2>
                        <span className="cart-item-token">ID do token: #{String(line.nftId).padStart(4, '0')}</span>
                        <span className="cart-item-edition">Edição: {line.edition}</span>
                      </div>
                    </div>
                    <span className="cart-unit-price">{formatEth(line.unitPriceEth, 2)} ETH</span>
                    <div className="cart-quantity" aria-label={`Quantidade de ${line.name}`}>
                      <button type="button" onClick={() => changeQuantity(line, -1)} aria-label={`Diminuir quantidade de ${line.name}`}>−</button>
                      <span aria-live="polite">{line.quantity}</span>
                      <button type="button" onClick={() => changeQuantity(line, 1)} disabled={line.quantity >= Math.min(10, line.available)} aria-label={`Aumentar quantidade de ${line.name}`}>+</button>
                    </div>
                    <strong className="cart-line-total">{formatEth(line.lineTotalEth, 2)} ETH</strong>
                    <button className="cart-remove" type="button" onClick={() => removeLine(line)} aria-label={`Remover ${line.name} do carrinho`}>
                      <Trash2 size={19} />
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <aside className="cart-summary" aria-label="Resumo da carteira">
              <h2>Resumo da carteira</h2>
              {quote.data && quote.data.warnings.length > 0 && (
                <ul className="cart-warnings" role="alert">
                  {quote.data.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              )}
              <div className="cart-coupon">
                <label htmlFor="cart-coupon-input">Código promocional</label>
                <div>
                  <input
                    id="cart-coupon-input"
                    value={coupon}
                    onChange={(event) => setCoupon(event.target.value)}
                    placeholder="Digite o código promocional..."
                  />
                  <button type="button" onClick={applyCoupon}>Aplicar</button>
                </div>
                {couponApplied && <p className="cart-coupon-success">Cupom {quote.data?.coupon} aplicado.</p>}
                {quote.data && (quote.data.couponStatus === 'invalid' || quote.data.couponStatus === 'expired') && (
                  <p className="cart-coupon-error" role="alert">
                    {quote.data.couponStatus === 'expired' ? 'Este cupom expirou.' : 'Cupom inválido.'}
                  </p>
                )}
              </div>
              <div className="cart-totals">
                <p><span>Subtotal</span><b>{formatEth(quote.data?.subtotalEth ?? '0', 2)} ETH</b></p>
                <p><span>Desconto do lançamento</span><b>(-) {formatEth(quote.data?.discountEth ?? '0', 2)}</b></p>
                <p className="cart-network-fee"><span>Taxa de rede</span><b>{formatEth(quote.data?.feeEth ?? '0', 3)} ETH</b><small>Taxa estimada</small></p>
                <p className="cart-total"><span>Total</span><b>{formatEth(quote.data?.totalEth ?? '0', 3)} ETH</b></p>
              </div>
              <div className="cart-summary-actions">
                <button className="button button-primary" type="button" disabled={lines.length === 0 || quote.isFetching} onClick={openPayment}>Conectar e finalizar</button>
                <Link to="/" search={{ cart: false }} hash="catalogo">Continuar explorando</Link>
              </div>
            </aside>
          </div>
        </section>

        <section className="cart-recommendations" aria-labelledby="cart-recommendations-title">
          <h2 id="cart-recommendations-title">Colecionadores também viram</h2>
          <div className="cart-recommendation-grid">
            {recommendations.map((nft) => (
              <article className="cart-recommendation" key={nft.id}>
                <button type="button" onClick={() => viewNft(nft)} aria-label={`Ver ${nft.name}`}>
                  <img src={nft.image} alt={nft.name} />
                </button>
                <h3><button type="button" onClick={() => viewNft(nft)}>{nft.name}</button></h3>
                <strong>{formatEth(nft.priceEth, 2)} ETH</strong>
              </article>
            ))}
          </div>
          <div className="cart-recommendation-pagination" aria-label="Paginação de recomendações">
            {recommendationOffsets.map((_, index) => (
              <button
                type="button"
                key={index}
                className={recommendationPage === index ? 'active' : ''}
                aria-label={`Página ${index + 1} de recomendações`}
                aria-current={recommendationPage === index ? 'page' : undefined}
                onClick={() => setRecommendationPage(index)}
              />
            ))}
          </div>
        </section>
      </main>

      <SiteFooter onNotice={setNotice} />

      {notice && <Toast message={notice} onClose={() => setNotice('')} />}
    </div>
  )
}

export default CartPage
