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
    examBoard: string;
    level: string;
    subject: string;
    subjectCode: string;
    year: string;
    session: string;
    paperNumber: string;
    paperType: "qp" | "ms";
    originalUrl: string;
}, {
    examBoard: string;
    level: string;
    subject: string;
    subjectCode: string;
    year: string;
    session: string;
    paperNumber: string;
    paperType: "qp" | "ms";
    originalUrl: string;
}>;
export type PaperMetadata = z.infer<typeof PaperMetadataSchema>;
export declare function parsePaperUrl(pdfUrl: string): PaperMetadata;
export declare function generateStorageKey(metadata: PaperMetadata): string;
export declare function isValidPastPapersUrl(url: string): boolean;
export declare function extractBaseUrl(url: string): string;
//# sourceMappingURL=url-parser.d.ts.map