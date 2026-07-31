export const PredefinedPermission = {
  CREATEUSER: 'CREATEUSER',
  GETUSER: 'GETUSER',
  GETUSERPROFILE: 'GETUSERPROFILE',
  GETUSERSUB: 'GETUSERSUB',
  BILLING_ACCESS: 'BILLING_ACCESS',
  CREDIT_ACCESS: 'CREDIT_ACCESS',
  CATALOG_MANAGE: 'CATALOG_MANAGE',
    
  MANAGE_USERS: 'MANAGE_USERS',
  MANAGE_BILLING: 'MANAGE_BILLING',
  MANAGE_ROLES: 'MANAGE_ROLES',
  MANAGE_PRODUCTS: 'MANAGE_PRODUCTS',
} as const;

export type PredefinedPermission = (typeof PredefinedPermission)[keyof typeof PredefinedPermission];

export const SYSTEM_PERMISSIONS = Object.values(PredefinedPermission);
