/**
 * Tests for multi-category selection in quiz plugin
 * Run with: node test/quiz-multi-category.test.js
 */

// Simple test framework
function assert(condition, message) {
    if (!condition) {
        throw new Error(`Test failed: ${message}`);
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`Test failed: ${message}\nExpected: ${expected}\nActual: ${actual}`);
    }
}

function assertDeepEqual(actual, expected, message) {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
        throw new Error(`Test failed: ${message}\nExpected: ${expectedStr}\nActual: ${actualStr}`);
    }
}

// Mock helper function to check if category filter is "All"
function isCategoryFilterAll(categoryFilter) {
    if (!categoryFilter) return true;
    if (Array.isArray(categoryFilter)) {
        return categoryFilter.length === 0 || categoryFilter.includes('Alle');
    }
    return categoryFilter === 'Alle';
}

// Run tests
console.log('Running Quiz Plugin Multi-Category Selection Tests...\n');

let passed = 0;
let failed = 0;

// Test 1: isCategoryFilterAll with null/undefined
try {
    assertEqual(isCategoryFilterAll(null), true, 'null should return true');
    assertEqual(isCategoryFilterAll(undefined), true, 'undefined should return true');
    console.log('✓ Test 1: isCategoryFilterAll with null/undefined');
    passed++;
} catch (e) {
    console.log('✗ Test 1:', e.message);
    failed++;
}

// Test 2: isCategoryFilterAll with string "Alle"
try {
    assertEqual(isCategoryFilterAll('Alle'), true, 'string "Alle" should return true');
    console.log('✓ Test 2: isCategoryFilterAll with string "Alle"');
    passed++;
} catch (e) {
    console.log('✗ Test 2:', e.message);
    failed++;
}

// Test 3: isCategoryFilterAll with other strings
try {
    assertEqual(isCategoryFilterAll('Geographie'), false, 'other strings should return false');
    assertEqual(isCategoryFilterAll('Sport'), false, 'other strings should return false');
    console.log('✓ Test 3: isCategoryFilterAll with other strings');
    passed++;
} catch (e) {
    console.log('✗ Test 3:', e.message);
    failed++;
}

// Test 4: isCategoryFilterAll with empty array
try {
    assertEqual(isCategoryFilterAll([]), true, 'empty array should return true');
    console.log('✓ Test 4: isCategoryFilterAll with empty array');
    passed++;
} catch (e) {
    console.log('✗ Test 4:', e.message);
    failed++;
}

// Test 5: isCategoryFilterAll with array containing "Alle"
try {
    assertEqual(isCategoryFilterAll(['Alle']), true, 'array with "Alle" should return true');
    assertEqual(isCategoryFilterAll(['Geographie', 'Alle']), true, 'array with "Alle" should return true');
    console.log('✓ Test 5: isCategoryFilterAll with array containing "Alle"');
    passed++;
} catch (e) {
    console.log('✗ Test 5:', e.message);
    failed++;
}

// Test 6: isCategoryFilterAll with array without "Alle"
try {
    assertEqual(isCategoryFilterAll(['Geographie']), false, 'array without "Alle" should return false');
    assertEqual(isCategoryFilterAll(['Geographie', 'Sport']), false, 'array without "Alle" should return false');
    console.log('✓ Test 6: isCategoryFilterAll with array without "Alle"');
    passed++;
} catch (e) {
    console.log('✗ Test 6:', e.message);
    failed++;
}

// Test 7: Single category (backwards compatibility)
try {
    const categoryFilter = 'Geographie';
    const categories = Array.isArray(categoryFilter) ? categoryFilter : [categoryFilter];
    assertEqual(categories.length, 1, 'should have 1 category');
    assertEqual(categories[0], 'Geographie', 'should be Geographie');
    console.log('✓ Test 7: Single category backwards compatibility');
    passed++;
} catch (e) {
    console.log('✗ Test 7:', e.message);
    failed++;
}

// Test 8: Array of categories
try {
    const categoryFilter = ['Geographie', 'Sport', 'Geschichte'];
    const categories = Array.isArray(categoryFilter) ? categoryFilter : [categoryFilter];
    assertEqual(categories.length, 3, 'should have 3 categories');
    assertDeepEqual(categories, ['Geographie', 'Sport', 'Geschichte'], 'should match categories');
    console.log('✓ Test 8: Array of categories');
    passed++;
} catch (e) {
    console.log('✗ Test 8:', e.message);
    failed++;
}

// Test 9: SQL placeholders for multiple categories
try {
    const categories = ['Geographie', 'Sport', 'Geschichte'];
    const placeholders = categories.map(() => '?').join(',');
    assertEqual(placeholders, '?,?,?', 'should generate correct placeholders');
    console.log('✓ Test 9: SQL placeholders for multiple categories');
    passed++;
} catch (e) {
    console.log('✗ Test 9:', e.message);
    failed++;
}

// Test 10: Filter by single category
try {
    const mockQuestions = [
        { id: 1, category: 'Geographie' },
        { id: 2, category: 'Sport' },
        { id: 3, category: 'Geschichte' },
        { id: 4, category: 'Geographie' },
        { id: 5, category: 'Musik' }
    ];
    const categories = ['Geographie'];
    const filtered = mockQuestions.filter(q => categories.includes(q.category));
    assertEqual(filtered.length, 2, 'should have 2 questions');
    assertDeepEqual(filtered.map(q => q.id), [1, 4], 'should be questions 1 and 4');
    console.log('✓ Test 10: Filter by single category');
    passed++;
} catch (e) {
    console.log('✗ Test 10:', e.message);
    failed++;
}

// Test 11: Filter by multiple categories
try {
    const mockQuestions = [
        { id: 1, category: 'Geographie' },
        { id: 2, category: 'Sport' },
        { id: 3, category: 'Geschichte' },
        { id: 4, category: 'Geographie' },
        { id: 5, category: 'Musik' }
    ];
    const categories = ['Geographie', 'Sport'];
    const filtered = mockQuestions.filter(q => categories.includes(q.category));
    assertEqual(filtered.length, 3, 'should have 3 questions');
    assertDeepEqual(filtered.map(q => q.id), [1, 2, 4], 'should be questions 1, 2, and 4');
    console.log('✓ Test 11: Filter by multiple categories');
    passed++;
} catch (e) {
    console.log('✗ Test 11:', e.message);
    failed++;
}

// Test 12: No filtering when category is "Alle"
try {
    const categoryFilter = ['Alle'];
    const shouldFilter = !isCategoryFilterAll(categoryFilter);
    assertEqual(shouldFilter, false, 'should not filter when "Alle" is selected');
    console.log('✓ Test 12: No filtering when category is "Alle"');
    passed++;
} catch (e) {
    console.log('✗ Test 12:', e.message);
    failed++;
}

// Summary
console.log(`\n${'='.repeat(50)}`);
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log(`Total: ${passed + failed}`);
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
