import { z } from 'zod';
export const PaperMetadataSchema = z.object({
    examBoard: z.string(),
    level: z.string(),
    subject: z.string(),
    subjectCode: z.string(),
    year: z.string(),
    session: z.string(),
    paperNumber: z.string(),
    paperType: z.enum(['qp', 'ms']),
    originalUrl: z.string().url(),
});
const SESSION_MAPPING = {
    'm': 'March',
    's': 'May-June',
    'w': 'Oct-Nov',
    'sp': 'Feb-March',
    'su': 'May-June',
    'au': 'Oct-Nov',
    'march': 'March',
    'may-june': 'May-June',
    'oct-nov': 'Oct-Nov',
    'feb-march': 'Feb-March',
    'october-november': 'Oct-Nov',
    'february-march': 'Feb-March'
};
export function parsePaperUrl(pdfUrl) {
    try {
        const url = new URL(pdfUrl);
        const pathParts = url.pathname.split('/').filter(Boolean);
        if (pathParts.length < 5) {
            throw new Error(`Invalid URL structure: ${pdfUrl}`);
        }
        const examBoard = pathParts[1].toLowerCase();
        const level = pathParts[2];
        const subjectWithCode = pathParts[3];
        const yearSession = pathParts[4];
        const filename = pathParts[5];
        const subjectMatch = subjectWithCode.match(/^(.+)-(\d+)$/);
        if (!subjectMatch) {
            throw new Error(`Cannot parse subject and code from: ${subjectWithCode}`);
        }
        const subject = subjectMatch[1];
        const subjectCode = subjectMatch[2];
        const yearSessionMatch = yearSession.match(/^(\d{4})-(.+)$/);
        if (!yearSessionMatch) {
            throw new Error(`Cannot parse year and session from: ${yearSession}`);
        }
        const year = yearSessionMatch[1];
        const session = yearSessionMatch[2];
        const filenameMatch = filename.match(/^(\d+)_([a-z]+)(\d{2})_([a-z]+)_(\d+)\.pdf$/);
        if (!filenameMatch) {
            throw new Error(`Cannot parse filename: ${filename}`);
        }
        const paperNumber = filenameMatch[5];
        const fileSubjectCode = filenameMatch[1];
        const sessionCode = filenameMatch[2];
        const yearCode = filenameMatch[3];
        const paperType = filenameMatch[4];
        if (fileSubjectCode !== subjectCode) {
            console.warn(`Subject code mismatch: URL has ${subjectCode}, filename has ${fileSubjectCode}`);
        }
        const fullYear = `20${yearCode}`;
        if (fullYear !== year) {
            console.warn(`Year mismatch: URL has ${year}, filename suggests ${fullYear}`);
        }
        const mappedSession = SESSION_MAPPING[sessionCode] || session;
        const metadata = {
            examBoard: examBoard === 'cie' ? 'Cambridge' : examBoard,
            level: level,
            subject: subject,
            subjectCode: subjectCode,
            year: year,
            session: mappedSession,
            paperNumber: paperNumber,
            paperType: paperType,
            originalUrl: pdfUrl,
        };
        return PaperMetadataSchema.parse(metadata);
    }
    catch (error) {
        throw new Error(`Failed to parse paper URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
export function generateStorageKey(metadata) {
    const { examBoard, level, subjectCode, year, session, paperNumber, paperType } = metadata;
    const cleanSession = session.replace(/[\/\\]/g, '-');
    return `past-papers/${examBoard.toLowerCase()}/${level.toLowerCase()}/${subjectCode}/${year}/${cleanSession}/${paperNumber}_${paperType}.pdf`;
}
export function isValidPastPapersUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname === 'pastpapers.co';
    }
    catch {
        return false;
    }
}
export function extractBaseUrl(url) {
    try {
        const cleanedUrl = url.replace(/\\([?=&])/g, '$1');
        const urlObj = new URL(cleanedUrl);
        const dir = urlObj.searchParams.get('dir');
        if (!dir) {
            const manualMatch = cleanedUrl.match(/[?&]dir=([^&]+)/);
            if (manualMatch) {
                const manualDir = decodeURIComponent(manualMatch[1]);
                return `${urlObj.origin}${urlObj.pathname}${manualDir}/`;
            }
            throw new Error('No dir parameter found in URL');
        }
        return `${urlObj.origin}${urlObj.pathname}${dir}/`;
    }
    catch (error) {
        throw new Error(`Failed to extract base URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
//# sourceMappingURL=url-parser.js.map