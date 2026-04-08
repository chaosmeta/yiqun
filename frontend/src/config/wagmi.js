// src/config/wagmi.js
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { bsc } from 'viem/chains'

export const wagmiConfig = getDefaultConfig({
  appName: '蚁群协议',
  projectId: 'ba3f0ea97d5183fa5b2a92e2e51fd1f7',
  chains: [bsc],
  ssr: false,
})

// ── 合约地址 ─────────────────────────────────────────────────
export const CONTRACT_ADDRESSES = {
  TOKEN:  '0x3610c02fc0a39cebfd582dc9561867c49f837777', // 代币合约
  VAULT:  '0x637c0410107041232F0037852e53E7abD3A24e24', // AntVault v6
  ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
  WBNB:   '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
}
