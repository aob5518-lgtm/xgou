import { createDatabaseClient } from '../src/index.js';
import { SYSTEM_CONFIG_DEFAULTS } from '@xgou/shared';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const db = createDatabaseClient(databaseUrl);

const walletFor = (index: number): string => `0x${index.toString(16).padStart(40, '0')}`;

const seed = async (): Promise<void> => {
  await db.systemConfigVersion.upsert({
    where: { version: 1 },
    create: {
      version: 1,
      values: {
        minReferralQualification: '100',
        maxReferralDepth: 30,
        xpPerDollar: '1',
        dynamicXpPercent: '0.01',
      },
      effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
      createdBy: 'system-seed',
    },
    update: {},
  });
  await db.systemConfigVersion.upsert({
    where: { version: 2 },
    create: {
      version: 2,
      values: SYSTEM_CONFIG_DEFAULTS,
      effectiveAt: new Date('2026-09-22T00:00:00.000Z'),
      createdBy: 'system-seed-phase2a',
    },
    update: {},
  });

  for (const asset of ['USDC', 'USDT']) {
    const accountDefinitions = [
      { code: `deposit-clearing:${asset}`, type: 'DEPOSIT_CLEARING' as const, fundDomain: null },
      { code: `bull-vault:${asset}`, type: 'BULL_VAULT' as const, fundDomain: 'BULL' as const },
      { code: `spot-treasury:${asset}`, type: 'SPOT_TREASURY' as const, fundDomain: 'SPOT' as const },
      { code: `futures-treasury:${asset}`, type: 'FUTURES_TREASURY' as const, fundDomain: 'FUTURES' as const },
      { code: `reward-vault:${asset}`, type: 'REWARD_VAULT' as const, fundDomain: 'REWARD' as const },
      { code: `withdrawal-buffer:${asset}`, type: 'WITHDRAWAL_BUFFER' as const, fundDomain: 'WITHDRAWAL' as const },
      { code: `ecosystem-fund:${asset}`, type: 'ECOSYSTEM_FUND' as const, fundDomain: 'ECOSYSTEM' as const },
      { code: `platform-treasury:${asset}`, type: 'PLATFORM_TREASURY' as const, fundDomain: 'PLATFORM' as const },
      { code: `fee-expense:${asset}`, type: 'FEE_EXPENSE' as const, fundDomain: null },
      { code: `trading-pnl:${asset}`, type: 'TRADING_PNL' as const, fundDomain: null },
      { code: `funding-expense:${asset}`, type: 'FUNDING_EXPENSE' as const, fundDomain: null },
    ];
    const accounts = new Map<string, { id: string }>();
    for (const definition of accountDefinitions) {
      const account = await db.ledgerAccount.upsert({
        where: { code: definition.code },
        create: { ...definition, asset },
        update: {},
        select: { id: true },
      });
      accounts.set(definition.code, account);
    }
    const accountId = (code: string): string => {
      const account = accounts.get(code);
      if (!account) throw new Error(`seed ledger account ${code} is missing`);
      return account.id;
    };
    await db.vault.upsert({
      where: { code: `bull-master:${asset}` },
      create: {
        code: `bull-master:${asset}`,
        kind: 'BULL_MASTER',
        fundDomain: 'BULL',
        asset,
        ledgerAccountId: accountId(`bull-vault:${asset}`),
      },
      update: {},
    });
    await db.vault.upsert({
      where: { code: `reward:${asset}` },
      create: {
        code: `reward:${asset}`,
        kind: 'REWARD',
        fundDomain: 'REWARD',
        asset,
        ledgerAccountId: accountId(`reward-vault:${asset}`),
      },
      update: {},
    });
    await db.vault.upsert({
      where: { code: `ecosystem:${asset}` },
      create: {
        code: `ecosystem:${asset}`,
        kind: 'ECOSYSTEM',
        fundDomain: 'ECOSYSTEM',
        asset,
        ledgerAccountId: accountId(`ecosystem-fund:${asset}`),
      },
      update: {},
    });
    const treasuries = [
      { code: `deposit-clearing:${asset}`, kind: 'DEPOSIT_CLEARING' as const, fundDomain: null },
      { code: `spot-strategy:${asset}`, kind: 'SPOT_STRATEGY' as const, fundDomain: 'SPOT' as const },
      { code: `futures-strategy:${asset}`, kind: 'FUTURES_STRATEGY' as const, fundDomain: 'FUTURES' as const },
      { code: `withdrawal-buffer:${asset}`, kind: 'WITHDRAWAL_BUFFER' as const, fundDomain: 'WITHDRAWAL' as const },
      { code: `platform-operating:${asset}`, kind: 'PLATFORM_OPERATING' as const, fundDomain: 'PLATFORM' as const },
    ];
    for (const treasury of treasuries) {
      const ledgerCode =
        treasury.kind === 'SPOT_STRATEGY'
          ? `spot-treasury:${asset}`
          : treasury.kind === 'FUTURES_STRATEGY'
            ? `futures-treasury:${asset}`
            : treasury.kind === 'PLATFORM_OPERATING'
              ? `platform-treasury:${asset}`
              : treasury.code;
      await db.treasuryAccount.upsert({
        where: { code: treasury.code },
        create: {
          ...treasury,
          asset,
          ledgerAccountId: accountId(ledgerCode),
        },
        update: {},
      });
    }
  }

  const users: { id: string; walletAddress: string }[] = [];
  for (let index = 1; index <= 100; index += 1) {
    const walletAddress = walletFor(index);
    const user = await db.user.upsert({
      where: { walletAddress },
      create: { walletAddress },
      update: {},
      select: { id: true, walletAddress: true },
    });
    users.push(user);
    await db.referralClosure.upsert({
      where: { ancestorId_descendantId: { ancestorId: user.id, descendantId: user.id } },
      create: { ancestorId: user.id, descendantId: user.id, depth: 0 },
      update: {},
    });

    const amount = String(100 + index * 10);
    const participation = await db.participation.upsert({
      where: { externalRef: `seed-participation-${String(index)}` },
      create: {
        userId: user.id,
        amount,
        asset: index % 2 === 0 ? 'USDC' : 'USDT',
        status: 'EFFECTIVE',
        externalRef: `seed-participation-${String(index)}`,
        effectiveAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      update: {},
    });
    await db.principalXpEntry.upsert({
      where: { participationId: participation.id },
      create: { userId: user.id, participationId: participation.id, amount },
      update: {},
    });
  }

  for (let index = 1; index < users.length; index += 1) {
    const user = users[index];
    const inviter = users[Math.floor((index - 1) / 3)];
    if (!user || !inviter) throw new Error('seed user graph invariant failed');
    const existing = await db.referralEdge.findUnique({ where: { userId: user.id } });
    if (existing) continue;
    const ancestors = await db.referralClosure.findMany({ where: { descendantId: inviter.id } });
    await db.$transaction([
      db.referralEdge.create({ data: { userId: user.id, inviterUserId: inviter.id } }),
      db.referralClosure.createMany({
        data: ancestors.map((row) => ({
          ancestorId: row.ancestorId,
          descendantId: user.id,
          depth: row.depth + 1,
        })),
      }),
    ]);
  }
};

seed()
  .then(() => db.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await db.$disconnect();
    process.exitCode = 1;
  });
