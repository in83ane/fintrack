/**
 * Example usage of validation schemas in forms
 * This demonstrates best practices for input validation
 */

import { validate, TradeSchema, AddAssetSchema, LoginSchema, getValidationErrors } from '@/src/lib/validation';

// ============ EXAMPLE 1: Validating Form Submission ============

export async function handleTradeSubmission(formData: unknown) {
  // Validate against schema
  const result = validate<typeof TradeSchema>(TradeSchema, formData);

  if (!result.success) {
    // Display errors to user
    console.error('Trade validation errors:', result.errors);
    return {
      success: false,
      errors: result.errors, // { symbol: "Symbol required", quantity: "Must be greater than 0" }
    };
  }

  // formData is now typed as Trade
  const trade: any = result.data;

  // Safe to use trade data
  console.log(`Buying ${trade.quantity} of ${trade.symbol} at ${trade.pricePerUnit}`);

  // Save to database, API, etc.
  return { success: true, trade };
}

// ============ EXAMPLE 2: Real-time Validation ============

export function validateTradeInput(
  field: 'symbol' | 'quantity' | 'pricePerUnit' | 'date',
  value: unknown
) {
  // Create partial schema for single field
  const fieldSchema = {
    symbol: TradeSchema.pick({ symbol: true }),
    quantity: TradeSchema.pick({ quantity: true }),
    pricePerUnit: TradeSchema.pick({ pricePerUnit: true }),
    date: TradeSchema.pick({ executionDate: true }),
  };

  const result = validate(fieldSchema[field], { [field]: value });

  return {
    isValid: result.success,
    error: result.success ? null : Object.values(result.errors)[0],
  };
}

// ============ EXAMPLE 3: Bulk Operations ============

export async function handleBulkTradeImport(csvData: any[]) {
  const errors: Record<number, string> = {};

  // Validate each trade
  const validTrades = csvData
    .map((row, index) => {
      const result = validate(TradeSchema, row);
      if (!result.success) {
        errors[index] = Object.values(result.errors).join(', ');
        return null;
      }
      return result.data;
    })
    .filter(Boolean);

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      errors,
      validCount: validTrades.length,
      totalCount: csvData.length,
    };
  }

  // All trades valid, save them
  console.log(`Importing ${validTrades.length} trades`);
  return { success: true, trades: validTrades };
}

// ============ EXAMPLE 4: API Request Validation ============

export async function validateAndProcessRequest(
  endpoint: string,
  payload: unknown
) {
  let schema;

  // Map endpoints to schemas
  switch (endpoint) {
    case '/api/trades':
      schema = TradeSchema;
      break;
    case '/api/assets':
      schema = AddAssetSchema;
      break;
    case '/api/login':
      schema = LoginSchema;
      break;
    default:
      return { success: false, error: 'Unknown endpoint' };
  }

  const result = validate(schema, payload);

  if (!result.success) {
    // Log validation failure (don't expose internal details to user)
    console.warn(`Validation failed for ${endpoint}:`, result.errors);

    return {
      success: false,
      error: 'Invalid request data',
      details: process.env.NODE_ENV === 'development' ? result.errors : undefined,
    };
  }

  // Process valid request
  console.log(`Processing validated request to ${endpoint}`);
  return { success: true, data: result.data };
}

// ============ EXAMPLE 5: Error Handling with Try-Catch ============

export async function createAssetWithErrorHandling(data: unknown) {
  try {
    const result = validate(AddAssetSchema, data);

    if (!result.success) {
      // Format errors for display
      const errorMessages = Object.entries(result.errors)
        .map(([field, message]) => `${field}: ${message}`)
        .join('\n');

      throw new Error(`Validation failed:\n${errorMessages}`);
    }

    // Create asset
    const asset = result.data;
    // await saveAsset(asset)

    return { success: true, asset };
  } catch (error) {
    const errors = getValidationErrors(error);
    return { success: false, errors };
  }
}

// ============ BEST PRACTICES ============

/**
 * Best practices for using validation schemas:
 *
 * 1. **Always validate at boundaries** - Entry points (forms, API routes)
 * 2. **Provide clear error messages** - User-friendly feedback
 * 3. **Don't expose internal schemas** - Security through obscurity
 * 4. **Type-safe after validation** - TypeScript inference from validated data
 * 5. **Log validation failures** - For debugging and monitoring
 * 6. **Validate on client and server** - Defense in depth
 * 7. **Use partial schemas for fields** - Real-time validation
 * 8. **Sanitize before validation** - Trim whitespace, normalize formats
 * 9. **Provide context in errors** - What was expected vs. received
 * 10. **Test edge cases** - Empty strings, null, undefined, wrong types
 */
