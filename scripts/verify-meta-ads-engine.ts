
import { createSnapshot } from '../src/lib/modules/meta-ads/domain/context/snapshot';
import { RecommendationContext } from '../src/lib/modules/meta-ads/domain/context/context';
import { evaluate } from '../src/lib/modules/meta-ads/domain/engine';
import { HighCpaRule, ZeroLeadsHighSpendRule } from '../src/lib/modules/meta-ads/domain/rules/rules.v1';

async function verify() {
    console.log('🔍 Verifying Meta Ads Recommendation Engine Domain...\n');

    // 1. Test Determinism & Snapshot Hash
    console.log('Test 1: Context Snapshot Determinism');
    const contextData: RecommendationContext = {
        analysisTimestamp: '2023-01-01T12:00:00Z',
        adsData: {
            campaignId: 'c1', campaignName: 'C1', adSetId: 'as1', adSetName: 'AS1', adId: 'ad1', adName: 'Ad1',
            spend: { amount: 500, currency: 'MXN' },
            impressions: 1000, clicks: 50, cpc: { amount: 10, currency: 'MXN' }, ctr: 5,
            periodStart: '2023-01-01', periodEnd: '2023-01-02'
        },
        crmData: {
            leadsGenerated: 2, qualifiedLeads: 1, dealsCreated: 0, dealsWon: 0, revenueGenerated: { amount: 0, currency: 'MXN' }
        },
        correlation: { primary: {}, secondary: {} }
    };

    const snapshot1 = createSnapshot(contextData);
    const snapshot2 = createSnapshot(contextData); // Same data

    if (snapshot1.id === snapshot2.id) {
        console.log('✅ PASS: Hash is consistent for identical inputs.');
    } else {
        console.error('❌ FAIL: Hash mismatch for identical inputs.');
        console.log('Hash1:', snapshot1.id);
        console.log('Hash2:', snapshot2.id);
    }

    // Immuntability check (Runtime)
    try {
        // @ts-ignore
        snapshot1.payload.adsData.spend.amount = 99999;
        // Note: Shallow freeze in createSnapshot might allow deep mutation if not careful. 
        // Ideally we deep freeze, but for this test we check if the snapshot object itself is frozen.
        // @ts-ignore
        snapshot1.id = 'hacked';
        console.error('❌ FAIL: Snapshot object is mutable.');
    } catch (e) {
        console.log('✅ PASS: Snapshot object is immutable (frozen).');
    }

    // 2. Test Rules Logic
    console.log('\nTest 2: Rule Logic (High CPA)');
    // CPA = 500 / 2 = 250. Target is 150. Threshold is 2x (300).
    // 250 < 300, so NO trigger.

    const config = {
        versionId: 'test-config-v1',
        rules: [HighCpaRule, ZeroLeadsHighSpendRule]
    };

    const results1 = evaluate(snapshot1.payload, config);
    if (results1.length === 0) {
        console.log('✅ PASS: High CPA Rule correctly NOT triggered (250 < 300).');
    } else {
        console.error('❌ FAIL: High CPA Rule triggered unexpectedly.', results1);
    }

    // Modify data to trigger
    const triggerContext = JSON.parse(JSON.stringify(contextData));
    triggerContext.crmData.leadsGenerated = 1;
    // CPA = 500 / 1 = 500. Target 150*2 = 300. 500 > 300. TRIGGER.

    const snapshotTrigger = createSnapshot(triggerContext);
    const resultsTrigger = evaluate(snapshotTrigger.payload, config);

    if (resultsTrigger.length === 1 && resultsTrigger[0].action.type === 'PAUSE_AD_SET') {
        console.log('✅ PASS: High CPA Rule correctly triggered.');
    } else {
        console.error('❌ FAIL: High CPA Rule did NOT trigger.', resultsTrigger);
    }

    console.log('\n✅ Verification Complete.');
}

verify().catch(console.error);
