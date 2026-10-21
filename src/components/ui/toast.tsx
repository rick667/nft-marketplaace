import { X } from 'lucide-react'
import { useEffect } from 'react'
import { cn } from '../../lib/utils'

type ToastProps = {
  message: string
  onClose: () => void
  tone?: 'info' | 'error'
  className?: string
  duration?: number
}

export function Toast({ message, onClose, tone = 'info', className, duration = 6000 }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, duration)
    return () => window.clearTimeout(timer)
  }, [message, onClose, duration])

  return (
    <div
      className={cn('toast', tone === 'error' && 'border-red-400', className)}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="Fechar mensagem"><X size={16} /></button>
    </div>
  )
}
