import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

// O brilho (shimmer) está em index.css e é desligado com prefers-reduced-motion.
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('skeleton rounded-lg bg-white/10', className)} {...props} />
}
