import { createDatabaseClient } from '../src/index.js';

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
