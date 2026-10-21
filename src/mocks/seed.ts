export type NFT = {
  id: number
  name: string
  image: string
  price: number
  category: string
  edition: string
  network: 'Ethereum' | 'Polygon' | 'Solana'
  creator: string
  likes: number
}

export const nfts: NFT[] = [
  { id: 42, name: 'Emerald Ape #042', image: '/nfts/emerald-ape.jpg', price: 1.19, category: 'Arte digital', edition: '1/50', network: 'Ethereum', creator: 'Kurio Studio', likes: 286 },
  { id: 118, name: 'Cosmic Bloom #118', image: '/nfts/cosmic-bloom.jpg', price: 1.29, category: 'Arte digital', edition: '1/10', network: 'Polygon', creator: 'Luna Works', likes: 174 },
  { id: 552, name: 'Neon Vessel #552', image: '/nfts/ivory-baron.jpg', price: 1.99, category: 'Arte 3D', edition: '1/5', network: 'Ethereum', creator: 'Nox Atelier', likes: 329 },
  { id: 314, name: 'Violet Nomad #314', image: '/nfts/violet-nomad.jpg', price: 1.39, category: 'Colecionáveis', edition: '1/12', network: 'Polygon', creator: 'Mira & Co.', likes: 143 },
  { id: 88, name: 'Ivory Baron #088', image: '/nfts/ivory-baron.jpg', price: 1.79, category: 'Arte digital', edition: '1/8', network: 'Ethereum', creator: 'Nox Atelier', likes: 218 },
  { id: 207, name: 'Golden Beat #207', image: '/nfts/golden-beat.jpg', price: 0.99, category: 'Música', edition: '1/20', network: 'Solana', creator: 'Golden Hour', likes: 95 },
  { id: 160, name: 'Golden Signal #160', image: '/nfts/golden-signal.jpg', price: 0.39, category: 'Arte digital', edition: '1/25', network: 'Polygon', creator: 'Golden Hour', likes: 412 },
  { id: 9, name: 'Sage Nomad #009', image: '/nfts/cosmic-bloom.jpg', price: 1.69, category: 'Fotografia', edition: '1/7', network: 'Ethereum', creator: 'Mira & Co.', likes: 127 },
  { id: 73, name: 'Jade Oracle #073', image: '/nfts/emerald-ape.jpg', price: 2.29, category: 'Generativa', edition: '1/3', network: 'Solana', creator: 'Kurio Studio', likes: 302 },
]

export const curatedOrder = [42, 9, 552, 118, 314, 88, 207, 160, 73]
export const newReleaseOrder = [160, 207, 73, 88, 314, 118, 552, 9, 42]
export const relatedNftOrder = [118, 314, 88, 207, 160, 552, 9, 73]
