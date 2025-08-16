import { z } from 'zod';
export declare const PaperMetadataSchema: z.ZodObject<{
    examBoard: z.ZodString;
    level: z.ZodString;
    subject: z.ZodString;
    subjectCode: z.ZodString;
    year: z.ZodString;
    session: z.ZodString;
    paperNumber: z.ZodString;
    paperType: z.ZodEnum<["qp", "ms"]>;
    originalUrl: z.ZodString;
}, "strip", z.ZodTypeAny, {
    year: string;
    session: string;
    paperNumber: string;
    subject: string;
    level: string;
    originalUrl: string;
    examBoard: string;
    subjectCode: string;
    paperType: "qp" | "ms";
}, {
    year: string;
    session: string;
    paperNumber: string;
    subject: string;
    level: string;
    originalUrl: string;
    examBoard: string;
    subjectCode: string;
    paperType: "qp" | "ms";
}>;
export type PaperMetadata = z.infer<typeof PaperMetadataSchema>;
export declare function parsePaperUrl(pdfUrl: string): PaperMetadata;
export declare function generateStorageKey(metadata: PaperMetadata): string;
export declare function isValidPastPapersUrl(url: string): boolean;
export declare function extractBaseUrl(url: string): string;
//# sourceMappingURL=url-parser.d.ts.map