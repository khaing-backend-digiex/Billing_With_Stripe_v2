import { PlanType } from '../../generated/prisma/client';

export const PLAN_CREDIT_LIMITS: Record<PlanType, number> = {
  [PlanType.FREE]: 50,
  [PlanType.PRO_MONTHLY]: 100,
  [PlanType.PRO_ANNUAL]: 100,
  [PlanType.ADDON]: 0,
};

export const ADDON_CREDITS_PER_PURCHASE = 15;
