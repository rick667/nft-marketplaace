const decimals = 18
const scale = 10n ** BigInt(decimals)

export type EthUnits = bigint

export function parseEth(value: string): EthUnits {
  const match = /^(-?)(\d+)(?:\.(\d{1,18}))?$/.exec(value.trim())
  if (!match) throw new Error(`Valor em ETH inválido: ${value}`)
  const [, sign, whole, fraction = ''] = match
  const units = BigInt(whole) * scale + BigInt(fraction.padEnd(decimals, '0'))
  return sign ? -units : units
}

export function ethToString(units: EthUnits): string {
  const negative = units < 0n
  const absolute = negative ? -units : units
  const whole = absolute / scale
  const fraction = (absolute % scale).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

export function addEth(...values: string[]): string {
  return ethToString(values.reduce((total, value) => total + parseEth(value), 0n))
}

export function subtractEth(a: string, b: string): string {
  return ethToString(parseEth(a) - parseEth(b))
}

export function multiplyEth(value: string, quantity: number): string {
  if (!Number.isInteger(quantity)) throw new Error('A quantidade precisa ser um número inteiro.')
  return ethToString(parseEth(value) * BigInt(quantity))
}

export function percentOfEth(value: string, basisPoints: number): string {
  return ethToString(parseEth(value) * BigInt(basisPoints) / 10_000n)
}

export function compareEth(a: string, b: string): number {
  const difference = parseEth(a) - parseEth(b)
  return difference === 0n ? 0 : difference < 0n ? -1 : 1
}

export function formatEth(value: string, fractionDigits = 2): string {
  const units = parseEth(value)
  const negative = units < 0n
  const absolute = negative ? -units : units
  const factor = 10n ** BigInt(decimals - fractionDigits)
  const rounded = (absolute + factor / 2n) / factor
  const digitsScale = 10n ** BigInt(fractionDigits)
  const whole = rounded / digitsScale
  const fraction = (rounded % digitsScale).toString().padStart(fractionDigits, '0')
  return `${negative ? '-' : ''}${whole}${fractionDigits ? `.${fraction}` : ''}`
}
