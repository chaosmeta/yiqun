// src/hooks/useVault.js
import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useAccount } from 'wagmi'
import { CONTRACT_ADDRESSES } from '../config/wagmi'
import { VAULT_ABI, TOKEN_ABI } from '../abi'

const vaultAddr = CONTRACT_ADDRESSES.VAULT
const tokenAddr = CONTRACT_ADDRESSES.TOKEN
const DEAD      = '0x000000000000000000000000000000000000dEaD'

// ── 全网统计（含回购代币数量）────────────────────────────────
export function useGlobalStats() {
  // 同时读取 getGlobalStats + DEAD地址的代币余额（即回购销毁的代币总量）
  const results = useReadContracts({
    contracts: [
      {
        address: vaultAddr,
        abi: VAULT_ABI,
        functionName: 'getGlobalStats',
      },
      // 代币合约还没填入时优雅降级：tokenAddr 为空则跳过
      ...(tokenAddr ? [{
        address: tokenAddr,
        abi: TOKEN_ABI,
        functionName: 'balanceOf',
        args: [DEAD],
      }] : []),
    ],
    query: { refetchInterval: 15_000 },
  })

  return {
    stats:        results.data?.[0]?.result,  // getGlobalStats 的 10 个返回值
    burnedTokens: results.data?.[1]?.result,  // DEAD 地址代币余额
    isLoading:    results.isLoading,
    refetch:      results.refetch,
  }
}

// ── 用户信息 ─────────────────────────────────────────────────
export function useUserInfo() {
  const { address } = useAccount()

  const results = useReadContracts({
    contracts: [
      {
        address: vaultAddr,
        abi: VAULT_ABI,
        functionName: 'getUserInfo',
        args: [address],
      },
      {
        address: vaultAddr,
        abi: VAULT_ABI,
        functionName: 'getLevelInfo',
        args: [address],
      },
      {
        address: vaultAddr,
        abi: VAULT_ABI,
        functionName: 'getUserPositions',
        args: [address],
      },
      ...(tokenAddr ? [{
        address: tokenAddr,
        abi: TOKEN_ABI,
        functionName: 'balanceOf',
        args: [address],
      }] : []),
    ],
    query: {
      enabled: !!address,
      refetchInterval: 15_000,
    },
  })

  const userInfo    = results.data?.[0]?.result  // [totalBalance, level, heldHours, power, pendingMain, pendingDia, totalClaimed, positionCount]
  const levelInfo   = results.data?.[1]?.result  // [level, levelName, multiplier, heldHours, nextLevelHours]
  const positions   = results.data?.[2]?.result  // [amounts[], startTimes[], heldHours[]]
  const tokenBal    = results.data?.[3]?.result

  const isRegistered = userInfo && userInfo[0] > 0n

  return {
    userInfo,
    levelInfo,
    positions,
    tokenBal,
    isRegistered,
    isLoading: results.isLoading,
    refetch:   results.refetch,
  }
}

// ── 写操作 ───────────────────────────────────────────────────
export function useVaultWrite() {
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const register            = () => writeContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'register' })
  const claim               = () => writeContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'claim' })
  const syncBalance         = () => writeContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'syncBalance' })
  const triggerDistribution = () => writeContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'triggerDistribution' })

  return {
    register, claim, syncBalance, triggerDistribution,
    hash, isPending, isConfirming, isSuccess,
  }
}
