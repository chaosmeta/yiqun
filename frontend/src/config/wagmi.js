// src/config/wagmi.js
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { bsc } from 'viem/chains'

export const wagmiConfig = getDefaultConfig({
  appName: '蚁群协议',
  // 从 https://cloud.walletconnect.com 免费获取
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
  chains: [bsc],
  ssr: false,
})

// ── 合约地址 ─────────────────────────────────────────────────
export const CONTRACT_ADDRESSES = {
  TOKEN:  '',  // 发射平台部署后填入代币合约地址
  VAULT:  '0x637c0410107041232F0037852e53E7abD3A24e24', // AntVault v6 已部署
  ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
  WBNB:   '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
}
