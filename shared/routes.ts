import { z } from 'zod';
import { categories, transactions, insertCategorySchema, insertTransactionSchema } from './schema';

export { insertCategorySchema, insertTransactionSchema };

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  categories: {
    list: {
      method: 'GET' as const,
      path: '/api/categories',
      responses: {
        200: z.array(z.custom<typeof categories.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/categories',
      input: insertCategorySchema,
      responses: {
        201: z.custom<typeof categories.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/categories/:id',
      input: insertCategorySchema.partial(),
      responses: {
        200: z.custom<typeof categories.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/categories/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    }
  },
  transactions: {
    list: {
      method: 'GET' as const,
      path: '/api/transactions',
      input: z.object({
        year: z.coerce.number().optional(),
        categoryId: z.coerce.number().optional(),
        type: z.enum(['income', 'expense']).optional(),
        search: z.string().optional()
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof transactions.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/transactions',
      input: insertTransactionSchema,
      responses: {
        201: z.custom<typeof transactions.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/transactions/:id',
      input: insertTransactionSchema.partial(),
      responses: {
        200: z.custom<typeof transactions.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/transactions/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    upload: {
      method: 'POST' as const,
      path: '/api/transactions/upload',
      // Multipart form data, schema check handled in route logic mainly, or defined here as simple check
      responses: {
        200: z.object({ imported: z.number(), duplicates: z.number() }),
        400: errorSchemas.validation
      }
    },
    autoCategorize: {
      method: 'POST' as const,
      path: '/api/transactions/auto-categorize',
      responses: {
        200: z.object({ updatedCount: z.number() })
      }
    }
  },
  dashboard: {
    stats: {
      method: 'GET' as const,
      path: '/api/stats',
      input: z.object({ year: z.coerce.number().optional() }).optional(),
      responses: {
        200: z.object({
          currentBalance: z.number(),
          totalIncome: z.number(),
          totalExpenses: z.number(),
          netResult: z.number()
        })
      }
    },
    charts: {
      method: 'GET' as const,
      path: '/api/charts',
      input: z.object({ year: z.coerce.number().optional() }).optional(),
      responses: {
        200: z.object({
          incomeVsExpenses: z.array(z.object({ month: z.string(), income: z.number(), expenses: z.number() })),
          categoryDistribution: z.array(z.object({ name: z.string(), value: z.number() })),
          balanceOverTime: z.array(z.object({ date: z.string(), balance: z.number() }))
        })
      }
    },
    forecast: {
      method: 'GET' as const,
      path: '/api/forecast',
      responses: {
        200: z.object({
          projectedYearEndBalance: z.number(),
          warning: z.string().optional(),
          data: z.array(z.object({ date: z.string(), balance: z.number(), isProjected: z.boolean() }))
        })
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
