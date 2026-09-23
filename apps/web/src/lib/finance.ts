import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN });

export const calculateJoinAllocation = (amount: Decimal.Value) => {
  const total = new Decimal(amount || 0);
  if (!total.isFinite() || total.isNegative()) throw new RangeError('amount must be a non-negative decimal');
  const bull = total.mul('0.50');
  const spot = total.mul('0.30');
  const futures = total.minus(bull).minus(spot);
  return { total, bull, spot, futures, principalXp: total };
};

export const calculateRewardWithdrawal = (amount: Decimal.Value) => {
  const total = new Decimal(amount || 0);
  if (!total.isFinite() || total.isNegative()) throw new RangeError('amount must be a non-negative decimal');
  const fee = total.mul('0.05');
  return { amount: total, fee, receive: total.minus(fee) };
};

export const formatUsd = (value: number | string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value));

export const formatNumber = (value: number | string, maximumFractionDigits = 2) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(Number(value));
