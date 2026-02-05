
import { MetaAdsFacade } from '../src/lib/modules/meta-ads/index';

async function verifyFacade() {
    console.log('🚀 Verifying Meta Ads Module Facade (End-to-End)...\n');

    try {
        const adId = 'ad_123_verification';
        console.log(`Invoking analyzeAd('${adId}')...`);

        const results = await MetaAdsFacade.analyzeAd(adId);

        console.log('\n✅ Facade returned successfully.');
        console.log(`📊 Number of Recommendations: ${results.length}`);

        if (results.length > 0) {
            console.log('Sample Recommendation:', JSON.stringify(results[0], null, 2));
        } else {
            console.log('No recommendations generated (Normal for safe metrics).');
        }

    } catch (error) {
        console.error('❌ Facade verification failed:', error);
        process.exit(1);
    }
}

verifyFacade().catch(console.error);
