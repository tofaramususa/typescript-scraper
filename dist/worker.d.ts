interface Env {
    PAST_PAPERS_BUCKET: R2Bucket;
    OPENAI_API_KEY: string;
    BROWSERLESS_API_KEY: string;
    DATABASE_URL: string;
    R2_ACCOUNT_ID: string;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
    R2_BUCKET_NAME: string;
    R2_CUSTOM_DOMAIN?: string;
    NODE_ENV: string;
}
declare const _default: {
    fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
};
export default _default;
//# sourceMappingURL=worker.d.ts.map