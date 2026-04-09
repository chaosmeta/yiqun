// src/hooks/useVault.js
import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useAccount } from 'wagmi'
import { parseEther } from 'viem'
import { CONTRACT_ADDRESSES } from '../config/wagmi'
import { VAULT_ABI, TOKEN_ABI } from '../abi'

const vaultAddr = CONTRACT_ADDRESSES.VAULT
const tokenAddr = CONTRACT_ADDRESSES.TOKEN
const DEAD      = '0x000000000000000000000000000000000000dEaD'

// ── 全网统计 ─────────────────────────────────────────────────
export function useGlobalStats() {
  const results = useReadContracts({
    contracts: [
      { address: vaultAddr, abi: VAULT_ABI, functionName: 'getGlobalStats' },
      ...(tokenAddr ? [{ address: tokenAddr, abi: TOKEN_ABI, functionName: 'balanceOf', args: [DEAD] }] : []),
    ],
    query: { refetchInterval: 10_000 },
  })
  return {
    stats:        results.data?.[0]?.result,
    burnedTokens: results.data?.[1]?.result,
    isLoading:    results.isLoading,
    refetch:      results.refetch,
  }
}

// ── 用户信息 ─────────────────────────────────────────────────
export function useUserInfo() {
  const { address } = useAccount()
  const results = useReadContracts({
    contracts: [
      { address: vaultAddr, abi: VAULT_ABI, functionName: 'getUserInfo',      args: [address] },
      { address: vaultAddr, abi: VAULT_ABI, functionName: 'getLevelInfo',     args: [address] },
      { address: vaultAddr, abi: VAULT_ABI, functionName: 'getUserPositions', args: [address] },
      ...(tokenAddr ? [{ address: tokenAddr, abi: TOKEN_ABI, functionName: 'balanceOf', args: [address] }] : []),
    ],
    query: { enabled: !!address, refetchInterval: 10_000 },
  })
  return {
    userInfo:     results.data?.[0]?.result,
    levelInfo:    results.data?.[1]?.result,
    positions:    results.data?.[2]?.result,
    tokenBal:     results.data?.[3]?.result,
    isRegistered: results.data?.[0]?.result && results.data[0].result[0] > 0n,
    isLoading:    results.isLoading,
    refetch:      results.refetch,
  }
}

// ── 写操作（普通用户）────────────────────────────────────────
export function useVaultWrite() {
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const register            = () => writeContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'register' })
  const claim               = () => writeContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'claim' })
  const syncBalance         = () => writeContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'syncBalance' })
  const triggerDistribution = () => writeContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'triggerDistribution' })

  return { register, claim, syncBalance, triggerDistribution, hash, isPending, isConfirming, isSuccess }
}

// ── 写操作（Owner 管理）──────────────────────────────────────
export function useOwnerWrite() {
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const fundMain = (bnb) =>
    writeContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'fundMainPool', value: parseEther(bnb) })

  const fundDia = (bnb) =>
    writeContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'fundDiaPool', value: parseEther(bnb) })

  const buybackBurn = (bnb) =>
    writeContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'manualBuybackBurn', value: parseEther(bnb) })

  const withdraw = (wei) =>
    writeContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'emergencyWithdraw', args: [wei] })

  return { fundMain, fundDia, buybackBurn, withdraw, hash, isPending, isConfirming, isSuccess }
}
