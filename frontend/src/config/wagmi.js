// src/config/wagmi.js
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { bsc } from 'viem/chains'

export const wagmiConfig = getDefaultConfig({
  appName: 'Diamond Protocol',
  // 从 https://cloud.walletconnect.com 免费获取
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
  chains: [bsc],
  ssr: false,
})

// ── 合约地址（部署后填入）─────────────────────────────────
export const CONTRACT_ADDRESSES = {
  TOKEN:  '', // 部署后填入 DiamondToken 合约地址
  VAULT:  '', // 部署后填入 DiamondVault 合约地址
  PAIR:   '', // 部署后填入 PancakeSwap LP Pair 地址（Token合约的 pancakePair()）
  // BSC Mainnet PancakeSwap Router v2
  ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
  // WBNB on BSC Mainnet
  WBNB:   '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
}
