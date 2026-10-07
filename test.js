const assert = require('assert');

// Extraction of calculation function for testing
function calculateQuotation(loanAmount, term, includeFuneralPolicy) {
    const adminFee = loanAmount * 0.03;
    const loyalty = 25;
    const netAdminFee = adminFee - loyalty;
    const adjustedLoanAmount = loanAmount + adminFee;
    
    let interestRate;
    switch(term) {
        case 3: interestRate = 0.125; break;
        case 6: interestRate = 0.060; break;
        case 12: interestRate = 0.060; break;
        case 18: interestRate = 0.045; break;
        case 24: interestRate = 0.040; break;
        case 36: interestRate = 0.0275; break;
        case 48: interestRate = 0.0207; break;
        default: throw new Error("Invalid term");
    }
    
    const installment = (((interestRate * adjustedLoanAmount * term) + adjustedLoanAmount) / term);
    const collectionFee = (0.015 * adjustedLoanAmount) / term;
    const funeralPolicyAmount = includeFuneralPolicy ? 12 : 0;
    
    const totalMonthlyInstallment = installment + collectionFee + funeralPolicyAmount;
    const totalCollectible = totalMonthlyInstallment * term;
    
    return {
        loanAmount,
        term,
        interestRate,
        includeFuneralPolicy,
        adminFee,
        loyalty,
        netAdminFee,
        adjustedLoanAmount,
        installment,
        collectionFee,
        funeralPolicyAmount,
        totalMonthlyInstallment,
        totalCollectible
    };
}

function runTests() {
    let passed = 0;
    let failed = 0;
    
    function testCase(name, loanAmount, term, includeFuneralPolicy, expectedTotalMonthly, expectedTotalCollectible) {
        try {
            const res = calculateQuotation(loanAmount, term, includeFuneralPolicy);
            // using closeTo for floating point checks
            if (Math.abs(res.totalMonthlyInstallment - expectedTotalMonthly) > 0.01 || 
                Math.abs(res.totalCollectible - expectedTotalCollectible) > 0.01) {
                console.error(`Test '${name}' FAILED: 
                    Expected Monthly ${expectedTotalMonthly}, Got ${res.totalMonthlyInstallment}
                    Expected Total ${expectedTotalCollectible}, Got ${res.totalCollectible}`);
                failed++;
            } else {
                console.log(`Test '${name}' PASSED`);
                passed++;
            }
        } catch (e) {
            console.error(`Test '${name}' FAILED with error: ${e.message}`);
            failed++;
        }
    }
    
    console.log("Running calculation tests against Excel values...");
    
    // Excel values tested from Python extraction
    // row 2: 4000, 3 months, yes -> 1920.933333, 5762.80
    testCase("4000, 3 months, yes", 4000, 3, true, 1920.933, 5762.80);
    // row 3: 4000, 6 months, yes -> 956.166667, 5737.00
    testCase("4000, 6 months, yes", 4000, 6, true, 956.167, 5737.00);
    // row 60: 30000, 24 months, yes 
    // adjusted: 30000 + 900 = 30900. Int: 0.04 * 30900 * 24 = 29664. Total princ + int = 60564
    // Wait, let's verify row 60 with python manually or just test the logic
    
    // Minimum/Maximum loans bounds test (no values to compare, just ensuring they don't crash)
    testCase("50000, 48 months, no", 50000, 48, false, 2155.06, 103442.9);
    
    console.log(`\nTests completed. Passed: ${passed}, Failed: ${failed}`);
    if (failed > 0) process.exit(1);
}

runTests();
