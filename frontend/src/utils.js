// src/utils.js
import { formatUnits } from 'viem'

// ── 格式化工具 ────────────────────────────────────────────────
export const fmt = {
  bnb: (wei) => {
    if (wei == null) return '—'
    const n = parseFloat(formatUnits(BigInt(wei.toString()), 18))
    return n.toLocaleString('en', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
  },
  token: (wei) => {
    if (wei == null) return '—'
    const n = parseFloat(formatUnits(BigInt(wei.toString()), 18))
    return n.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  },
  power: (raw) => {
    if (raw == null) return '—'
    const n = parseFloat(formatUnits(BigInt(raw.toString()), 18))
    if (n >= 1e9)  return (n / 1e9).toFixed(2) + ' G'
    if (n >= 1e6)  return (n / 1e6).toFixed(2) + ' M'
    if (n >= 1e3)  return (n / 1e3).toFixed(2) + ' K'
    return n.toFixed(2)
  },
  countdown: (secs) => {
    if (secs == null) return '—'
    const s = Math.max(0, Number(secs))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  },
  heldTime: (hours) => {
    if (hours == null) return '—'
    const h = Number(hours)
    if (h < 24) return `${h} 小时`
    return `${Math.floor(h/24)} 天 ${h % 24} 小时`
  },
  addr: (a) => a ? `${a.slice(0,6)}…${a.slice(-4)}` : '—',
}

// ── 等级数据 ──────────────────────────────────────────────────
export const LEVEL_DATA = [
  { lv: 1,  name: 'Lv1 蚂蚁',   minHours: 0,   mult: 1.0 },
  { lv: 2,  name: 'Lv2 工蚁',   minHours: 24,  mult: 1.1 },
  { lv: 3,  name: 'Lv3 兵蚁',   minHours: 60,  mult: 1.2 },
  { lv: 4,  name: 'Lv4 侦察蚁', minHours: 96,  mult: 1.3 },
  { lv: 5,  name: 'Lv5 卫兵蚁', minHours: 132, mult: 1.4 },
  { lv: 6,  name: 'Lv6 队长蚁', minHours: 168, mult: 1.6 },
  { lv: 7,  name: 'Lv7 精英蚁', minHours: 228, mult: 1.8 },
  { lv: 8,  name: 'Lv8 老兵蚁', minHours: 288, mult: 2.0 },
  { lv: 9,  name: 'Lv9 长老蚁', minHours: 348, mult: 2.2 },
  { lv: 10, name: 'Lv10 蚁后',  minHours: 408, mult: 2.5 },
]

// ── 等级升级所需最低持有小时数（下标 0 = Lv1, 下标 9 = Lv10）
// UserPanel LvProgress 进度条使用
export const LEVEL_THRESHOLDS = [0, 24, 60, 96, 132, 168, 228, 288, 348, 408]
