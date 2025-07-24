// Test the filename extraction logic with sample HTML
import * as cheerio from 'cheerio';

// Sample HTML based on the screenshot structure
const sampleHtml = `
<html>
<head><title>Past Papers</title></head>
<body>
  <div>
    <h1>Home / IGCSE / Mathematics-0580 / 2024-March</h1>
    <h2>Directories</h2>
    <div>
      <a href="../">..</a>
    </div>
    <div>
      <a href="0580_m24_gt.pdf">0580_m24_gt.pdf</a>
      <button>Download</button>
      <button>View</button>
    </div>
    <div>
      <a href="0580_m24_ms_12.pdf">0580_m24_ms_12.pdf</a>
      <button>Download</button>
      <button>View</button>
    </div>
    <div>
      <a href="0580_m24_ms_22.pdf">0580_m24_ms_22.pdf</a>
      <button>Download</button>
      <button>View</button>
    </div>
    <div>
      <a href="0580_m24_ms_32.pdf">0580_m24_ms_32.pdf</a>
      <button>Download</button>
      <button>View</button>
    </div>
    <div>
      <a href="0580_m24_ms_42.pdf">0580_m24_ms_42.pdf</a>
      <button>Download</button>
      <button>View</button>
    </div>
    <div>
      <a href="0580_m24_qp_12.pdf">0580_m24_qp_12.pdf</a>
      <button>Download</button>
      <button>View</button>
    </div>
    <div>
      <a href="0580_m24_qp_22.pdf">0580_m24_qp_22.pdf</a>
      <button>Download</button>
      <button>View</button>
    </div>
    <div>
      <a href="0580_m24_qp_32.pdf">0580_m24_qp_32.pdf</a>
      <button>Download</button>
      <button>View</button>
    </div>
    <div>
      <a href="0580_m24_qp_42.pdf">0580_m24_qp_42.pdf</a>
      <button>Download</button>
      <button>View</button>
    </div>
  </div>
</body>
</html>
`;

function testFilenameExtraction() {
  console.log('🧪 Testing filename extraction with sample HTML...\n');
  
  const $ = cheerio.load(sampleHtml);
  const pdfFilenames = new Set<string>();

  // Strategy 1: Find PDF filename links
  $('a').each((_, element) => {
    const href = $(element).attr('href');
    const linkText = $(element).text().trim();
    
    // Check if the link text itself is a PDF filename
    if (linkText && linkText.endsWith('.pdf')) {
      pdfFilenames.add(linkText);
      console.log(`📄 Found PDF filename link: ${linkText}`);
    }
    
    // Also check href for PDF filenames
    if (href && href.endsWith('.pdf')) {
      const filename = href.split('/').pop();
      if (filename) {
        pdfFilenames.add(filename);
        console.log(`📄 Found PDF in href: ${filename}`);
      }
    }
  });

  console.log(`\n📋 Total unique PDF filenames found: ${pdfFilenames.size}`);
  console.log('📝 All filenames:', Array.from(pdfFilenames).sort());

  // Test filename validation with new logic
  console.log('\n🔍 Testing filename validation:');
  for (const filename of pdfFilenames) {
    const isValid = isValidPaperFilename(filename);
    console.log(`  ${isValid ? '✅' : '❌'} ${filename} - ${isValid ? 'Valid' : 'Invalid'}`);
  }

  // Test URL construction
  console.log('\n🔗 Testing URL construction:');
  const baseUrl = 'https://pastpapers.co/cie/IGCSE/Mathematics-0580/2024-March/';
  for (const filename of pdfFilenames) {
    const fullUrl = `${baseUrl}${filename}`;
    console.log(`  📎 ${fullUrl}`);
  }
}

function isValidPaperFilename(filename: string): boolean {
  // Only accept standard pattern with paper number (qp or ms only)
  const pattern = /^\d{4}_[a-z]+\d{2}_(qp|ms)_\d+\.pdf$/i;
  return pattern.test(filename);
}

testFilenameExtraction();