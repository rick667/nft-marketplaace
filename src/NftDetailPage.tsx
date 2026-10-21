import { relatedNftOrder } from './relatedNfts'
import { useEffect, useState } from 'react'
import { Link, getRouteApi, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Heart, LogOut, Minus, Plus, Search, Share2, ShoppingCart, Star, UserRound } from 'lucide-react'
import CartIcon from './assets/icons/Shop.svg'
import { apiErrorMessage, apiErrorStatus } from './api/client'
import type { NftDto } from './api/contracts'
import { useCart, useCartActions, useFavorites, useNftList, useNftQuery, useToggleFavorite } from './api/hooks'
import { formatEth, multiplyEth } from './lib/eth'
import { Skeleton } from './components/ui/skeleton'
import { Toast } from './components/ui/toast'
import SiteFooter from './SiteFooter'
import './NftDetailPage.css'
import { useAuth } from './auth/AuthContext'

const route = getRouteApi('/nft/$nftId')
const editions = ['1/1', '1/10', '1/50', 'ABERTA']

function NftDetailPage() {
  const { nftId } = route.useParams()
  const query = useNftQuery(nftId)

  if (query.isPending) {
    return (
      <div className="kurio-app detail-app">
        <div className="detail-not-found" role="status" aria-live="polite" aria-busy="true">
          <p className="kicker">Carregando</p>
          <h1>Buscando este NFT…</h1>
          <Skeleton className="mx-auto mt-6 h-64 w-full max-w-md" data-testid="detail-skeleton" />
          <Skeleton className="mx-auto mt-4 h-6 w-1/2" />
        </div>
      </div>
    )
  }

  if (query.isError) {
    const notFound = apiErrorStatus(query.error) === 404
    return (
      <div className="kurio-app detail-app">
        <div className="detail-not-found" role="alert">
          <p className="kicker">{notFound ? 'Obra não encontrada' : 'Algo deu errado'}</p>
          <h1>{notFound ? 'Não encontramos este NFT.' : apiErrorMessage(query.error)}</h1>
          {!notFound && <button className="button button-outline" type="button" onClick={() => void query.refetch()}>Tentar novamente</button>}
          <Link className="button button-primary" to="/" search={{ cart: false }}>Voltar ao mercado</Link>
        </div>
      </div>
    )
  }

  return <NftDetailContent key={query.data.id} nft={query.data} />
}

