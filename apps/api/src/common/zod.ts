import { BadRequestException } from '@nestjs/common';
import type { ZodType } from 'zod';

export const parseBody = <T>(schema: ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', issues: result.error.issues });
  }
  return result.data;
};
