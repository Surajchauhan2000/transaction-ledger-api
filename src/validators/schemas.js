const {z} = require('zod');

const uuid = z.string().uuid('Invalid ID format');

const createAccountSchema = z.object({
    name: z
        .string({required_error: 'Name is required', invalid_type_error: 'Name must be a string'})
        .trim()
        .min(1, 'Name is required')
        .max(100, 'Name must be at most 100 characters'),
}).strict(); // extra fields (jaise balance) reject honge

const addTransactionSchema = z.object({
    type: z.enum(['credit', 'debit'], {
        errorMap: () => ({message: "Type must be either 'credit' or 'debit'"}),
    }),
    amount: z
        .union([z.number(), z.string()], {
            errorMap: () => ({message: 'Amount must be a number'}),
        })
        .transform((v) => (typeof v === 'string' ? v.trim() : String(v)))
        .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), {
            message: 'Amount must be a positive number with at most 2 decimal places',
        })
        .refine((v) => Number(v) > 0, {message: 'Amount must be greater than 0'})
        .refine((v) => Number(v) <= 9999999999999.99, {message: 'Amount is too large'}),
    description: z.string().trim().max(500, 'Description must be at most 500 characters').optional(),
    reference_id: z
        .string({required_error: 'reference_id is required', invalid_type_error: 'reference_id must be a string'})
        .trim()
        .min(1, 'reference_id is required')
        .max(100, 'reference_id must be at most 100 characters'),
}).strict();

const accountIdParamSchema = z.object({id: uuid});

const historyQuerySchema = z.object({
    type: z.enum(['credit', 'debit'], {
        errorMap: () => ({message: "Type must be either 'credit' or 'debit'"}),
    }).optional(),
    page: z.coerce.number({invalid_type_error: 'page must be a number'})
        .int('page must be an integer').min(1, 'page must be at least 1').default(1),
    limit: z.coerce.number({invalid_type_error: 'limit must be a number'})
        .int('limit must be an integer').min(1, 'limit must be at least 1')
        .max(100, 'limit must be at most 100').default(10),
});

module.exports = {
    createAccountSchema,
    addTransactionSchema,
    accountIdParamSchema,
    historyQuerySchema,
};