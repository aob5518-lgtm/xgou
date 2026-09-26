import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';

export interface TreasuryDryRunInput { readonly source: string; readonly destination: string; readonly asset: string; readonly amount: string; readonly chainId: string; readonly availableGas: string; readonly gasReserve: string; }
export interface TreasuryDryRunResult { readonly policyCheck: 'APPROVED' | 'REJECTED'; readonly requiredApprovals: number; readonly estimatedGas: string; readonly wouldExecute: false; readonly reasons: readonly string[]; }

@Injectable()
export class TreasuryDryRunService {
  evaluate(input: TreasuryDryRunInput, addressAllowed: boolean, production: boolean): TreasuryDryRunResult {
    const reasons: string[] = [];
    if (!addressAllowed) reasons.push('DESTINATION_NOT_ALLOWLISTED');
    if (new Decimal(input.amount).lte(0)) reasons.push('INVALID_AMOUNT');
    const estimatedGas = '0.1';
    if (new Decimal(input.availableGas).minus(estimatedGas).lt(input.gasReserve)) reasons.push('GAS_RESERVE_RISK');
    return { policyCheck: reasons.length ? 'REJECTED' : 'APPROVED', requiredApprovals: production ? 2 : 1, estimatedGas, wouldExecute: false, reasons };
  }
}
