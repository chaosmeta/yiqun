// src/hooks/useVault.js
import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useAccount } from 'wagmi'
import { CONTRACT_ADDRESSES } from '../config/wagmi'
import { VAULT_ABI, TOKEN_ABI } from '../abi'

const vaultAddr  = CONTRACT_ADDRESSES.VAULT
const tokenAddr  = CONTRACT_ADDRESSES.TOKEN

// ── Global stats ─────────────────────────────────────────────
export function useGlobalStats() {
  return useReadContract({
    address: vaultAddr,
    abi: VAULT_ABI,
    functionName: 'getGlobalStats',
    query: { refetchInterval: 15_000 },
  })
}

// ── User info ────────────────────────────────────────────────
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
        address: tokenAddr,
        abi: TOKEN_ABI,
        functionName: 'balanceOf',
        args: [address],
      },
    ],
    query: {
      enabled: !!address,
      refetchInterval: 15_000,
    },
  })

  const userInfo  = results.data?.[0]?.result
  const levelInfo = results.data?.[1]?.result
  const tokenBal  = results.data?.[2]?.result

  const isRegistered = userInfo && userInfo[0] > 0n

  return {
    userInfo,
    levelInfo,
    tokenBal,
    isRegistered,
    isLoading: results.isLoading,
    refetch: results.refetch,
  }
}

// ── Write actions ────────────────────────────────────────────
export function useVaultWrite() {
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const register = () =>
    writeContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'register' })

  const claim = () =>
    writeContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'claim' })

  const syncBalance = () =>
    writeContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'syncBalance' })

  const triggerDistribution = () =>
    writeContract({ address: vaultAddr, abi: VAULT_ABI, functionName: 'triggerDistribution' })

  return {
    register, claim, syncBalance, triggerDistribution,
    hash, isPending, isConfirming, isSuccess,
  }
}
