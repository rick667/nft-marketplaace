import { useEffect, useState } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { apiErrorMessage, apiErrorStatus } from './api/client'
import { useOrderQuery } from './api/hooks'
import { formatEth } from './lib/eth'
import PaymentPage from './PaymentPage'
import './OrderPage.css'

const route = getRouteApi('/order/$orderId')

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

function OrderPage() {
  const { orderId } = route.useParams()
  const queryClient = useQueryClient()
  const orderQuery = useOrderQuery(orderId)
  const order = orderQuery.data
  const [explorerNotice, setExplorerNotice] = useState(false)
  const status = order?.status

  useEffect(() => {
    if (status && status !== 'pending') {
      void queryClient.invalidateQueries({ queryKey: ['cart'] })
      void queryClient.invalidateQueries({ queryKey: ['nfts'] })
    }
  }, [status, queryClient])

  if (orderQuery.isPending) {
    return (
      <main className="order-not-found" aria-busy="true">
        <h1>Carregando pedido…</h1>
      </main>
    )
  }

  if (!order) {
    const notFound = apiErrorStatus(orderQuery.error) === 404
    return (
      <main className="order-not-found">
        <h1>{notFound ? 'Pedido não encontrado' : 'Não foi possível carregar o pedido'}</h1>
        <p>{notFound ? 'Não encontramos esta transação na sua conta.' : apiErrorMessage(orderQuery.error)}</p>
        {!notFound && <button className="button button-primary" type="button" onClick={() => void orderQuery.refetch()}>Tentar novamente</button>}
        <Link className="button button-primary" to="/cart">Voltar ao carrinho</Link>
      </main>
    )
  }

  return (
    <main className="order-page">
      <div className="order-background" aria-hidden="true" inert>
        <PaymentPage backgroundOrder={order} />
      </div>
      <div className="order-backdrop" />
      <section className={`order-receipt order-status-${order.status}`} aria-live="polite">
        <header className="order-receipt-header">
          <Link className="order-close" to="/cart" aria-label="Voltar ao carrinho">
            <X size={19} />
          </Link>
          <div className={`order-status-icon ${order.status}`}>
            {order.status === 'confirmed' ? <Check size={32} /> : order.status === 'declined' ? <X size={31} /> : <span className="order-spinner" />}
          </div>
          {order.status !== 'confirmed' && (
            <p className="order-eyebrow">
              {order.status === 'declined' ? 'Pedido recusado' : 'Pedido pendente'}
            </p>
          )}
          <h1>
            {order.status === 'confirmed'
              ? 'Seus NFTs agora estão na sua carteira'
              : order.status === 'declined'
                ? 'A transação não foi concluída'
                : 'Aguardando confirmação da carteira'}
          </h1>
          {order.status !== 'confirmed' && <p className="order-number">Pedido {order.id}</p>}
        </header>

        <div className="order-metadata">
          <div><span>ID da transação</span><strong>{order.status === 'confirmed' ? order.transactionId.slice(0, 8) + '…' + order.transactionId.slice(-4) : 'Aguardando envio'}</strong></div>
          <div><span>Data</span><strong>{formatDate(order.createdAt)}</strong></div>
          <div><span>Total</span><strong>{formatEth(order.totalEth, 3)} ETH</strong></div>
          <div><span>Carteira</span><strong>{order.wallet.provider}</strong></div>
        </div>

        <section className="order-lines-section">
          <h2>Detalhes da transação</h2>
          <div className="order-lines-heading"><strong>NFTs</strong><strong>Edições</strong><strong>Subtotal</strong></div>
          <div className="order-lines">
            {order.lines.map((line) => (
              <article className="order-line" key={line.nftId}>
                <div className="order-line-info">
                  <img src={line.image} alt={line.name} />
                  <div><h3>{line.name}</h3><span>ID do token: {line.tokenId}</span></div>
                </div>
                <div className="order-line-amounts">
                  <span className="order-line-quantity">(x {line.quantity})</span>
                  <strong>{formatEth(line.lineTotalEth, 2)} ETH</strong>
                </div>
              </article>
            ))}
          </div>
          <div className="order-totals">
            <p><span>Subtotal</span><strong>{formatEth(order.subtotalEth, 2)} ETH</strong></p>
            {Number(order.discountEth) > 0 && <p><span>Desconto {order.coupon}</span><strong>−{formatEth(order.discountEth, 2)} ETH</strong></p>}
            <p><span>Taxa de rede</span><strong>{formatEth(order.feeEth, 3)} ETH</strong></p>
            <p className="order-total"><span>Total</span><strong>{formatEth(order.totalEth, 3)} ETH</strong></p>
          </div>
          <div className="order-details-divider" />
          <footer className="order-receipt-footer">
            <p>
              {order.status === 'confirmed'
                ? `Transação confirmada na rede ${order.collector.network}. A titularidade foi transferida para sua carteira conectada. Os valores acima são o snapshot do pedido.`
                : order.status === 'declined'
                  ? `${order.failureReason} Seus itens continuam no carrinho, sem alterações.`
                  : 'O pedido está registrado na sua conta. Atualizar a página não o envia novamente;                   você pode aguardar a confirmação, que chega em tempo real.'}
                              </p>
                              {order.status === 'pending' ? (
                                <p className="order-pending-note" role="status">Aguardando a confirmação da rede…</p>
                              ) : order.status === 'confirmed' ? (
              <>
                <button className="button button-primary order-explorer-button" type="button" onClick={() => setExplorerNotice(true)}>
                  Ver no Etherscan
                </button>
                {explorerNotice && <span className="order-explorer-note">Link simulado. Nenhuma blockchain foi consultada.</span>}
              </>
            ) : (
              <Link className="button button-primary order-retry-button" to="/cart">Voltar ao carrinho e tentar novamente</Link>
            )}
          </footer>
        </section>
      </section>
    </main>
  )
}

export default OrderPage
