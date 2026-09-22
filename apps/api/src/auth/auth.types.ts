export interface AuthenticatedUser {
  readonly userId: string;
  readonly walletAddress: string;
  readonly role: string;
}
