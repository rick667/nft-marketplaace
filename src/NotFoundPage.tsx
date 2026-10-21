import { Link } from '@tanstack/react-router'
import { buttonVariants } from './components/ui/button-variants'
import { cn } from './lib/utils'

export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center text-[#f5f1eb]">
      <p className="text-sm uppercase tracking-widest text-[#e39853]">Erro 404</p>
      <h1 className="text-3xl font-semibold">Página não encontrada</h1>
      <p className="text-[#cbb49c]">O endereço que você acessou não existe ou foi movido. Volte ao mercado para continuar explorando.</p>
      <Link to="/" search={{ cart: false }} className={cn(buttonVariants())}>Voltar ao mercado</Link>
    </main>
  )
}

export function RouteErrorPage({ error, reset }: { error: unknown; reset: () => void }) {
  const message = error instanceof Error ? error.message : 'Algo inesperado aconteceu.'
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center text-[#f5f1eb]" role="alert">
      <h1 className="text-3xl font-semibold">Não foi possível carregar esta página</h1>
      <p className="text-[#cbb49c]">{message}</p>
      <button type="button" className={cn(buttonVariants())} onClick={reset}>Tentar novamente</button>
    </main>
  )
}
