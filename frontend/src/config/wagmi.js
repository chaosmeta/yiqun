// src/config/wagmi.js
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { defineChain } from 'viem'

// BSC Testnet
export const bscTestnet = defineChain({
  id: 97,
  name: 'BSC Testnet',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://data-seed-prebsc-1-s1.binance.org:8545/'] },
  },
  blockExplorers: {
    default: { name: 'BscScan Testnet', url: 'https://testnet.bscscan.com' },
  },
  testnet: true,
})

export const wagmiConfig = getDefaultConfig({
  appName: 'Diamond Protocol',
  // 替换为你自己的 WalletConnect Project ID（https://cloud.walletconnect.com）
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
  chains: [bscTestnet],
  ssr: false,
})

// ── 合约地址 ─────────────────────────────────────────────
export const CONTRACT_ADDRESSES = {
  TOKEN:  '0x16A5dfe587bF18FD16ED3c019cF30aDED54233D5',
  VAULT:  '0xAFc74480E4fC591ab592337Ab2BdB88cc9d1e294',
  // BSC Testnet PancakeSwap Router v2
  ROUTER: '0xD99D1c33F9fC3444f8101754aBC46c52416550D1',
  // WBNB on BSC Testnet
  WBNB:   '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
}
