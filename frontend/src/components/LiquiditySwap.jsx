// src/components/LiquiditySwap.jsx
import { useState, useEffect } from 'react'
import { useAccount, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, parseUnits, formatEther, formatUnits } from 'viem'
import { CONTRACT_ADDRESSES } from '../config/wagmi'

// ── ABIs (精简，只含需要的函数) ─────────────────────────────
const ROUTER_ADDRESS = '0xD99D1c33F9fC3444f8101754aBC46c52416550D1' // BSC Testnet PancakeSwap

const ROUTER_ABI = [
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amountTokenDesired', type: 'uint256' },
      { name: 'amountTokenMin', type: 'uint256' },
      { name: 'amountETHMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'addLiquidityETH',
    outputs: [
      { name: 'amountToken', type: 'uint256' },
      { name: 'amountETH', type: 'uint256' },
      { name: 'liquidity', type: 'uint256' },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'liquidity', type: 'uint256' },
      { name: 'amountTokenMin', type: 'uint256' },
      { name: 'amountETHMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'removeLiquidityETH',
    outputs: [
      { name: 'amountToken', type: 'uint256' },
      { name: 'amountETH', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactTokensForETHSupportingFeeOnTransferTokens',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactETHForTokensSupportingFeeOnTransferTokens',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    name: 'getAmountsOut',
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'WETH',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'pure',
    type: 'function',
  },
]

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
]

const PAIR_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getReserves',
    outputs: [
      { name: 'reserve0', type: 'uint112' },
      { name: 'reserve1', type: 'uint112' },
      { name: 'blockTimestampLast', type: 'uint32' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
]

// ── 读取 WETH 地址 ────────────────────────────────────────────
function useWETH() {
  return useReadContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: 'WETH',
  })
}

// ── Tab 按钮 ─────────────────────────────────────────────────
function Tab({ label, active, onClick }) {
  return (
    <button className={`ls-tab ${active ? 'active' : ''}`} onClick={onClick}>
      {label}
    </button>
  )
}

// ── 数字输入框 ───────────────────────────────────────────────
function AmountInput({ label, value, onChange, max, unit, hint }) {
  return (
    <div className="amount-input-wrap">
      <div className="ai-header">
        <span className="ai-label">{label}</span>
        {max !== undefined && (
          <button className="ai-max" onClick={() => onChange(max)}>MAX</button>
        )}
      </div>
      <div className="ai-row">
        <input
          className="ai-field"
          type="number"
          placeholder="0.0"
          value={value}
          onChange={e => onChange(e.target.value)}
          min="0"
        />
        <span className="ai-unit">{unit}</span>
      </div>
      {hint && <div className="ai-hint">{hint}</div>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  SWAP 子面板
// ════════════════════════════════════════════════════════════
function SwapPanel({ weth }) {
  const { address } = useAccount()
  const [direction, setDirection] = useState('bnb2dmd') // 'bnb2dmd' | 'dmd2bnb'
  const [amountIn, setAmountIn] = useState('')
  const [slippage, setSlippage] = useState('1')
  const [toast, setToast] = useState(null)

  const tokenAddr = CONTRACT_ADDRESSES.TOKEN

  // BNB 余额
  const { data: bnbBal } = useBalance({ address, query: { refetchInterval: 10000 } })
  // DMD 余额
  const { data: dmdBal } = useReadContract({
    address: tokenAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [address],
    query: { enabled: !!address, refetchInterval: 10000 },
  })
  // DMD allowance
  const { data: dmdAllowance, refetch: refetchAllow } = useReadContract({
    address: tokenAddr, abi: ERC20_ABI, functionName: 'allowance',
    args: [address, ROUTER_ADDRESS],
    query: { enabled: !!address && direction === 'dmd2bnb', refetchInterval: 8000 },
  })

  // 预估输出
  const path = direction === 'bnb2dmd'
    ? [weth, tokenAddr]
    : [tokenAddr, weth]

  const amountInWei = (() => {
    try { return amountIn ? parseEther(amountIn) : 0n } catch { return 0n }
  })()

  const { data: amountsOut } = useReadContract({
    address: ROUTER_ADDRESS, abi: ROUTER_ABI, functionName: 'getAmountsOut',
    args: [amountInWei, path],
    query: { enabled: !!weth && amountInWei > 0n, refetchInterval: 5000 },
  })

  const estimatedOut = amountsOut ? amountsOut[1] : 0n
  const slippagePct = parseFloat(slippage) || 1
  const minOut = estimatedOut > 0n
    ? estimatedOut * BigInt(Math.floor((100 - slippagePct) * 100)) / 10000n
    : 0n

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (isSuccess) {
      showToast('兑换成功 🎉', 'success')
      setAmountIn('')
      refetchAllow()
    }
  }, [isSuccess])

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const needApprove = direction === 'dmd2bnb'
    && dmdAllowance !== undefined
    && amountInWei > 0n
    && dmdAllowance < amountInWei

  const handleApprove = () => {
    writeContract({
      address: tokenAddr, abi: ERC20_ABI, functionName: 'approve',
      args: [ROUTER_ADDRESS, amountInWei],
    })
  }

  const handleSwap = () => {
    if (!amountIn || amountInWei === 0n) return
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300)

    if (direction === 'bnb2dmd') {
      writeContract({
        address: ROUTER_ADDRESS, abi: ROUTER_ABI,
        functionName: 'swapExactETHForTokensSupportingFeeOnTransferTokens',
        args: [minOut, path, address, deadline],
        value: amountInWei,
      })
    } else {
      writeContract({
        address: ROUTER_ADDRESS, abi: ROUTER_ABI,
        functionName: 'swapExactTokensForETHSupportingFeeOnTransferTokens',
        args: [amountInWei, minOut, path, address, deadline],
      })
    }
    if (isPending) showToast('等待签名…')
  }

  const bnbBalFmt  = bnbBal  ? parseFloat(formatEther(bnbBal.value)).toFixed(4) : '0'
  const dmdBalFmt  = dmdBal  ? parseFloat(formatEther(dmdBal)).toFixed(2) : '0'
  const estOutFmt  = estimatedOut > 0n
    ? parseFloat(formatEther(estimatedOut)).toFixed(direction === 'bnb2dmd' ? 2 : 4)
    : '—'

  return (
    <div className="sub-panel">
      {/* Direction Toggle */}
      <div className="direction-toggle">
        <button
          className={`dir-btn ${direction === 'bnb2dmd' ? 'active' : ''}`}
          onClick={() => { setDirection('bnb2dmd'); setAmountIn('') }}
        >
          BNB → DMD
        </button>
        <button
          className={`dir-btn ${direction === 'dmd2bnb' ? 'active' : ''}`}
          onClick={() => { setDirection('dmd2bnb'); setAmountIn('') }}
        >
          DMD → BNB
        </button>
      </div>

      {/* Input */}
      <AmountInput
        label={direction === 'bnb2dmd' ? '支付 BNB' : '支付 DMD'}
        value={amountIn}
        onChange={setAmountIn}
        max={direction === 'bnb2dmd' ? bnbBalFmt : dmdBalFmt}
        unit={direction === 'bnb2dmd' ? 'BNB' : 'DMD'}
        hint={`余额: ${direction === 'bnb2dmd' ? bnbBalFmt + ' BNB' : dmdBalFmt + ' DMD'}`}
      />

      {/* Arrow */}
      <div className="swap-arrow">↓</div>

      {/* Output estimate */}
      <div className="amount-input-wrap">
        <div className="ai-header"><span className="ai-label">预计获得</span></div>
        <div className="ai-row">
          <div className="ai-field ai-readonly">{estOutFmt}</div>
          <span className="ai-unit">{direction === 'bnb2dmd' ? 'DMD' : 'BNB'}</span>
        </div>
        <div className="ai-hint">滑点: {slippagePct}% · 含3%代币税</div>
      </div>

      {/* Slippage */}
      <div className="slippage-row">
        <span className="sl-label">滑点容忍</span>
        {['0.5', '1', '2', '3'].map(v => (
          <button key={v} className={`sl-btn ${slippage === v ? 'active' : ''}`} onClick={() => setSlippage(v)}>
            {v}%
          </button>
        ))}
        <input
          className="sl-custom"
          type="number" placeholder="自定义"
          value={['0.5','1','2','3'].includes(slippage) ? '' : slippage}
          onChange={e => setSlippage(e.target.value)}
        />
      </div>

      {/* Action */}
      {needApprove ? (
        <button className="btn btn-primary" onClick={handleApprove} disabled={isPending || isConfirming}>
          {isPending || isConfirming ? '处理中…' : '① 授权 DMD'}
        </button>
      ) : (
        <button className="btn btn-gold" onClick={handleSwap} disabled={isPending || isConfirming || !amountIn}>
          {isPending || isConfirming ? '处理中…' : '⚡ 立即兑换'}
        </button>
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  ADD LIQUIDITY 子面板
// ════════════════════════════════════════════════════════════
function AddLiquidityPanel({ weth, pairAddress }) {
  const { address } = useAccount()
  const [dmdAmt, setDmdAmt] = useState('')
  const [bnbAmt, setBnbAmt] = useState('')
  const [slippage, setSlippage] = useState('1')
  const [toast, setToast] = useState(null)

  const tokenAddr = CONTRACT_ADDRESSES.TOKEN

  const { data: bnbBal } = useBalance({ address, query: { refetchInterval: 10000 } })
  const { data: dmdBal } = useReadContract({
    address: tokenAddr, abi: ERC20_ABI, functionName: 'balanceOf', args: [address],
    query: { enabled: !!address, refetchInterval: 10000 },
  })
  const { data: dmdAllowance, refetch: refetchAllow } = useReadContract({
    address: tokenAddr, abi: ERC20_ABI, functionName: 'allowance',
    args: [address, ROUTER_ADDRESS],
    query: { enabled: !!address, refetchInterval: 8000 },
  })

  // 通过储备比例估算另一边数量
  const { data: reserves } = useReadContract({
    address: pairAddress, abi: PAIR_ABI, functionName: 'getReserves',
    query: { enabled: !!pairAddress, refetchInterval: 10000 },
  })

  const handleDmdChange = (val) => {
    setDmdAmt(val)
    if (reserves && val) {
      try {
        const dmdWei = parseEther(val)
        // reserve0 = DMD(token0 按地址排序), reserve1 = WETH
        // 简单估算：BNB = DMD_amount * reserve_BNB / reserve_DMD
        const [r0, r1] = reserves
        if (r0 > 0n && r1 > 0n) {
          const bnbEst = dmdWei * r1 / r0
          setBnbAmt(parseFloat(formatEther(bnbEst)).toFixed(6))
        }
      } catch {}
    }
  }

  const handleBnbChange = (val) => {
    setBnbAmt(val)
    if (reserves && val) {
      try {
        const bnbWei = parseEther(val)
        const [r0, r1] = reserves
        if (r0 > 0n && r1 > 0n) {
          const dmdEst = bnbWei * r0 / r1
          setDmdAmt(parseFloat(formatEther(dmdEst)).toFixed(2))
        }
      } catch {}
    }
  }

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (isSuccess) {
      showToast('添加流动性成功 🎉', 'success')
      setDmdAmt(''); setBnbAmt('')
      refetchAllow()
    }
  }, [isSuccess])

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const dmdWei = (() => { try { return dmdAmt ? parseEther(dmdAmt) : 0n } catch { return 0n } })()
  const bnbWei = (() => { try { return bnbAmt ? parseEther(bnbAmt) : 0n } catch { return 0n } })()
  const slippagePct = parseFloat(slippage) || 1
  const dmdMin = dmdWei > 0n ? dmdWei * BigInt(Math.floor((100 - slippagePct) * 100)) / 10000n : 0n
  const bnbMin = bnbWei > 0n ? bnbWei * BigInt(Math.floor((100 - slippagePct) * 100)) / 10000n : 0n

  const needApprove = dmdAllowance !== undefined && dmdWei > 0n && dmdAllowance < dmdWei

  const handleApprove = () => {
    writeContract({ address: tokenAddr, abi: ERC20_ABI, functionName: 'approve', args: [ROUTER_ADDRESS, dmdWei] })
  }

  const handleAdd = () => {
    if (!dmdAmt || !bnbAmt) return
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300)
    writeContract({
      address: ROUTER_ADDRESS, abi: ROUTER_ABI, functionName: 'addLiquidityETH',
      args: [tokenAddr, dmdWei, dmdMin, bnbMin, address, deadline],
      value: bnbWei,
    })
  }

  const bnbBalFmt = bnbBal ? parseFloat(formatEther(bnbBal.value)).toFixed(4) : '0'
  const dmdBalFmt = dmdBal ? parseFloat(formatEther(dmdBal)).toFixed(2) : '0'

  return (
    <div className="sub-panel">
      <div className="lp-info-box">
        📌 添加 DMD/BNB 流动性，获得 LP Token，享受交易手续费收益
      </div>

      <AmountInput
        label="DMD 数量"
        value={dmdAmt}
        onChange={handleDmdChange}
        max={dmdBalFmt}
        unit="DMD"
        hint={`余额: ${dmdBalFmt} DMD`}
      />

      <div className="plus-sign">＋</div>

      <AmountInput
        label="BNB 数量"
        value={bnbAmt}
        onChange={handleBnbChange}
        max={bnbBalFmt}
        unit="BNB"
        hint={`余额: ${bnbBalFmt} BNB`}
      />

      <div className="slippage-row">
        <span className="sl-label">滑点</span>
        {['0.5', '1', '2', '3'].map(v => (
          <button key={v} className={`sl-btn ${slippage === v ? 'active' : ''}`} onClick={() => setSlippage(v)}>
            {v}%
          </button>
        ))}
      </div>

      {needApprove ? (
        <button className="btn btn-primary" onClick={handleApprove} disabled={isPending || isConfirming}>
          {isPending || isConfirming ? '处理中…' : '① 授权 DMD'}
        </button>
      ) : (
        <button className="btn btn-green" onClick={handleAdd} disabled={isPending || isConfirming || !dmdAmt || !bnbAmt}>
          {isPending || isConfirming ? '处理中…' : '➕ 添加流动性'}
        </button>
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  REMOVE LIQUIDITY 子面板
// ════════════════════════════════════════════════════════════
function RemoveLiquidityPanel({ pairAddress }) {
  const { address } = useAccount()
  const [lpPct, setLpPct] = useState('') // 撤出百分比
  const [slippage, setSlippage] = useState('1')
  const [toast, setToast] = useState(null)

  const tokenAddr = CONTRACT_ADDRESSES.TOKEN

  const { data: lpBal } = useReadContract({
    address: pairAddress, abi: PAIR_ABI, functionName: 'balanceOf', args: [address],
    query: { enabled: !!address && !!pairAddress, refetchInterval: 10000 },
  })
  const { data: lpAllowance, refetch: refetchAllow } = useReadContract({
    address: pairAddress, abi: PAIR_ABI, functionName: 'allowance',
    args: [address, ROUTER_ADDRESS],
    query: { enabled: !!address && !!pairAddress, refetchInterval: 8000 },
  })

  const lpBalFmt = lpBal ? parseFloat(formatEther(lpBal)).toFixed(6) : '0'

  const lpAmount = (() => {
    if (!lpBal || !lpPct) return 0n
    const pct = parseFloat(lpPct)
    if (isNaN(pct) || pct <= 0 || pct > 100) return 0n
    return lpBal * BigInt(Math.floor(pct * 100)) / 10000n
  })()

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (isSuccess) {
      showToast('撤出流动性成功 ✓', 'success')
      setLpPct('')
      refetchAllow()
    }
  }, [isSuccess])

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const needApprove = lpAllowance !== undefined && lpAmount > 0n && lpAllowance < lpAmount

  const handleApprove = () => {
    writeContract({ address: pairAddress, abi: PAIR_ABI, functionName: 'approve', args: [ROUTER_ADDRESS, lpAmount] })
  }

  const handleRemove = () => {
    if (lpAmount === 0n) return
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300)
    writeContract({
      address: ROUTER_ADDRESS, abi: ROUTER_ABI, functionName: 'removeLiquidityETH',
      args: [tokenAddr, lpAmount, 0n, 0n, address, deadline],
    })
  }

  return (
    <div className="sub-panel">
      <div className="lp-balance-card">
        <div className="lp-bal-label">我的 LP Token</div>
        <div className="lp-bal-value">{lpBalFmt}</div>
        <div className="lp-bal-sub">DMD/BNB LP</div>
      </div>

      <div className="amount-input-wrap">
        <div className="ai-header">
          <span className="ai-label">撤出比例</span>
          <div className="pct-quick">
            {['25', '50', '75', '100'].map(p => (
              <button key={p} className={`pct-btn ${lpPct === p ? 'active' : ''}`} onClick={() => setLpPct(p)}>
                {p}%
              </button>
            ))}
          </div>
        </div>
        <div className="ai-row">
          <input
            className="ai-field"
            type="number" placeholder="0 ~ 100"
            value={lpPct}
            onChange={e => setLpPct(e.target.value)}
            min="0" max="100"
          />
          <span className="ai-unit">%</span>
        </div>
        <div className="ai-hint">
          撤出 LP: {lpAmount > 0n ? parseFloat(formatEther(lpAmount)).toFixed(6) : '0'}
        </div>
      </div>

      <div className="slippage-row">
        <span className="sl-label">滑点</span>
        {['0.5', '1', '2', '3'].map(v => (
          <button key={v} className={`sl-btn ${slippage === v ? 'active' : ''}`} onClick={() => setSlippage(v)}>
            {v}%
          </button>
        ))}
      </div>

      <div className="warn-box" style={{ marginBottom: 12 }}>
        ⚠️ 撤出后将收回对应比例的 DMD + BNB
      </div>

      {needApprove ? (
        <button className="btn btn-primary" onClick={handleApprove} disabled={isPending || isConfirming}>
          {isPending || isConfirming ? '处理中…' : '① 授权 LP Token'}
        </button>
      ) : (
        <button className="btn btn-red" onClick={handleRemove} disabled={isPending || isConfirming || lpAmount === 0n}>
          {isPending || isConfirming ? '处理中…' : '➖ 撤出流动性'}
        </button>
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  主组件：LiquiditySwap
// ════════════════════════════════════════════════════════════
export function LiquiditySwap({ pairAddress }) {
  const { isConnected } = useAccount()
  const [tab, setTab] = useState('swap')
  const { data: weth } = useWETH()

  if (!isConnected) {
    return (
      <div className="panel ls-panel">
        <div className="panel-title"><span>💱</span> 兑换 / 流动性</div>
        <div className="loading-box">连接钱包后可使用</div>
      </div>
    )
  }

  return (
    <div className="panel ls-panel">
      <div className="panel-title"><span>💱</span> 兑换 / 流动性</div>

      <div className="ls-tabs">
        <Tab label="⚡ 兑换"      active={tab === 'swap'}   onClick={() => setTab('swap')} />
        <Tab label="➕ 添加流动性" active={tab === 'add'}    onClick={() => setTab('add')} />
        <Tab label="➖ 撤出流动性" active={tab === 'remove'} onClick={() => setTab('remove')} />
      </div>

      {tab === 'swap'   && weth && <SwapPanel weth={weth} />}
      {tab === 'add'    && weth && <AddLiquidityPanel weth={weth} pairAddress={pairAddress} />}
      {tab === 'remove' && <RemoveLiquidityPanel pairAddress={pairAddress} />}
    </div>
  )
}
