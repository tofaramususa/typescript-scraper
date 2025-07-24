// Simple test script for the scraper
const { PastPapersScraper } = require('./dist/downloaders/pastpapers-co-scraper.js');

async function testScraper() {
  console.log('Testing scraper with limited scope...');
  
  const scraper = new PastPapersScraper({
    startYear: 2024,
    endYear: 2023, // Just test 2 years
    maxRetries: 2,
    delayMs: 500,
  });

  try {
    const testUrl = 'https://pastpapers.co/cie/?dir=IGCSE/Mathematics-0580';
    console.log(`Testing with URL: ${testUrl}`);
    
    const papers = await scraper.scrapePapers(testUrl);
    
    console.log('\n=== TEST RESULTS ===');
    console.log(`Found ${papers.length} papers`);
    
    if (papers.length > 0) {
      console.log('\nFirst few papers:');
      papers.slice(0, 5).forEach((paper, index) => {
        console.log(`${index + 1}. ${paper.metadata.subject} ${paper.metadata.year} ${paper.metadata.session} Paper ${paper.metadata.paperNumber} (${paper.metadata.paperType})`);
        console.log(`   URL: ${paper.downloadUrl}`);
      });
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

if (require.main === module) {
  testScraper();
}