// src/utils.js
import { formatEther } from 'viem'

export const fmt = {
  bnb: (wei) => {
    if (wei === undefined || wei === null) return '0.0000'
    return parseFloat(formatEther(BigInt(wei))).toFixed(4)
  },
  token: (wei) => {
    if (!wei) return '0'
    const n = parseFloat(formatEther(BigInt(wei)))
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
    if (n >= 1_000)     return (n / 1_000).toFixed(2) + 'K'
    return n.toFixed(2)
  },
  power: (wei) => {
    if (!wei) return '0'
    const n = parseFloat(formatEther(BigInt(wei)))
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T'
    if (n >= 1e9)  return (n / 1e9).toFixed(2) + 'B'
    if (n >= 1e6)  return (n / 1e6).toFixed(2) + 'M'
    if (n >= 1e3)  return (n / 1e3).toFixed(2) + 'K'
    return n.toFixed(2)
  },
  countdown: (seconds) => {
    if (seconds <= 0) return '即将分红!'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h}h ${m}m ${s}s`
  },
  addr: (addr) => addr ? `${addr.slice(0,6)}…${addr.slice(-4)}` : '',
}

export const LEVEL_DATA = [
  { lv: 1,  name: '散户',     hours: '0~24h',    mult: 1.0 },
  { lv: 2,  name: '铁杆',     hours: '24~60h',   mult: 1.1 },
  { lv: 3,  name: '坚守',     hours: '60~96h',   mult: 1.2 },
  { lv: 4,  name: '信仰',     hours: '96~132h',  mult: 1.3 },
  { lv: 5,  name: '长持',     hours: '132~168h', mult: 1.4 },
  { lv: 6,  name: '恒心',     hours: '168~228h', mult: 1.6 },
  { lv: 7,  name: '钻石新秀', hours: '228~288h', mult: 1.8 },
  { lv: 8,  name: '钻石手',   hours: '288~348h', mult: 2.0 },
  { lv: 9,  name: '钻石长老', hours: '348~408h', mult: 2.2 },
  { lv: 10, name: '钻石王者', hours: '408h+',    mult: 2.5 },
]

export const LEVEL_THRESHOLDS = [0, 24, 60, 96, 132, 168, 228, 288, 348, 408]
