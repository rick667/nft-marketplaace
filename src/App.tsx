import { useEffect, useState } from 'react'
import { ArrowRight, Heart, Home, LogOut, Scan, Search, SlidersHorizontal, UserRound } from 'lucide-react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { apiErrorMessage } from './api/client'
import type { NftDto, NftSort, NftTab } from './api/contracts'
import { useCart, useCartActions, useFavorites, useNftList, useNftQuery, useToggleFavorite } from './api/hooks'
import { formatEth } from './lib/eth'
import { Skeleton } from './components/ui/skeleton'
import { Toast } from './components/ui/toast'
import CartIcon from './assets/icons/Shop.svg'
import AccountIcon from './assets/icons/User.svg'
import MobileNavVector from './assets/icons/Vector.png'
import SiteFooter from './SiteFooter'
import './App.css'
import { useAuth } from './auth/AuthContext'
import { catalogPageSize, priceRange, tabLabels, type CatalogSearch } from './catalogSearch'

const heroNftIds = { primary: 42, secondary: 118 } as const
const tabOrder: NftTab[] = ['all', 'new', 'trending', 'favorites']

const categories = [
  ['Arte digital', 33],
  ['Fotografia', 12],
  ['Música', 65],
  ['Arte 3D', 39],
  ['Colecionáveis', 23],
  ['Generativa', 17],
  ['Jogos', 19],
  ['Assinaturas', 13],
  ['Utilidade', 18],
] as const

const networks = [
  ['Ethereum', 119],
  ['Polygon', 78],
  ['Solana', 86],
] as const

const journalEntries = [
  {
    title: 'Como funciona a propriedade de NFTs',
    date: '12 de setembro',
    readingTime: '6 min',
    image: '/nfts/ivory-baron.jpg',
    excerpt: 'Aprenda a colecionar, negociar e verificar ativos digitais.',
  },
  {
    title: '10 artistas digitais para acompanhar',
    date: '13 de setembro',
    readingTime: '2 min',
    image: '/nfts/emerald-ape.jpg',
    excerpt: 'Conheça criadores que moldam a cultura digital.',
  },
  {
    title: 'Raridade, atributos e procedência',
    date: '15 de setembro',
    readingTime: '3 min',
    image: '/nfts/cosmic-bloom.jpg',
    excerpt: 'Entenda raridade, procedência, direitos autorais e utilidade.',
  },
  {
    title: 'Como proteger sua carteira',
    date: '15 de setembro',
    readingTime: '2 min',
    image: '/nfts/golden-beat.jpg',
    excerpt: 'Proteja sua carteira, seus ativos e sua identidade.',
  },
]

