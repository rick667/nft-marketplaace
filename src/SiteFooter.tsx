import type { FormEvent } from 'react'

function SiteFooter({ onNotice }: { onNotice: (message: string) => void }) {
  const submitNewsletter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onNotice('Inscrição recebida. Até breve!')
  }

  return (
    <footer className="site-footer" id="rodape">
      <div className="footer-trust">
        <article className="footer-feature">
          <span className="footer-feature-mark">W</span>
          <h3>Segurança da carteira</h3>
          <p>Proteja sua carteira e colecione arte digital verificada com confiança.</p>
        </article>
        <article className="footer-feature">
          <span className="footer-feature-mark">C</span>
          <h3>Criadores em destaque</h3>
          <p>Conheça artistas, estúdios e comunidades que moldam a cultura digital na rede.</p>
        </article>
        <article className="footer-feature">
          <span className="footer-feature-mark">D</span>
          <h3>Alertas de lançamentos</h3>
          <p>Receba calendários de cunhagem, novidades de listas de acesso e análises do mercado.</p>
        </article>
        <form className="footer-newsletter" onSubmit={submitNewsletter}>
          <h3>Antecipe-se ao próximo lançamento</h3>
          <div className="footer-newsletter-control">
            <input type="email" placeholder="digite seu e-mail..." aria-label="Digite seu e-mail" required />
            <button type="submit">Enviar</button>
          </div>
          <p>Receba lançamentos selecionados, histórias de criadores e recompensas para colecionadores diretamente na sua caixa de entrada.</p>
        </form>
      </div>
      <div className="footer-contact">
        <strong>KURIO</strong>
        <span>Feito para colecionadores,<br />criadores e curiosos.</span>
        <a href="mailto:contato@kurio.com">contato@kurio.com</a>
        <a href="tel:+551140028922">+55 11 4002 8922</a>
      </div>
      <div className="footer-links">
        <section><h3>Meu perfil</h3><span>Meu perfil</span><span>Minha coleção</span><span>Atividade</span><span>Estúdio do criador</span><span>Lista de interesse</span></section>
        <section><h3>Central de ajuda</h3><span>Central de ajuda</span><span>Como comprar NFTs</span><span>Carteira e segurança</span><span>Política do mercado</span><span>Denunciar item</span></section>
        <section><h3>Coleções</h3><span>Arte digital</span><span>Fotografia</span><span>Música</span><span>Arte 3D</span><span>Utilidade</span></section>
        <section className="footer-community">
          <div className="footer-socials">
            <h3>Redes sociais</h3>
            <div className="footer-social-icons" aria-label="Redes sociais">
              <span role="img" aria-label="Facebook">f</span>
              <span role="img" aria-label="Instagram">◎</span>
              <span role="img" aria-label="X">X</span>
              <span role="img" aria-label="LinkedIn">in</span>
              <span role="img" aria-label="YouTube">▶</span>
            </div>
          </div>
          <div className="footer-wallets">
            <h3>Carteiras compatíveis</h3>
            <span className="wallet-list">METAMASK · WALLETCONNECT · COINBASE</span>
          </div>
        </section>
      </div>
      <p className="copyright">© 2026 Kurio. Propriedade digital para todos.</p>
    </footer>
  )
}

export default SiteFooter
