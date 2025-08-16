import { z } from 'zod';
declare const EnvSchema: z.ZodObject<{
    DATABASE_URL: z.ZodEffects<z.ZodString, string, string>;
    R2_ACCOUNT_ID: z.ZodString;
    R2_ACCESS_KEY_ID: z.ZodString;
    R2_SECRET_ACCESS_KEY: z.ZodString;
    R2_BUCKET_NAME: z.ZodString;
    R2_CUSTOM_DOMAIN: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    OPENAI_API_KEY: z.ZodOptional<z.ZodString>;
    NODE_ENV: z.ZodDefault<z.ZodEnum<["development", "production", "test"]>>;
}, "strip", z.ZodTypeAny, {
    R2_ACCOUNT_ID: string;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
    R2_BUCKET_NAME: string;
    DATABASE_URL: string;
    NODE_ENV: "development" | "production" | "test";
    R2_CUSTOM_DOMAIN?: string | undefined;
    OPENAI_API_KEY?: string | undefined;
}, {
    R2_ACCOUNT_ID: string;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
    R2_BUCKET_NAME: string;
    DATABASE_URL: string;
    R2_CUSTOM_DOMAIN?: string | undefined;
    OPENAI_API_KEY?: string | undefined;
    NODE_ENV?: "development" | "production" | "test" | undefined;
}>;
export type ValidatedEnv = z.infer<typeof EnvSchema>;
export declare function validateEnvironment(requireOpenAI?: boolean): ValidatedEnv;
export declare function checkEnvironmentVariables(vars: string[]): {
    valid: boolean;
    missing: string[];
    invalid: Array<{
        key: string;
        error: string;
    }>;
};
export declare function logEnvironmentStatus(): void;
export {};
//# sourceMappingURL=env-validator.d.ts.map