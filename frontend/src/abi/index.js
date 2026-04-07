// src/abi/index.js

export const VAULT_ABI = [
  // ── View ──────────────────────────────────────────────────
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'getUserInfo',
    outputs: [
      { name: 'balance',       type: 'uint256' },
      { name: 'cappedBalance', type: 'uint256' },
      { name: 'level',         type: 'uint8'   },
      { name: 'heldHours',     type: 'uint256' },
      { name: 'power',         type: 'uint256' },
      { name: 'pendingMain',   type: 'uint256' },
      { name: 'pendingDia',    type: 'uint256' },
      { name: 'totalClaimed_', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'getLevelInfo',
    outputs: [
      { name: 'currentLevel_',  type: 'uint8'   },
      { name: 'levelName',      type: 'string'  },
      { name: 'multiplier_',    type: 'uint256' },
      { name: 'heldHours_',     type: 'uint256' },
      { name: 'nextLevelHours', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getGlobalStats',
    outputs: [
      { name: 'totalPower_',      type: 'uint256' },
      { name: 'mainPool_',        type: 'uint256' },
      { name: 'diaPool_',         type: 'uint256' },
      { name: 'totalMainDist_',   type: 'uint256' },
      { name: 'totalDiaDist_',    type: 'uint256' },
      { name: 'totalBuyback_',    type: 'uint256' },
      { name: 'activeUsers_',     type: 'uint256' },
      { name: 'nextMainDistTime', type: 'uint256' },
      { name: 'nextDiaDistTime',  type: 'uint256' },
      { name: 'contractBNB',      type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // ── Write ─────────────────────────────────────────────────
  {
    inputs: [],
    name: 'register',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'claim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'syncBalance',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'triggerDistribution',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

export const TOKEN_ABI = [
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
]
