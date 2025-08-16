// Quick test to verify scraper works with the new logic
import { PapaCambridgeScraper } from './src/downloaders/papacambridge-scraper';

async function quickTest() {
  console.log('🧪 Quick test of the improved scraper...');
  
  const scraper = new PapaCambridgeScraper({
    startYear: 2024,
    endYear: 2023, // Just test 2 years to be quick
    maxRetries: 2,
    delayMs: 1000,
  });

  try {
    const testUrl = 'https://pastpapers.papacambridge.com/papers/caie/igcse-mathematics-0580';
    console.log(`\n🔗 Testing with URL: ${testUrl}`);
    
    const papers = await scraper.scrapePapers(testUrl);
    
    console.log('\n📊 TEST RESULTS:');
    console.log(`Total papers found: ${papers.length}`);
    
    if (papers.length > 0) {
      console.log('\n📄 Sample papers:');
      papers.slice(0, 3).forEach((paper, index) => {
        const { subject, year, session, paperNumber, type } = paper.metadata;
        console.log(`${index + 1}. ${subject} ${year} ${session} Paper ${paperNumber} (${type})`);
        console.log(`   📥 Download URL: ${paper.downloadUrl}`);
      });
      
      // Test URL parsing
      const firstPaper = papers[0];
      console.log(`\n🔍 First paper metadata:`);
      console.log(JSON.stringify(firstPaper.metadata, null, 2));
      
    } else {
      console.log('❌ No papers found - may need to adjust scraping logic');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Full error:', error);
  }
}

quickTest().catch(console.error);