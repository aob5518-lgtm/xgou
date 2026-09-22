export interface ClosureRow {
  readonly ancestorId: string;
  readonly descendantId: string;
  readonly depth: number;
}

export class ReferralBindingError extends Error {}

export const planReferralBinding = (
  userId: string,
  inviterId: string,
  inviterAncestors: readonly ClosureRow[],
  userAlreadyBound: boolean,
): ClosureRow[] => {
  if (userAlreadyBound) throw new ReferralBindingError('inviter is permanently bound');
  if (userId === inviterId) throw new ReferralBindingError('self-referral is forbidden');
  if (inviterAncestors.some((row) => row.ancestorId === userId)) {
    throw new ReferralBindingError('referral cycle detected');
  }

  const inherited = inviterAncestors.map((row) => ({
    ancestorId: row.ancestorId,
    descendantId: userId,
    depth: row.depth + 1,
  }));
  if (!inherited.some((row) => row.ancestorId === inviterId)) {
    inherited.push({ ancestorId: inviterId, descendantId: userId, depth: 1 });
  }
  return inherited;
};
