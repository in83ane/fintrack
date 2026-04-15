/**
 * Database Schema Definitions
 * This folder is intended for database-related logic, schemas, or connection configurations.
 * For a secure production app, consider using Firebase or a similar managed database.
 */

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  tier: 'free' | 'premium' | 'gold';
  createdAt: Date;
}

export interface Portfolio {
  userId: string;
  totalValue: number;
  currency: string;
  allocations: {
    assetClass: string;
    percentage: number;
    currentValue: number;
  }[];
}
