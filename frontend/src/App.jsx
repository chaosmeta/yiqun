// src/App.jsx
import { useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { GlobalStats } from './components/GlobalStats'
import { UserPanel }   from './components/UserPanel'
import { LevelTable }  from './components/LevelTable'
import { FeePanel }    from './components/FeePanel'
import { SwapPanel }   from './components/SwapPanel'

const TABS = [
  { id: 'dashboard', label: '📊 总览' },
  { id: 'swap',      label: '🔄 兑换' },
]

export default function App() {
  const [tab, setTab] = useState('dashboard')

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-gem">💎</span>
            <span className="logo-text">DIAMOND</span>
          </div>
          <div className="network-badge">
            <span className="net-dot" />
            BSC TESTNET
          </div>
          <ConnectButton chainStatus="icon" showBalance={false} accountStatus="avatar" />
        </div>
        <div className="nav-tabs">
          <div className="nav-tabs-inner">
            {TABS.map(t => (
              <button
                key={t.id}
                className={`nav-tab ${tab === t.id ? 'nav-tab-active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {tab === 'dashboard' && (
        <div className="hero">
          <h1 className="hero-title">钻石手的福音</h1>
          <p className="hero-sub">持币越久 · 算力越强 · 分红越多 · <em>卖出清零</em></p>
        </div>
      )}
      {tab === 'swap' && (
        <div className="hero hero-sm">
          <h2 className="hero-title" style={{fontSize:'clamp(1.4rem,3vw,2rem)'}}>快速兑换</h2>
          <p className="hero-sub">直连 PancakeSwap，专属 DMD / BNB 兑换通道</p>
        </div>
      )}

      <main className="container">
        {tab === 'dashboard' && (
          <>
            <GlobalStats />
            <div className="main-grid">
              <UserPanel />
              <LevelTable />
            </div>
            <FeePanel />
          </>
        )}
        {tab === 'swap' && (
          <div className="swap-page">
            <SwapPanel />
            <div className="swap-side">
              <FeePanel />
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        💎 Diamond Protocol · BSC Testnet · 拿不住的人，给拿得住的人打工
      </footer>
    </div>
  )
}
