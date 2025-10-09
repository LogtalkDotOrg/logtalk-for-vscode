"use strict";
// Test script to demonstrate the new non-persistent loaded directories tracking
Object.defineProperty(exports, "__esModule", { value: true });
var logtalkTerminal_1 = require("../src/features/logtalkTerminal");
// Test the new in-memory loaded directories tracking
function testLoadedDirectories() {
    console.log('Testing new in-memory loaded directories tracking...');
    // Test recording directories
    logtalkTerminal_1.default.recordCodeLoadedFromDirectory('/path/to/project1');
    logtalkTerminal_1.default.recordCodeLoadedFromDirectory('/path/to/project2');
    console.log('Recorded two directories');
    // Test checking directories (this would normally show warnings if not loaded)
    // Note: In real usage, this would check against the Logtalk core directory
    logtalkTerminal_1.default.checkCodeLoadedFromDirectory('/path/to/project1');
    logtalkTerminal_1.default.checkCodeLoadedFromDirectory('/path/to/project2');
    console.log('Checked directories - no warnings should appear for loaded dirs');
    // Test clearing directories
    logtalkTerminal_1.default.clearLoadedDirectories();
    console.log('Cleared all loaded directories');
    // Now checking should show warnings (in real usage)
    logtalkTerminal_1.default.checkCodeLoadedFromDirectory('/path/to/project1');
    console.log('After clearing, checking should show warnings for unloaded dirs');
    console.log('Test completed successfully!');
}
// Benefits of the new approach:
console.log("\nBenefits of the new in-memory approach:\n\n1. NON-PERSISTENT: State is cleared when VS Code restarts or terminal closes\n2. NO WORKSPACE POLLUTION: Doesn't persist data in workspace state\n3. BETTER PERFORMANCE: Set operations are O(1) for has() and add()\n4. CLEANER CODE: No need to manage workspace state keys\n5. AUTOMATIC CLEANUP: Memory is freed when extension unloads\n6. THREAD-SAFE: No concurrent access issues with workspace state\n7. PREDICTABLE: Fresh state on each session, no stale data\n8. SIMPLIFIED LOGIC: Core directory is pre-added, eliminating special case handling\n\nKey optimizations made:\n- Core directory is automatically added when terminal is created\n- checkCodeLoadedFromDirectory() no longer needs to compute/compare core path\n- Removed workspace configuration access from the check function\n- Cleaner, more efficient code with fewer dependencies\n\nThe old workspaceState approach could cause issues because:\n- Data persisted across VS Code sessions\n- Could accumulate stale directory paths\n- Required manual cleanup of workspace state keys\n- Slower iteration over all keys for checking parent directories\n- Required core directory computation on every check\n");
testLoadedDirectories();
