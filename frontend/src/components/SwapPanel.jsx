// src/components/SwapPanel.jsx
// 直接调用 PancakeSwap Router，无需跳转第三方
// 支持 BNB → DMD 买入 / DMD → BNB 卖出

import { useState, useEffect } from 'react'
import {
  useAccount, useReadContract, useWriteContract,
  useWaitForTransactionReceipt, useBalance,
} from 'wagmi'
import { parseEther, parseUnits, formatEther, formatUnits } from 'viem'
import { CONTRACT_ADDRESSES } from '../config/wagmi'

const ROUTER = CONTRACT_ADDRESSES.ROUTER
const TOKEN  = CONTRACT_ADDRESSES.TOKEN
const WBNB   = CONTRACT_ADDRESSES.WBNB

// ── ABIs ─────────────────────────────────────────────────────
const ROUTER_ABI = [
  {
    name: 'getAmountsOut', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'path', type: 'address[]' }],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'swapExactETHForTokensSupportingFeeOnTransferTokens',
    type: 'function', stateMutability: 'payable',
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'swapExactTokensForETHSupportingFeeOnTransferTokens',
    type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
]

const ERC20_ABI = [
  {
    name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
]

const SLIPPAGE_OPTIONS = [0.5, 1, 2, 3]

function applySlippage(amount, pct) {
  return (amount * BigInt(Math.floor((100 - pct) * 10))) / 1000n
}

function fmtAmt(val, decimals = 18) {
  if (!val) return '—'
  const n = parseFloat(formatUnits(val, decimals))
  if (n === 0) return '0'
  if (n < 0.0001) return '< 0.0001'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(4) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(4) + 'K'
  return n.toFixed(4)
}

export function SwapPanel() {
  const { address, isConnected } = useAccount()
  const [direction, setDirection] = useState('buy') // 'buy'=BNB→DMD  'sell'=DMD→BNB
  const [inputVal,  setInputVal]  = useState('')
  const [slippage,  setSlippage]  = useState(3)
  const [toast,     setToast]     = useState(null)

  const isBuy = direction === 'buy'
  const path  = isBuy ? [WBNB, TOKEN] : [TOKEN, WBNB]

  // ── Balances ────────────────────────────────────────────
  const { data: bnbBal, refetch: refetchBnb } = useBalance({
    address, query: { refetchInterval: 10_000 },
  })
  const { data: dmdBal, refetch: refetchDmd } = useReadContract({
    address: TOKEN, abi: ERC20_ABI, functionName: 'balanceOf',
    args: [address],
    query: { enabled: !!address, refetchInterval: 10_000 },
  })

  // ── Allowance ───────────────────────────────────────────
  const { data: allowance, refetch: refetchAllow } = useReadContract({
    address: TOKEN, abi: ERC20_ABI, functionName: 'allowance',
    args: [address, ROUTER],
    query: { enabled: !!address && !isBuy, refetchInterval: 8_000 },
  })

  // ── Quote ───────────────────────────────────────────────
  const amountInWei = (() => {
    try {
      if (!inputVal || parseFloat(inputVal) <= 0) return undefined
      return parseUnits(inputVal, 18)
    } catch { return undefined }
  })()

  const { data: amountsOut } = useReadContract({
    address: ROUTER, abi: ROUTER_ABI, functionName: 'getAmountsOut',
    args: [amountInWei, path],
    query: { enabled: !!amountInWei, refetchInterval: 5_000 },
  })

  const amountOut    = amountsOut?.[1]
  const amountOutMin = amountOut ? applySlippage(amountOut, slippage) : undefined

  // ── Approve ─────────────────────────────────────────────
  const { writeContract: doApprove, data: approveHash, isPending: approvePending } = useWriteContract()
  const { isSuccess: approveOk } = useWaitForTransactionReceipt({ hash: approveHash })
  useEffect(() => {
    if (approveOk) { refetchAllow(); showToast('授权成功，现在可以卖出 ✓', 'success') }
  }, [approveOk])

  // ── Swap ────────────────────────────────────────────────
  const { writeContract: doSwap, data: swapHash, isPending: swapPending } = useWriteContract()
  const { isLoading: swapConfirming, isSuccess: swapOk } = useWaitForTransactionReceipt({ hash: swapHash })
  useEffect(() => {
    if (swapOk) {
      showToast('兑换成功 🎉', 'success')
      setInputVal('')
      refetchBnb(); refetchDmd()
    }
  }, [swapOk])

  const needApprove = !isBuy && amountInWei && (!allowance || allowance < amountInWei)
  const isBusy      = approvePending || swapPending || swapConfirming

  const handleApprove = () =>
    doApprove({ address: TOKEN, abi: ERC20_ABI, functionName: 'approve',
      args: [ROUTER, amountInWei * 10n] })

  const handleSwap = () => {
    if (!address || !amountInWei || !amountOutMin) return
    const deadline = BigInt(Math.floor(Date.now() / 1000)) + 300n
    if (isBuy) {
      doSwap({
        address: ROUTER, abi: ROUTER_ABI,
        functionName: 'swapExactETHForTokensSupportingFeeOnTransferTokens',
        args: [amountOutMin, path, address, deadline],
        value: amountInWei,
      })
    } else {
      doSwap({
        address: ROUTER, abi: ROUTER_ABI,
        functionName: 'swapExactTokensForETHSupportingFeeOnTransferTokens',
        args: [amountInWei, amountOutMin, path, address, deadline],
      })
    }
  }

  const setMax = () => {
    if (isBuy && bnbBal) {
      const gas = parseEther('0.005')
      const max = bnbBal.value > gas ? bnbBal.value - gas : 0n
      setInputVal(formatEther(max))
    } else if (!isBuy && dmdBal) {
      setInputVal(formatUnits(dmdBal, 18))
    }
  }

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const bnbDisplay = bnbBal ? parseFloat(formatEther(bnbBal.value)).toFixed(4) : '—'
  const dmdDisplay = dmdBal ? parseFloat(formatUnits(dmdBal, 18)).toFixed(2)   : '—'

  return (
    <div className="panel swap-panel">
      <div className="panel-title"><span>🔄</span> 快速兑换 · DMD / BNB</div>
      <p className="swap-desc">直连 PancakeSwap Router，无需跳转第三方</p>

      {/* ── Buy / Sell Tabs ── */}
      <div className="swap-tabs">
        <button
          className={`swap-tab ${isBuy ? 'tab-buy active' : ''}`}
          onClick={() => { setDirection('buy'); setInputVal('') }}
        >
          📈 买入 DMD
        </button>
        <button
          className={`swap-tab ${!isBuy ? 'tab-sell active' : ''}`}
          onClick={() => { setDirection('sell'); setInputVal('') }}
        >
          📉 卖出 DMD
        </button>
      </div>

      {/* ── FROM ── */}
      <div className="swap-field">
        <div className="sf-header">
          <span className="sf-label">支付</span>
          <span className="sf-bal">
            余额 {isBuy ? bnbDisplay + ' BNB' : dmdDisplay + ' DMD'}
          </span>
        </div>
        <div className="sf-body">
          <input
            className="sf-input"
            type="number" min="0" placeholder="0.0"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            disabled={!isConnected}
          />
          <div className="sf-right">
            <button className="sf-max" onClick={setMax} disabled={!isConnected}>MAX</button>
            <div className="sf-token">
              <span>{isBuy ? '🔶' : '💎'}</span>
              <strong>{isBuy ? 'BNB' : 'DMD'}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ── Flip ── */}
      <div className="sf-flip-row">
        <button
          className="sf-flip"
          onClick={() => { setDirection(d => d === 'buy' ? 'sell' : 'buy'); setInputVal('') }}
        >⇅</button>
        <div className="sf-divider" />
      </div>

      {/* ── TO ── */}
      <div className="swap-field swap-field-out">
        <div className="sf-header">
          <span className="sf-label">获得（预估）</span>
          <span className="sf-bal">
            余额 {!isBuy ? bnbDisplay + ' BNB' : dmdDisplay + ' DMD'}
          </span>
        </div>
        <div className="sf-body">
          <div className={`sf-output ${amountOut ? 'sf-output-filled' : ''}`}>
            {amountOut ? fmtAmt(amountOut) : '—'}
          </div>
          <div className="sf-token">
            <span>{!isBuy ? '🔶' : '💎'}</span>
            <strong>{!isBuy ? 'BNB' : 'DMD'}</strong>
          </div>
        </div>
      </div>

      {/* ── Slippage ── */}
      <div className="sl-row">
        <span className="sl-label">滑点：</span>
        <div className="sl-opts">
          {SLIPPAGE_OPTIONS.map(v => (
            <button key={v}
              className={`sl-opt ${slippage === v ? 'sl-opt-active' : ''}`}
              onClick={() => setSlippage(v)}
            >{v}%</button>
          ))}
        </div>
      </div>

      {/* ── Tax tip ── */}
      <div className={`swap-tip ${slippage < 3 ? 'swap-tip-warn' : 'swap-tip-ok'}`}>
        {slippage < 3
          ? `⚠️ 代币有 3% 交易税，滑点 ${slippage}% 可能导致交易失败，建议设为 3%`
          : `✓ 已含代币 3% 交易税，滑点 ${slippage}% 推荐设置`}
      </div>

      {/* ── Quote Details ── */}
      {amountOut && (
        <div className="quote-box">
          <div className="qb-row">
            <span>最少获得</span>
            <span className="qb-val">{fmtAmt(amountOutMin)} {isBuy ? 'DMD' : 'BNB'}</span>
          </div>
          <div className="qb-row">
            <span>交易税</span>
            <span className="qb-val red">3%（自动转入 Vault 分红）</span>
          </div>
          <div className="qb-row">
            <span>路由</span>
            <span className="qb-val">PancakeSwap V2 Testnet</span>
          </div>
        </div>
      )}

      {/* ── Action ── */}
      {!isConnected ? (
        <div className="swap-unconnected">请先连接钱包</div>
      ) : needApprove ? (
        <button className="btn btn-primary sw-btn" onClick={handleApprove} disabled={isBusy || !amountInWei}>
          {approvePending ? '授权中…' : '🔓 授权 DMD（仅首次卖出需要）'}
        </button>
      ) : (
        <button className="btn btn-gold sw-btn" onClick={handleSwap}
          disabled={isBusy || !amountInWei || !amountOut}>
          {swapPending    ? '等待签名…'  :
           swapConfirming ? '链上确认中…' :
           isBuy ? '📈 确认买入 DMD' : '📉 确认卖出 DMD'}
        </button>
      )}

      {/* ── Explorer Links ── */}
      <div className="swap-links">
        <a href={`https://testnet.bscscan.com/token/${TOKEN}`} target="_blank" rel="noreferrer">
          🔍 代币合约
        </a>
        <span>·</span>
        <a href={`https://testnet.bscscan.com/address/${ROUTER}`} target="_blank" rel="noreferrer">
          🥞 PancakeSwap Router
        </a>
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}
