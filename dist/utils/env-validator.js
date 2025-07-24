import { z } from 'zod';
const EnvSchema = z.object({
    DATABASE_URL: z.string()
        .url()
        .refine(url => url.startsWith('postgresql://') || url.startsWith('postgres://'), {
        message: 'DATABASE_URL must be a valid PostgreSQL connection string'
    }),
    R2_ACCOUNT_ID: z.string()
        .min(32, 'R2_ACCOUNT_ID must be at least 32 characters')
        .max(32, 'R2_ACCOUNT_ID must be exactly 32 characters')
        .regex(/^[a-f0-9]{32}$/, 'R2_ACCOUNT_ID must be a valid hexadecimal string'),
    R2_ACCESS_KEY_ID: z.string()
        .min(20, 'R2_ACCESS_KEY_ID must be at least 20 characters')
        .max(128, 'R2_ACCESS_KEY_ID is too long'),
    R2_SECRET_ACCESS_KEY: z.string()
        .min(40, 'R2_SECRET_ACCESS_KEY must be at least 40 characters')
        .max(128, 'R2_SECRET_ACCESS_KEY is too long'),
    R2_BUCKET_NAME: z.string()
        .min(3, 'R2_BUCKET_NAME must be at least 3 characters')
        .max(63, 'R2_BUCKET_NAME must be at most 63 characters')
        .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'R2_BUCKET_NAME must be a valid bucket name'),
    R2_CUSTOM_DOMAIN: z.string()
        .url()
        .optional()
        .or(z.literal('')),
    OPENAI_API_KEY: z.string()
        .startsWith('sk-', 'OPENAI_API_KEY must start with "sk-"')
        .min(40, 'OPENAI_API_KEY appears to be invalid')
        .optional(),
    BROWSERLESS_API_KEY: z.string()
        .min(1, 'Browserless API key is required')
        .optional(),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});
export function validateEnvironment(requireOpenAI = true) {
    const env = {
        DATABASE_URL: process.env.DATABASE_URL,
        R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
        R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
        R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
        R2_CUSTOM_DOMAIN: process.env.R2_CUSTOM_DOMAIN,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        BROWSERLESS_API_KEY: process.env.BROWSERLESS_API_KEY,
        NODE_ENV: process.env.NODE_ENV,
    };
    const schema = requireOpenAI
        ? EnvSchema.required({ OPENAI_API_KEY: true })
        : EnvSchema;
    try {
        const validated = schema.parse(env);
        validateR2Configuration(validated);
        if (requireOpenAI && !validated.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY is required when embeddings are enabled');
        }
        console.log('✅ Environment variables validated successfully');
        return validated;
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            const errors = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
            throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
        }
        throw error;
    }
}
function validateR2Configuration(env) {
    if (env.R2_CUSTOM_DOMAIN && env.R2_CUSTOM_DOMAIN !== '') {
        try {
            const url = new URL(env.R2_CUSTOM_DOMAIN);
            if (url.protocol !== 'https:') {
                throw new Error('R2_CUSTOM_DOMAIN must use HTTPS');
            }
        }
        catch {
            throw new Error('R2_CUSTOM_DOMAIN must be a valid HTTPS URL');
        }
    }
    if (env.R2_ACCESS_KEY_ID && !env.R2_ACCESS_KEY_ID.match(/^[A-Z0-9]{20,}$/)) {
        console.warn('⚠️  R2_ACCESS_KEY_ID format may be incorrect (expected uppercase alphanumeric)');
    }
}
export function checkEnvironmentVariables(vars) {
    const missing = [];
    const invalid = [];
    for (const varName of vars) {
        const value = process.env[varName];
        if (!value) {
            missing.push(varName);
            continue;
        }
        try {
            switch (varName) {
                case 'DATABASE_URL':
                    if (!value.startsWith('postgresql://') && !value.startsWith('postgres://')) {
                        invalid.push({ key: varName, error: 'Must be a PostgreSQL connection string' });
                    }
                    break;
                case 'OPENAI_API_KEY':
                    if (!value.startsWith('sk-')) {
                        invalid.push({ key: varName, error: 'Must start with "sk-"' });
                    }
                    break;
                case 'R2_ACCOUNT_ID':
                    if (value.length !== 32 || !/^[a-f0-9]{32}$/.test(value)) {
                        invalid.push({ key: varName, error: 'Must be a 32-character hexadecimal string' });
                    }
                    break;
                case 'R2_BUCKET_NAME':
                    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(value) || value.length < 3 || value.length > 63) {
                        invalid.push({ key: varName, error: 'Invalid bucket name format' });
                    }
                    break;
            }
        }
        catch (error) {
            invalid.push({ key: varName, error: 'Validation error' });
        }
    }
    return {
        valid: missing.length === 0 && invalid.length === 0,
        missing,
        invalid,
    };
}
export function logEnvironmentStatus() {
    const requiredVars = [
        'DATABASE_URL',
        'R2_ACCOUNT_ID',
        'R2_ACCESS_KEY_ID',
        'R2_SECRET_ACCESS_KEY',
        'R2_BUCKET_NAME'
    ];
    const optionalVars = [
        'OPENAI_API_KEY',
        'BROWSERLESS_API_KEY',
        'R2_CUSTOM_DOMAIN'
    ];
    console.log('🔧 Environment Configuration:');
    const requiredCheck = checkEnvironmentVariables(requiredVars);
    requiredVars.forEach(varName => {
        const value = process.env[varName];
        const status = value ? '✅' : '❌';
        const maskedValue = value ? maskSensitiveValue(varName, value) : 'NOT_SET';
        console.log(`  ${status} ${varName}: ${maskedValue}`);
    });
    optionalVars.forEach(varName => {
        const value = process.env[varName];
        const status = value ? '✅' : '⚪';
        const maskedValue = value ? maskSensitiveValue(varName, value) : 'NOT_SET';
        console.log(`  ${status} ${varName}: ${maskedValue}`);
    });
    if (requiredCheck.missing.length > 0) {
        console.log(`\n❌ Missing required variables: ${requiredCheck.missing.join(', ')}`);
    }
    if (requiredCheck.invalid.length > 0) {
        console.log('\n❌ Invalid variables:');
        requiredCheck.invalid.forEach(({ key, error }) => {
            console.log(`  - ${key}: ${error}`);
        });
    }
}
function maskSensitiveValue(key, value) {
    const sensitiveKeys = ['SECRET', 'KEY', 'PASSWORD', 'TOKEN'];
    if (sensitiveKeys.some(sensitive => key.includes(sensitive))) {
        if (value.length <= 8) {
            return '***';
        }
        return `${value.slice(0, 4)}...${value.slice(-4)}`;
    }
    if (key.includes('URL') && value.includes('://')) {
        try {
            const url = new URL(value);
            if (url.username || url.password) {
                return `${url.protocol}//*:*@${url.host}${url.pathname}${url.search}`;
            }
        }
        catch {
            return `${value.slice(0, 10)}...${value.slice(-10)}`;
        }
    }
    return value;
}
//# sourceMappingURL=env-validator.js.map