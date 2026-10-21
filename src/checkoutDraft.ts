import { privateStorageKey, readAuthSession } from './auth/auth'
import { getGuestId } from './api/client'

// Rascunho de interface do checkout: o cupom digitado fica isolado por usuário (ou visitante).
function couponKey(): string {
  const userId = readAuthSession()?.user.id
  return userId ? privateStorageKey(userId, 'checkout-coupon') : `kurio:guest:${getGuestId()}:checkout-coupon`
}

export function readCouponDraft(): string {
  try {
    return localStorage.getItem(couponKey()) ?? ''
  } catch {
    return ''
  }
}

export function writeCouponDraft(coupon: string): void {
  try {
    if (coupon) localStorage.setItem(couponKey(), coupon)
    else localStorage.removeItem(couponKey())
  } catch {
    // Sem armazenamento disponível o cupom vale apenas nesta tela.
  }
}
