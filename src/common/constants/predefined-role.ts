export const PredefinedRole = {
  ADMIN: 'ADMIN',
  USER: 'USER',
} as const;

export type PredefinedRole = (typeof PredefinedRole)[keyof typeof PredefinedRole];
