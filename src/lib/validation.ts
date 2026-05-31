/**
 * Comprehensive validation schemas for FinTrack forms
 * Using Zod for runtime type safety and validation
 */

import { z } from 'zod';

// Common patterns
const positiveNumber = z.number().positive('Must be greater than 0');
const email = z.string().email('Invalid email address');
const currency = z.enum(['USD', 'THB', 'JPY', 'EUR']);
const tradeType = z.enum(['BUY', 'SELL', 'DIVIDEND', 'IMPORT']);
const assetType = z.enum(['stock', 'crypto', 'etf', 'commodity', 'forex']);
const language = z.enum(['en', 'th']);

// ============ TRADE SCHEMAS ============

export const TradeSchema = z.object({
  symbol: z.string().min(1, 'Symbol required').max(20, 'Symbol too long').toUpperCase(),
  type: tradeType,
  quantity: positiveNumber,
  pricePerUnit: positiveNumber,
  executionDate: z.date(),
  currency: currency,
  fees: z.number().nonnegative('Fees cannot be negative').default(0),
  taxes: z.number().nonnegative('Taxes cannot be negative').default(0),
  notes: z.string().max(500, 'Notes too long').optional(),
});

export type Trade = z.infer<typeof TradeSchema>;

export const BulkTradeImportSchema = z.object({
  trades: z.array(TradeSchema).min(1, 'At least one trade required'),
});

// ============ ASSET SCHEMAS ============

export const AddAssetSchema = z.object({
  symbol: z.string().min(1, 'Symbol required').max(20).toUpperCase(),
  name: z.string().min(1, 'Name required').max(100),
  assetType: assetType,
  quantity: positiveNumber,
  averageCost: positiveNumber,
  currency: currency,
  sector: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
});

export type AddAsset = z.infer<typeof AddAssetSchema>;

export const EditAssetSchema = AddAssetSchema.extend({
  id: z.string().uuid('Invalid asset ID'),
});

// ============ CASH FLOW SCHEMAS ============

export const CashActivitySchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: positiveNumber,
  category: z.string().min(1, 'Category required').max(50),
  date: z.date(),
  note: z.string().max(500).optional(),
});

export type CashActivity = z.infer<typeof CashActivitySchema>;

// ============ MONEY BUCKET SCHEMAS ============

export const BucketActivitySchema = z.object({
  bucketId: z.string().uuid('Invalid bucket ID'),
  type: z.enum(['deposit', 'withdraw', 'invest', 'income_split', 'profit_split']),
  amount: positiveNumber,
  date: z.date(),
  note: z.string().max(500).optional(),
});

export type BucketActivity = z.infer<typeof BucketActivitySchema>;

export const CreateBucketSchema = z.object({
  name: z.string().min(1, 'Name required').max(50),
  targetPercent: z.number().min(0).max(100, 'Must be 0-100%'),
  targetAmount: positiveNumber.optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid color'),
  icon: z.string().max(20).optional(),
});

// ============ PRICE ALERT SCHEMAS ============

export const PriceAlertSchema = z.object({
  symbol: z.string().min(1).max(20).toUpperCase(),
  type: z.enum(['ABOVE', 'BELOW']),
  targetPrice: positiveNumber,
  currency: currency,
  enabled: z.boolean().default(true),
});

export type PriceAlert = z.infer<typeof PriceAlertSchema>;

// ============ USER SETTINGS SCHEMAS ============

export const UserSettingsSchema = z.object({
  language: language,
  currency: currency,
  darkMode: z.boolean(),
  emailNotifications: z.boolean().default(true),
  pushNotifications: z.boolean().default(false),
});

export type UserSettings = z.infer<typeof UserSettingsSchema>;

// ============ AUTHENTICATION SCHEMAS ============

export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain uppercase letter')
  .regex(/[a-z]/, 'Password must contain lowercase letter')
  .regex(/[0-9]/, 'Password must contain number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain special character');

export const LoginSchema = z.object({
  email: email,
  password: z.string().min(1, 'Password required'),
  rememberMe: z.boolean().default(false),
});

export type Login = z.infer<typeof LoginSchema>;

export const SignUpSchema = z.object({
  email: email,
  password: PasswordSchema,
  confirmPassword: z.string(),
  fullName: z.string().min(2, 'Name too short').max(100),
  agreeToTerms: z.boolean().refine((val) => val === true, 'Must agree to terms'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type SignUp = z.infer<typeof SignUpSchema>;

export const ResetPasswordSchema = z.object({
  email: email,
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Required'),
  newPassword: PasswordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// ============ DCA ORDER SCHEMAS ============

export const DCAOrderSchema = z.object({
  symbol: z.string().min(1).max(20).toUpperCase(),
  entries: z.array(
    z.object({
      id: z.number(),
      price: positiveNumber,
      quantity: positiveNumber,
      invested: positiveNumber,
    })
  ).min(1, 'At least one entry required').max(4, 'Maximum 4 entries'),
  totalInvested: positiveNumber,
  avgEntryPrice: positiveNumber,
  breakEvenPrice: positiveNumber,
});

// ============ VALIDATION UTILITIES ============

/**
 * Generic validation function with error handling
 */
export function validate<T>(schema: z.ZodSchema, data: unknown): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated as T };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      error.issues.forEach((err) => {
        const path = err.path.join('.');
        errors[path] = err.message;
      });
      return { success: false, errors };
    }
    return { success: false, errors: { general: 'Validation failed' } };
  }
}

/**
 * Safe parse with default value on error
 */
export function safeParse<T>(schema: z.ZodSchema, data: unknown, defaultValue: T): T {
  try {
    return schema.parse(data) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Validate and return errors as formatted messages
 */
export function getValidationErrors(error: unknown): Record<string, string> {
  if (error instanceof z.ZodError) {
    const errors: Record<string, string> = {};
    error.issues.forEach((err) => {
      const path = err.path.join('.');
      errors[path] = err.message;
    });
    return errors;
  }
  return { general: 'Validation error occurred' };
}

/**
 * Validate multiple schemas in sequence
 */
export async function validateSequential<T>(
  schemas: Array<{ schema: z.ZodSchema; data: unknown; name: string }>
): Promise<{ valid: boolean; data?: T; errors?: Record<string, string> }> {
  for (const { schema, data, name } of schemas) {
    const result = validate(schema, data);
    if (!result.success) {
      return {
        valid: false,
        errors: { [name]: Object.values(result.errors).join(', ') },
      };
    }
  }
  return { valid: true };
}
