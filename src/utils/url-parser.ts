import { z } from 'zod';
/**
 * Schema for validating parsed paper metadata
 */
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

export type PaperMetadata = z.infer<typeof PaperMetadataSchema>;

/**
 * Session mapping for different month codes and formats
 */
const SESSION_MAPPING: Record<string, string> = {
  'm': 'March',
  's': 'May-June', 
  'w': 'Oct-Nov',
  'sp': 'Feb-March',
  'su': 'May-June',
  'au': 'Oct-Nov',
  // Direct session name mappings
  'march': 'March',
  'may-june': 'May-June',
  'oct-nov': 'Oct-Nov',
  'feb-march': 'Feb-March',
  'october-november': 'Oct-Nov',
  'february-march': 'Feb-March'
};

/**
 * Extracts paper metadata from a pastpapers.co PDF URL
 * Example URL: https://pastpapers.co/cie/IGCSE/Mathematics-0580/2024-March/0580_m24_ms_42.pdf
 * 
 * @param pdfUrl - The complete PDF URL from pastpapers.co
 * @returns Parsed paper metadata
 */
export function parsePaperUrl(pdfUrl: string): PaperMetadata {
  try {
    const url = new URL(pdfUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);
    // Extract from URL path: /cie/IGCSE/Mathematics-0580/2024-March/filename.pdf
    if (pathParts.length < 5) {
      throw new Error(`Invalid URL structure: ${pdfUrl}`);
    }
    const examBoard = pathParts[1].toLowerCase(); // 'cie'
    const level = pathParts[2]; // 'IGCSE'
    const subjectWithCode = pathParts[3]; // 'Mathematics-0580'
    const yearSession = pathParts[4]; // '2024-March'
    const filename = pathParts[5]; // '0580_m24_ms_42.pdf'
    // Parse subject and subject code from "Mathematics-0580"
    const subjectMatch = subjectWithCode.match(/^(.+)-(\d+)$/);
    if (!subjectMatch) {
      throw new Error(`Cannot parse subject and code from: ${subjectWithCode}`);
    }
    const subject = subjectMatch[1];
    const subjectCode = subjectMatch[2];
    // Parse year and session from "2024-March"
    const yearSessionMatch = yearSession.match(/^(\d{4})-(.+)$/);
    if (!yearSessionMatch) {
      throw new Error(`Cannot parse year and session from: ${yearSession}`);
    }
    const year = yearSessionMatch[1];
    const session = yearSessionMatch[2];

    // Parse filename: "0580_m24_ms_42.pdf"
    const filenameMatch = filename.match(/^(\d+)_([a-z]+)(\d{2})_([a-z]+)_(\d+)\.pdf$/);
    if (!filenameMatch) {
      throw new Error(`Cannot parse filename: ${filename}`);
    }
    
    const paperNumber = filenameMatch[5]; // '42'

    const fileSubjectCode = filenameMatch[1];
    const sessionCode = filenameMatch[2]; // 'm', 's', 'w', etc.
    const yearCode = filenameMatch[3]; // '24'
    const paperType = filenameMatch[4] as 'qp' | 'ms'; // 'ms' or 'qp'

    // Validate consistency
    if (fileSubjectCode !== subjectCode) {
      console.warn(`Subject code mismatch: URL has ${subjectCode}, filename has ${fileSubjectCode}`);
    }

    // Convert 2-digit year to 4-digit
    const fullYear = `20${yearCode}`;
    if (fullYear !== year) {
      console.warn(`Year mismatch: URL has ${year}, filename suggests ${fullYear}`);
    }

    // Map session code to full session name
    const mappedSession = SESSION_MAPPING[sessionCode] || session;

    const metadata: PaperMetadata = {
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

    // Validate with Zod schema
    return PaperMetadataSchema.parse(metadata);
  } catch (error) {
    throw new Error(`Failed to parse paper URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates a standardized key for R2 storage based on paper metadata
 * 
 * @param metadata - Paper metadata
 * @returns Storage key for R2
 */
export function generateStorageKey(metadata: PaperMetadata): string {
  const { examBoard, level, subjectCode, year, session, paperNumber, paperType } = metadata;
  
  // Clean session name for file path
  const cleanSession = session.replace(/[\/\\]/g, '-');
  
  return `past-papers/${examBoard.toLowerCase()}/${level.toLowerCase()}/${subjectCode}/${year}/${cleanSession}/${paperNumber}_${paperType}.pdf`;
}

/**
 * Validates if a URL is from pastpapers.co
 * 
 * @param url - URL to validate
 * @returns True if valid pastpapers.co URL
 */
export function isValidPastPapersUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname === 'pastpapers.co';
  } catch {
    return false;
  }
}

/**
 * Extracts the base directory URL from a pastpapers.co URL
 * Example: https://pastpapers.co/cie/?dir=IGCSE/Mathematics-0580 -> https://pastpapers.co/cie/IGCSE/Mathematics-0580/
 * 
 * @param url - The pastpapers.co URL
 * @returns Base directory URL for scraping
 */
export function extractBaseUrl(url: string): string {
  try {
    // First, handle escaped characters that might come from command line
    // Replace \? with ? and \= with =
    const cleanedUrl = url.replace(/\\([?=&])/g, '$1');
    
    const urlObj = new URL(cleanedUrl);
    const dir = urlObj.searchParams.get('dir');
    
    if (!dir) {
      // Try to parse manually if URL parsing failed
      const manualMatch = cleanedUrl.match(/[?&]dir=([^&]+)/);
      if (manualMatch) {
        const manualDir = decodeURIComponent(manualMatch[1]);
        return `${urlObj.origin}${urlObj.pathname}${manualDir}/`;
      }
      
      throw new Error('No dir parameter found in URL');
    }

    return `${urlObj.origin}${urlObj.pathname}${dir}/`;

  } catch (error) {
    throw new Error(`Failed to extract base URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}