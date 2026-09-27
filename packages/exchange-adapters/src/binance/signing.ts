import { createHmac } from 'node:crypto';

export type BinanceParameterValue = string | number | boolean;
export type BinanceParameters = Readonly<Record<string, BinanceParameterValue | undefined>>;

export const serializeBinanceParameters = (parameters: BinanceParameters): string => {
  const encoded = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined) encoded.append(key, String(value));
  }
  return encoded.toString();
};

export class BinanceSigner {
  sign(parameters: BinanceParameters, secret: string): { readonly payload: string; readonly signature: string } {
    const payload = serializeBinanceParameters(parameters);
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    return { payload, signature };
  }
}