function App() {
  const navigate = useNavigate()
  const auth = useAuth()
  const search = useSearch({ from: '/' })
  const category = search.category ?? ''
  const network = search.network ?? ''
  const maxPrice = search.maxPrice ?? priceRange.max
  const sort: NftSort = search.sort ?? 'recent'
  const activeTab: NftTab = search.tab ?? 'all'
  const currentPage = search.page ?? 1
  const [queryText, setQueryText] = useState(search.q ?? '')
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [notice, setNotice] = useState('')

  const updateSearch = (patch: Partial<CatalogSearch>, options: { keepPage?: boolean; replace?: boolean } = {}) => {
    void navigate({
      to: '/',
      replace: options.replace,
      search: (previous) => {
        const next = { ...previous, ...patch, ...(options.keepPage ? {} : { page: undefined }) }
        return Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined && value !== '')) as CatalogSearch
      },
    })
  }

  useEffect(() => {
    setQueryText(search.q ?? '')
  }, [search.q])

  useEffect(() => {
    const trimmed = queryText.trim()
    if (trimmed === (search.q ?? '')) return
    const timer = window.setTimeout(() => updateSearch({ q: trimmed || undefined }, { replace: true }), 300)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryText])

  const catalog = useNftList({
    q: search.q,
    category: category || undefined,
    network: network || undefined,
    maxPrice: search.maxPrice === undefined ? undefined : String(search.maxPrice),
    sort,
    tab: activeTab,
    page: currentPage,
    pageSize: catalogPageSize,
  })
  const favoritesQuery = useFavorites()
  const favorites = favoritesQuery.ids
  const toggleFavoriteMutation = useToggleFavorite()
  const cart = useCart()
  const cartActions = useCartActions()
  const promo = useNftQuery(heroNftIds.secondary)

  const visibleNfts = catalog.data?.items ?? []
  const pageCount = catalog.data?.totalPages ?? 1
  const itemCount = cart.count

  const addToCart = (nft: NftDto) => {
    cartActions.add.mutate({ nftId: nft.id }, {
      onSuccess: () => setNotice(`${nft.name} adicionado ao carrinho`),
      onError: (reason) => setNotice(apiErrorMessage(reason, 'Não foi possível adicionar o NFT ao carrinho.')),
    })
  }

  const toggleFavoriteFor = (id: number, favorite: boolean) => {
    toggleFavoriteMutation.mutate({ nftId: id, favorite }, {
      onError: (reason) => setNotice(apiErrorMessage(reason, 'Não foi possível atualizar seus favoritos. A alteração foi desfeita.')),
    })
  }

  const toggleFavorite = (id: number) => {
    if (!auth.session) {
      auth.openAuth({ onAuthenticated: () => toggleFavoriteFor(id, true) })
      return
    }
    toggleFavoriteFor(id, !favorites.includes(id))
  }

  const changeTab = (tab: NftTab) => {
    if (tab === 'favorites' && !auth.session) {
      auth.openAuth({ onAuthenticated: () => updateSearch({ tab: 'favorites' }) })
      return
    }
    updateSearch({ tab: tab === 'all' ? undefined : tab })
  }

  const browse = () => {
    updateSearch({ tab: undefined })
    document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' })
  }

  const viewNft = (nftId: number) => {
    void navigate({ to: '/nft/$nftId', params: { nftId: String(nftId) } })
  }

  return (
    <div className="kurio-app home-page">
      <header className="site-header">
        <a className="wordmark" href="#inicio" aria-label="Kurio início">KURIO</a>
        <nav className="main-nav" aria-label="Navegação principal">
          {['Início', 'Mercado', 'Criadores', 'Aprenda'].map((item) => (
            <a
              className={item === 'Início' ? 'current' : ''}
              href={item === 'Mercado' ? '#catalogo' : item === 'Criadores' ? '#criadores' : item === 'Aprenda' ? '#rodape' : '#inicio'}
              key={item}
            >
              {item}
            </a>
          ))}
        </nav>
        <div className="header-tools">
          <label className="header-search">
            <span className="sr-only">Buscar NFTs</span>
            <input
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
              placeholder="Buscar"
              aria-label="Buscar NFTs"
            />
            <Search size={19} aria-hidden="true" />
          </label>
          {auth.session && <Link className="icon-button" to="/profile" aria-label="Meu perfil"><UserRound size={19} /></Link>}
          <Link className="icon-button cart-trigger" to="/cart" aria-label={`Abrir carrinho, ${itemCount} itens`}>
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

      <main id="inicio">
        <div className="home-mobile-search">
          <label>
            <Search size={22} aria-hidden="true" />
            <input
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
              placeholder="Explorar coleções"
              aria-label="Explorar coleções"
            />
          </label>
          <button
            type="button"
            aria-label={mobileFiltersOpen ? 'Fechar filtros' : 'Abrir filtros'}
            aria-expanded={mobileFiltersOpen}
            onClick={() => {
              setMobileFiltersOpen((open) => !open)
              document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' })
            }}
          >
            <SlidersHorizontal size={21} aria-hidden="true" />
          </button>
        </div>

        <section className="hero-section">
          <div className="hero-copy">
            <p className="kicker">Bem-vindo à Kurio</p>
            <h1>
              <span className="hero-title-desktop">SEJA DONO DO FUTURO<br />DA ARTE DIGITAL</span>
              <span className="hero-title-mobile">SEJA DONO DA<br />CULTURA DIGITAL</span>
            </h1>
            <p className="hero-description">
              <span className="hero-description-desktop">
                Descubra NFTs selecionados de criadores emergentes e consagrados.
                Colecione arte digital rara, apoie artistas e tenha uma parte da cultura da internet.
              </span>
              <span className="hero-description-mobile">Descubra NFTs selecionados de criadores do mundo todo.</span>
            </p>
            <button className="button button-primary hero-cta" type="button" onClick={browse}>
              EXPLORAR <ArrowRight className="mobile-hero-arrow" size={16} aria-hidden="true" />
            </button>
            <div className="hero-dots" aria-label="Slide 1 de 3"><span /><span /><span /></div>
          </div>
          <button className="hero-art" type="button" onClick={() => viewNft(heroNftIds.primary)} aria-label="Ver Emerald Ape #042">
            <img src="/nfts/emerald-ape.jpg" alt="Emerald Ape com jaqueta verde e óculos" />
          </button>
          <div className="mobile-hero-art">
            <button type="button" onClick={() => viewNft(heroNftIds.primary)} aria-label="Ver Emerald Ape #042">
              <img src="/nfts/emerald-ape.jpg" alt="" />
            </button>
            <button type="button" onClick={() => viewNft(heroNftIds.secondary)} aria-label="Ver Cosmic Bloom #118">
              <img src="/nfts/cosmic-bloom.jpg" alt="" />
            </button>
          </div>
        </section>

        <section className="catalog-layout" id="catalogo">
          <aside className={`filters-column ${mobileFiltersOpen ? 'mobile-filters-open' : ''}`} aria-label="Filtros do catálogo">
            <div className="filter-card category-filter">
              <h2>Coleções</h2>
              {categories.map(([name, count]) => (
                <button
                  type="button"
                  key={name}
                  className={`filter-row ${category === name ? 'selected' : ''}`}
                  aria-pressed={category === name}
                  onClick={() => updateSearch({ category: category === name ? undefined : name })}
                >
                  <span>{name}</span><span>({count})</span>
                </button>
              ))}
              <div className="price-filter">
                <h2>Faixa de preço</h2>
                <input
                  aria-label="Preço máximo em ETH"
                  type="range"
                  min={priceRange.min}
                  max={priceRange.max}
                  step="0.01"
                  value={maxPrice}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    updateSearch({ maxPrice: value >= priceRange.max ? undefined : value }, { replace: true })
                  }}
                />
                <p>Preço: 0,02 – {maxPrice.toFixed(2).replace('.', ',')} ETH</p>
                <button className="button button-primary button-small" type="button" onClick={() => { setMobileFiltersOpen(false); browse() }}>Aplicar</button>
              </div>
              <div className="network-filter">
                <h2>Rede</h2>
                {networks.map(([name, count]) => (
                  <button
                    type="button"
                    key={name}
                    className={`filter-row ${network === name ? 'selected' : ''}`}
                    aria-pressed={network === name}
                    onClick={() => updateSearch({ network: network === name ? undefined : name })}
                  >
                    <span>{name}</span><span>({count})</span>
                  </button>
                ))}
              </div>
            </div>
            <article className="featured-promo">
              <p>NFT EM DESTAQUE</p>
              <h3>OFERTA LIMITADA</h3>
              <button type="button" onClick={() => viewNft(heroNftIds.secondary)}>
                <img src="/nfts/cosmic-bloom.jpg" alt="Cosmic Bloom, macaco de capuz violeta" />
              </button>
              <strong>{promo.data?.name ?? 'Cosmic Bloom #118'}</strong>
              <span>{promo.data ? `${formatEth(promo.data.priceEth, 2)} ETH` : '\u00A0'}</span>
            </article>
          </aside>

          <div className="catalog-main">
            <div className="catalog-toolbar">
              <button
                className="mobile-filter-toggle"
                type="button"
                aria-expanded={mobileFiltersOpen}
                onClick={() => setMobileFiltersOpen((open) => !open)}
              >
                {mobileFiltersOpen ? 'Ocultar filtros' : 'Filtros'}
              </button>
              <div className="catalog-tabs" role="tablist" aria-label="Categorias de NFTs">
                {tabOrder.map((tab) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab}
                    className={activeTab === tab ? 'active' : ''}
                    key={tab}
                    onClick={() => changeTab(tab)}
                  >
                    {tabLabels[tab]}
                  </button>
                ))}
              </div>
              <label className="sort-control">
                <span>Ordenar por:</span>
                <select value={sort} onChange={(event) => updateSearch({ sort: event.target.value === 'recent' ? undefined : event.target.value as NftSort })} aria-label="Ordenar NFTs">
                  <option value="recent">Listados recentemente</option>
                  <option value="popular">Mais populares</option>
                  <option value="price-asc">Menor preço</option>
                  <option value="price-desc">Maior preço</option>
                </select>
              </label>
            </div>

            <div className="nft-grid" aria-busy={catalog.isPending}>
              {catalog.isPending && Array.from({ length: catalogPageSize }, (_, index) => (
                <article className="nft-card" key={`skeleton-${index}`} data-testid="nft-skeleton">
                  <Skeleton className="aspect-square w-full" />
                  <Skeleton className="mt-3 h-4 w-3/4" />
                  <Skeleton className="mt-2 h-4 w-1/3" />
                </article>
              ))}
              {visibleNfts.map((nft) => (
                <article className="nft-card" key={nft.id}>
                  <button className="nft-image" type="button" onClick={() => viewNft(nft.id)} aria-label={`Ver detalhes de ${nft.name}`}>
                    <img src={nft.image} alt={nft.name} loading="lazy" />
                    <span className="edition-badge">{nft.edition}</span>
                  </button>
                  <div className="nft-card-copy">
                    <button className="nft-title" type="button" onClick={() => viewNft(nft.id)}>{nft.name}</button>
                    <button
                      type="button"
                      className={`favorite-toggle ${favorites.includes(nft.id) ? 'is-favorite' : ''}`}
                      aria-label={favorites.includes(nft.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                      aria-pressed={favorites.includes(nft.id)}
                      onClick={() => toggleFavorite(nft.id)}
                    >
                      <Heart size={16} fill={favorites.includes(nft.id) ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  <div className="nft-price-row">
                    <span>{formatEth(nft.priceEth, 2)} ETH</span>
                    <button type="button" onClick={() => addToCart(nft)} aria-label={`Adicionar ${nft.name} ao carrinho`}>+</button>
                  </div>
                </article>
              ))}
              {catalog.isError && (
                <div className="no-results" role="alert">
                  <h3>Não foi possível carregar os NFTs</h3>
                  <p>{apiErrorMessage(catalog.error)}</p>
                  <button className="button button-primary" type="button" onClick={() => void catalog.refetch()}>Tentar novamente</button>
                </div>
              )}
              {!catalog.isPending && !catalog.isError && visibleNfts.length === 0 && (
                <div className="no-results">
                  <h3>Nenhum NFT encontrado</h3>
                  <p>Altere os filtros ou limpe sua busca para ver outras obras.</p>
                  <button className="button button-primary" type="button" onClick={() => { setQueryText(''); setMobileFiltersOpen(false); void navigate({ to: '/', search: { cart: false } }) }}>Limpar filtros</button>
                </div>
              )}
            </div>
            <nav className="pagination" aria-label="Paginação do catálogo">
              <button type="button" aria-label="Página anterior" disabled={currentPage === 1} onClick={() => updateSearch({ page: currentPage - 1 > 1 ? currentPage - 1 : undefined }, { keepPage: true })}>‹</button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => (
                <button
                  className={currentPage === page ? 'selected' : ''}
                  type="button"
                  aria-current={currentPage === page ? 'page' : undefined}
                  key={page}
                  onClick={() => updateSearch({ page: page > 1 ? page : undefined }, { keepPage: true })}
                >
                  {page}
                </button>
              ))}
              <button type="button" aria-label="Próxima página" disabled={currentPage >= pageCount} onClick={() => updateSearch({ page: currentPage + 1 }, { keepPage: true })}>›</button>
            </nav>
          </div>
        </section>

        <section className="promo-banners" id="criadores">
          <article className="promo-banner">
            <img src="/nfts/emerald-ape.jpg" alt="" loading="lazy" />
            <div><h2>Lançamentos gênesis<br />de edição limitada</h2><p>Colecione edições escassas diretamente dos criadores antes da revelação pública.</p><button type="button" onClick={browse}>Explorar →</button></div>
          </article>
          <article className="promo-banner">
            <img src="/nfts/ivory-baron.jpg" alt="" loading="lazy" />
            <div><h2>Arte digital selecionada<br />e muito mais</h2><p>Explore novos artistas, coleções verificadas e obras digitais que definem a cultura.</p><button type="button" onClick={browse}>Explorar →</button></div>
          </article>
        </section>
      </main>

      <section className="journal-section" aria-labelledby="journal-title">
        <div className="journal-heading">
          <h2 id="journal-title">Diário da Cunhagem</h2>
          <p>Histórias, guias e insights para colecionadores explorarem o universo da propriedade digital.</p>
        </div>
        <div className="journal-grid">
          {journalEntries.map((entry) => (
            <article className="journal-card" key={entry.title}>
              <img src={entry.image} alt="" loading="lazy" />
              <div className="journal-card-copy">
                <p className="journal-meta">{entry.date}<span>Leitura de {entry.readingTime}</span></p>
                <h3>{entry.title}</h3>
                <p>{entry.excerpt}</p>
                <span className="journal-read-more">Ler mais →</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <SiteFooter onNotice={setNotice} />

      <nav className="mobile-nav" aria-label="Navegação mobile">
        <img className="mobile-nav-vector" src={MobileNavVector} alt="" aria-hidden="true" />
        <a className="mobile-nav-home" href="#inicio" aria-label="Início"><Home size={18} fill="currentColor" /></a>
        <button type="button" aria-label="Favoritos" onClick={() => changeTab('favorites')}>
          <Heart size={19} fill="currentColor" />
        </button>
        <button className="mobile-nav-market" type="button" aria-label="Explorar coleções" onClick={browse}>
          <Scan size={26} aria-hidden="true" />
        </button>
        <Link className="mobile-nav-cart" to="/cart" aria-label={`Carrinho, ${itemCount} itens`}>
          <img src={CartIcon} alt="" />{itemCount > 0 && <b>{itemCount}</b>}
        </Link>
        <Link
          className="mobile-nav-account"
          to="/profile"
          aria-label="Meu perfil"
        >
          <img src={AccountIcon} alt="" />
        </Link>
      </nav>

      {notice && <Toast message={notice} onClose={() => setNotice('')} />}
    </div>
  )
}

export default App
