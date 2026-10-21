import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e39853] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-[#e39853] text-[#120c09] hover:bg-[#f0a867]',
        outline: 'border border-[#e39853] text-[#f5f1eb] hover:bg-[#e39853]/10',
        ghost: 'text-[#f5f1eb] hover:bg-white/10',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
)