function NftDetailContent({ nft }: { nft: NftDto }) {
  const navigate = useNavigate()
  const auth = useAuth()
  const [requestedQuantity, setQuantity] = useState(1)
  const cart = useCart()
  const cartActions = useCartActions()
  const cartItemCount = cart.count
  const favoritesQuery = useFavorites()
  const toggleFavoriteMutation = useToggleFavorite()
  const isFavorite = favoritesQuery.ids.includes(nft.id)
  const related = useNftList({ pageSize: 50 })
  const maxQuantity = Math.max(1, nft.maxPerOrder)
  const quantity = Math.min(requestedQuantity, maxQuantity)
  const soldOut = nft.available <= 0
  const [selectedEdition, setSelectedEdition] = useState(nft.edition)
  const [activeTab, setActiveTab] = useState<'details' | 'reviews'>('details')
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [collectionPage, setCollectionPage] = useState(0)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [nft.id])

  const collectionNfts = relatedNftOrder
    .map((id) => related.data?.items.find((item) => item.id === id))
    .filter((item): item is NftDto => item !== undefined && item.id !== nft.id)
  const collectionPages = Math.ceil(collectionNfts.length / 5)
  const visibleCollectionNfts = collectionNfts.slice(collectionPage * 5, collectionPage * 5 + 5)
  const ratingCount = Math.max(1, Math.round(nft.likes / 15))
  const galleryImages = [nft.image, nft.image, nft.image, nft.image]
  const tokenId = `#${String(nft.id).padStart(4, '0')}`

  const setFavorite = (favorite: boolean) => {
    toggleFavoriteMutation.mutate({ nftId: nft.id, favorite }, {
      onSuccess: () => setNotice(favorite ? 'NFT adicionado aos favoritos.' : 'NFT removido dos favoritos.'),
      onError: (reason) => setNotice(apiErrorMessage(reason, 'Não foi possível atualizar seus favoritos. A alteração foi desfeita.')),
    })
  }

  const toggleFavorite = () => {
    if (!auth.session) {
      auth.openAuth({ onAuthenticated: () => setFavorite(true) })
      return
    }
    setFavorite(!isFavorite)
  }

  const addNftToCart = () => {
    cartActions.add.mutate({ nftId: nft.id, quantity }, {
      onSuccess: () => setNotice(`${nft.name} adicionado ao carrinho`),
      onError: (reason) => setNotice(apiErrorMessage(reason, 'Não foi possível adicionar o NFT ao carrinho.')),
    })
  }

  const openCart = () => {
    void navigate({ to: '/cart' })
  }

  const shareNft = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setNotice('Link do NFT copiado.')
    } catch {
      setNotice('Não foi possível copiar o link neste navegador.')
    }
  }

  const viewNft = (item: NftDto) => {
    void navigate({ to: '/nft/$nftId', params: { nftId: String(item.id) } })
  }

  return (
    <div className="kurio-app detail-app">
      <header className="site-header detail-site-header">
        <Link className="wordmark" to="/" search={{ cart: false }} aria-label="Kurio início">KURIO</Link>
        <nav className="main-nav" aria-label="Navegação principal">
          <Link to="/" search={{ cart: false }}>Início</Link>
          <Link className="current" to="/" search={{ cart: false }} hash="catalogo">Mercado</Link>
          <Link to="/" search={{ cart: false }} hash="criadores">Criadores</Link>
          <Link to="/" search={{ cart: false }} hash="rodape">Aprenda</Link>
        </nav>
        <div className="header-tools">
          <Link className="detail-header-search" to="/" search={{ cart: false }} hash="catalogo" aria-label="Buscar NFTs"><Search size={20} /></Link>
          {auth.session && <Link className="icon-button" to="/profile" aria-label="Meu perfil"><UserRound size={19} /></Link>}
          <Link className="icon-button cart-trigger" to="/cart" aria-label={`Abrir carrinho, ${cartItemCount} NFTs`}>
            <img src={CartIcon} alt="" />
            {cartItemCount > 0 && <span className="cart-count">{cartItemCount}</span>}
          </Link>
          <button className="login-button" type="button" onClick={() => {
            if (auth.session) void auth.logout()
            else auth.openAuth()
          }}><LogOut size={20} /> {auth.session ? 'Sair' : 'Entrar'}</button>
        </div>
      </header>

      <main className="nft-detail-main">
        <nav className="detail-breadcrumb" aria-label="Caminho da página">
          <Link to="/" search={{ cart: false }} hash="inicio">Início</Link><span>/</span><Link to="/" search={{ cart: false }} hash="catalogo">Mercado</Link>
        </nav>

        <section className="nft-detail-overview" aria-labelledby="detail-title">
          <div className="detail-gallery">
            <div className="detail-thumbnails" aria-label="Galeria de imagens">
              {galleryImages.map((image, index) => (
                <button
                  type="button"
                  className={galleryIndex === index ? 'active' : ''}
                  key={`${image}-${index}`}
                  aria-label={`Exibir imagem ${index + 1}`}
                  aria-pressed={galleryIndex === index}
                  onClick={() => setGalleryIndex(index)}
                >
                  <img src={image} alt="" />
                </button>
              ))}
            </div>
            <div className="detail-gallery-main">
              <img src={galleryImages[galleryIndex]} alt={nft.name} />
              <button className="detail-gallery-zoom" type="button" aria-label="Ampliar imagem" onClick={() => setNotice('A visualização ampliada não está disponível nesta demonstração.')}><Search size={20} /></button>
              <button
                className={`detail-gallery-favorite ${isFavorite ? 'is-favorite' : ''}`}
                type="button"
                onClick={toggleFavorite}
                aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                aria-pressed={isFavorite}
              >
                <Heart size={20} fill={isFavorite ? 'currentColor' : 'none'} />
              </button>
            </div>
          </div>

          <div className="detail-product-copy">
            <div className="detail-title-price">
              <div className="detail-product-heading">
                <h1 id="detail-title">{nft.name}</h1>
                <span className="detail-rating-mobile" aria-label={`4.8 de 5, ${ratingCount} avaliações`}>
                  <Star size={13} fill="currentColor" aria-hidden="true" />
                  <span>4.8 ({ratingCount})</span>
                </span>
                <button
                  className={`detail-mobile-favorite ${isFavorite ? 'is-favorite' : ''}`}
                  type="button"
                  onClick={toggleFavorite}
                  aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                  aria-pressed={isFavorite}
                >
                  <Heart size={20} fill={isFavorite ? 'currentColor' : 'none'} />
                </button>
              </div>
              <div className="detail-price-rating">
                <strong>{formatEth(nft.priceEth, 2)} ETH</strong>
                <span className="detail-rating" aria-label={`${ratingCount} avaliações de colecionadores`}>
                  <span aria-hidden="true">★★★★<span className="detail-rating-empty">★</span></span> {ratingCount} avaliações de colecionadores
                </span>
              </div>
            </div>
            <div className="detail-short-description">
              <h2>Sobre este NFT:</h2>
              <p>Um colecionável digital finalizado à mão da coleção {nft.creator}, verificado na {nft.network}, com arte desbloqueável e acesso para colecionadores.</p>
              <p className="detail-short-description-mobile">
                Um colecionável digital {selectedEdition} finalizado à mão da coleção {nft.creator.replace('Studio', 'Editions')}, verificado na {nft.network}.
              </p>
            </div>
            <div className="detail-edition-selector">
              <h2>Edição:</h2>
              <div>
                {Array.from(new Set([...editions, nft.edition])).map((edition) => (
                  <button className={selectedEdition === edition ? 'selected' : ''} type="button" key={edition} onClick={() => setSelectedEdition(edition)}>{edition}</button>
                ))}
              </div>
            </div>
            <div className="detail-purchase-controls">
              <div className="detail-quantity" aria-label="Quantidade">
                <button type="button" aria-label="Diminuir quantidade" disabled={quantity <= 1} onClick={() => setQuantity((current) => Math.max(1, current - 1))}><Minus size={16} /></button>
                <span>{quantity}</span>
                <button type="button" aria-label="Aumentar quantidade" disabled={quantity >= maxQuantity} onClick={() => setQuantity((current) => Math.min(maxQuantity, current + 1))}><Plus size={16} /></button>
              </div>
              <div className="detail-actions">
                <button className="detail-buy-button" type="button" disabled={soldOut || cartActions.add.isPending} onClick={addNftToCart}>{soldOut ? 'ESGOTADO' : 'COMPRAR'}</button>
                <button className={`detail-favorite-button ${isFavorite ? 'is-favorite' : ''}`} type="button" onClick={toggleFavorite} aria-pressed={isFavorite}><Heart size={19} fill={isFavorite ? 'currentColor' : 'none'} /><span>{isFavorite ? 'Favoritado' : 'Favoritar'}</span></button>
              </div>
            </div>
            <dl className="detail-metadata">
              <div><dt>ID do token:</dt><dd>{tokenId}</dd></div>
              <div><dt>Coleção:</dt><dd>{nft.creator.replace('Studio', 'Apes')}</dd></div>
              <div><dt>Atributos:</dt><dd>Óculos, {nft.category}, Raro</dd></div>
            </dl>
            <div className="detail-share"><strong>Compartilhar este NFT:</strong><button type="button" aria-label="Copiar link do NFT" onClick={shareNft}><Share2 size={17} /></button></div>
          </div>
        </section>

        <section className="detail-information">
          <div className="detail-information-tabs" role="tablist" aria-label="Informações do NFT">
            <button type="button" role="tab" aria-selected={activeTab === 'details'} className={activeTab === 'details' ? 'selected' : ''} onClick={() => setActiveTab('details')}>Detalhes do NFT</button>
            <button type="button" role="tab" aria-selected={activeTab === 'reviews'} className={activeTab === 'reviews' ? 'selected' : ''} onClick={() => setActiveTab('reviews')}>Avaliações de colecionadores ({ratingCount})</button>
          </div>
          {activeTab === 'details' ? (
            <div className="detail-long-copy" role="tabpanel">
              <p>{nft.name} é uma obra digital {selectedEdition} finalizada à mão da coleção {nft.creator}. Cada atributo fica armazenado nos metadados do token e verificado na {nft.network}. A obra explora identidade, movimento e luz em um mundo digital sem fronteiras.</p>
              <p>A propriedade inclui a arte em alta resolução, lançamentos exclusivos para colecionadores e um registro permanente de procedência registrada na rede. O criador recebe 5% de direitos autorais nas vendas secundárias, apoiando novos trabalhos e lançamentos da comunidade.</p>
              <p><strong>Rede:</strong><br />Cunhado na {nft.network} com procedência imutável e metadados armazenados no IPFS.</p>
              <p><strong>Contrato:</strong><br />Direitos autorais do criador: 5% nas vendas secundárias, pagos pelos mercados compatíveis.</p>
              <p><strong>Direitos autorais:</strong><br />0x7A42...19E8 · Contrato inteligente ERC-721 verificado.</p>
            </div>
          ) : (
            <div className="detail-review-panel" role="tabpanel">
              <div><Star size={22} fill="currentColor" /><strong>4.8</strong><span>de 5 · {ratingCount} avaliações</span></div>
              <p>As avaliações desta coleção são dados demonstrativos e representam a experiência simulada dos colecionadores.</p>
              <button type="button" className="button button-outline" onClick={() => setNotice('Você poderá avaliar esta obra após concluir uma compra.')}>Avaliar este NFT</button>
            </div>
          )}
        </section>

        <section className="detail-collection" aria-labelledby="collection-title">
          <h2 id="collection-title">Mais desta coleção</h2>
          <div className="detail-collection-grid">
            {visibleCollectionNfts.map((item) => (
              <button type="button" className="detail-collection-card" key={item.id} onClick={() => viewNft(item)}>
                <img src={item.image} alt={item.name} />
                <span>{item.name}</span>
                <strong>{formatEth(item.priceEth, 2)} ETH</strong>
              </button>
            ))}
          </div>
          {collectionPages > 1 && (
            <div className="detail-collection-pagination" aria-label="Paginação de obras relacionadas">
              {Array.from({ length: collectionPages }, (_, pageIndex) => (
                <button
                  type="button"
                  key={pageIndex}
                  className={collectionPage === pageIndex ? 'active' : ''}
                  aria-label={`Página ${pageIndex + 1} de obras relacionadas`}
                  aria-current={collectionPage === pageIndex ? 'page' : undefined}
                  onClick={() => setCollectionPage(pageIndex)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <SiteFooter onNotice={setNotice} />

      <div className="detail-mobile-buybar">
        <div><span>Qtd.</span><div className="detail-quantity"><button type="button" aria-label="Diminuir quantidade" disabled={quantity <= 1} onClick={() => setQuantity((current) => Math.max(1, current - 1))}><Minus size={14} /></button><span>{quantity}</span>        <button type="button" aria-label="Aumentar quantidade" disabled={quantity >= maxQuantity} onClick={() => setQuantity((current) => Math.min(maxQuantity, current + 1))}><Plus size={14} /></button></div><strong>{formatEth(multiplyEth(nft.priceEth, quantity), 2)} ETH</strong></div>
                <button type="button" disabled={soldOut || cartActions.add.isPending} onClick={addNftToCart}>{soldOut ? 'Esgotado' : 'Comprar NFT'}</button>
        <button type="button" className="detail-mobile-cart" aria-label={`Ir para o carrinho, ${cartItemCount} NFTs`} onClick={openCart}>
          <ShoppingCart size={19} />
          {cartItemCount > 0 && <span className="detail-mobile-cart-count">{cartItemCount}</span>}
        </button>
      </div>

      {notice && <Toast message={notice} onClose={() => setNotice('')} />}
      <nav className="mobile-nav detail-mobile-nav" aria-label="Navegação mobile">
        <Link to="/" search={{ cart: false }} hash="inicio"><span>⌂</span>Início</Link>
        <Link to="/" search={{ cart: false }} hash="catalogo"><Search size={18} />Mercado</Link>
        <Link to="/cart"><img src={CartIcon} alt="" />Carrinho</Link>
        <button type="button" onClick={() => {
          if (auth.session) void auth.logout()
          else auth.openAuth()
        }}>{auth.session ? <LogOut size={18} /> : <UserRound size={18} />}{auth.session ? 'Sair' : 'Perfil'}</button>
      </nav>
      <button className="detail-back-mobile" type="button" onClick={() => void navigate({ to: '/', search: { cart: false }, hash: 'catalogo' })} aria-label="Voltar ao mercado"><ArrowLeft size={19} /></button>
    </div>
  )
}

export default NftDetailPage
