import * as assert from 'assert';
import * as vscode from 'vscode';
import { LogtalkRenameProvider } from '../src/features/renameProvider';

suite('LogtalkRenameProvider Test Suite', () => {
  let renameProvider: LogtalkRenameProvider;

  setup(() => {
    renameProvider = new LogtalkRenameProvider();
  });

  test('isValidPredicateName - valid regular atom', () => {
    // Use reflection to access private method for testing
    const isValid = (renameProvider as any).isValidPredicateName('hello');
    assert.strictEqual(isValid, true);
  });

  test('isValidPredicateName - valid atom with underscores and digits', () => {
    const isValid = (renameProvider as any).isValidPredicateName('hello_world_123');
    assert.strictEqual(isValid, true);
  });

  test('isValidPredicateName - valid quoted atom', () => {
    const isValid = (renameProvider as any).isValidPredicateName("'Hello World'");
    assert.strictEqual(isValid, true);
  });

  test('isValidPredicateName - invalid atom starting with uppercase', () => {
    const isValid = (renameProvider as any).isValidPredicateName('Hello');
    assert.strictEqual(isValid, false);
  });

  test('isValidPredicateName - invalid atom starting with digit', () => {
    const isValid = (renameProvider as any).isValidPredicateName('123hello');
    assert.strictEqual(isValid, false);
  });

  test('isValidPredicateName - invalid atom starting with underscore', () => {
    const isValid = (renameProvider as any).isValidPredicateName('_hello');
    assert.strictEqual(isValid, false);
  });

  test('isValidPredicateName - invalid empty quoted atom', () => {
    const isValid = (renameProvider as any).isValidPredicateName("''");
    assert.strictEqual(isValid, false);
  });

  test('isValidPredicateName - invalid unmatched quotes', () => {
    const isValid = (renameProvider as any).isValidPredicateName("'hello");
    assert.strictEqual(isValid, false);
  });

  test('isValidPredicateName - invalid special characters', () => {
    const isValid = (renameProvider as any).isValidPredicateName('hello@world');
    assert.strictEqual(isValid, false);
  });

  test('isValidPredicateName - empty string', () => {
    const isValid = (renameProvider as any).isValidPredicateName('');
    assert.strictEqual(isValid, false);
  });

  test('findPredicateRangesInLine - simple predicate call', () => {
    const ranges = (renameProvider as any).findPredicateRangesInLine('    hello_world.', 'hello_world', 0);
    assert.strictEqual(ranges.length, 1);
    assert.strictEqual(ranges[0].start.character, 4);
    assert.strictEqual(ranges[0].end.character, 15);
  });

  test('findPredicateRangesInLine - predicate with arguments', () => {
    const ranges = (renameProvider as any).findPredicateRangesInLine('    hello_world(X).', 'hello_world', 0);
    assert.strictEqual(ranges.length, 1);
    assert.strictEqual(ranges[0].start.character, 4);
    assert.strictEqual(ranges[0].end.character, 15);
  });

  test('findPredicateRangesInLine - quoted predicate', () => {
    const ranges = (renameProvider as any).findPredicateRangesInLine("    'special name'.", "'special name'", 0);
    assert.strictEqual(ranges.length, 1);
    assert.strictEqual(ranges[0].start.character, 4);
    assert.strictEqual(ranges[0].end.character, 18);
  });

  test('isValidPredicateContext - valid context', () => {
    const isValid = (renameProvider as any).isValidPredicateContext('    hello_world.', 4, 15);
    assert.strictEqual(isValid, true);
  });

  test('isValidPredicateContext - inside comment', () => {
    const isValid = (renameProvider as any).isValidPredicateContext('    % hello_world', 6, 17);
    assert.strictEqual(isValid, false);
  });

  test('isValidPredicateContext - inside string', () => {
    const isValid = (renameProvider as any).isValidPredicateContext('    write("hello_world").', 11, 22);
    assert.strictEqual(isValid, false);
  });

  test('isValidPredicateContext - in scope directive', () => {
    const isValid = (renameProvider as any).isValidPredicateContext('    :- public(hello_world/0).', 15, 26);
    assert.strictEqual(isValid, true);
  });

  test('findPredicateRangesInLine - in scope directive', () => {
    const ranges = (renameProvider as any).findPredicateRangesInLine('    :- public(hello_world/0).', 'hello_world', 0);
    assert.strictEqual(ranges.length, 1);
    assert.strictEqual(ranges[0].start.character, 15);
    assert.strictEqual(ranges[0].end.character, 26);
  });

  test('isValidLocation - valid location', () => {
    const location = {
      uri: { toString: () => 'file:///test.lgt' },
      range: { start: { line: 5, character: 10 }, end: { line: 5, character: 20 } }
    };
    const isValid = (renameProvider as any).isValidLocation(location);
    assert.strictEqual(isValid, true);
  });

  test('isValidLocation - invalid negative line', () => {
    const location = {
      uri: { toString: () => 'file:///test.lgt' },
      range: { start: { line: -1, character: 10 }, end: { line: 5, character: 20 } }
    };
    const isValid = (renameProvider as any).isValidLocation(location);
    assert.strictEqual(isValid, false);
  });

  test('isDirectiveComplete - complete directive', () => {
    const isComplete = (renameProvider as any).isDirectiveComplete(':- public(hello/0).');
    assert.strictEqual(isComplete, true);
  });

  test('isDirectiveComplete - incomplete directive', () => {
    const isComplete = (renameProvider as any).isDirectiveComplete(':- public(hello/0');
    assert.strictEqual(isComplete, false);
  });

  test('findPredicateRangesInText - simple text', () => {
    const ranges = (renameProvider as any).findPredicateRangesInText('hello_world/0', 'hello_world');
    assert.strictEqual(ranges.length, 1);
    assert.strictEqual(ranges[0].start, 0);
    assert.strictEqual(ranges[0].end, 11);
  });

  test('isValidPredicateContextInText - predicate indicator', () => {
    const isValid = (renameProvider as any).isValidPredicateContextInText('hello_world/0', 0, 11);
    assert.strictEqual(isValid, true);
  });

  test('isValidPredicateContextInText - mode directive', () => {
    const isValid = (renameProvider as any).isValidPredicateContextInText('mode(hello_world(+atom), one)', 5, 16);
    assert.strictEqual(isValid, true);
  });

  test('isValidPredicateContextInText - predicate call', () => {
    const isValid = (renameProvider as any).isValidPredicateContextInText('hello_world(arg)', 0, 11);
    assert.strictEqual(isValid, true);
  });

  test('findPredicateRangesInText - should not match partial words', () => {
    const ranges = (renameProvider as any).findPredicateRangesInText('hello_world_extended', 'hello_world');
    assert.strictEqual(ranges.length, 0);
  });

  test('isEntityBoundary - object start', () => {
    const isBoundary = (renameProvider as any).isEntityBoundary(':- object(test).');
    assert.strictEqual(isBoundary, true);
  });

  test('isEntityBoundary - object end', () => {
    const isBoundary = (renameProvider as any).isEntityBoundary(':- end_object.');
    assert.strictEqual(isBoundary, true);
  });

  test('isEntityBoundary - regular line', () => {
    const isBoundary = (renameProvider as any).isEntityBoundary('hello_world :- write(hello).');
    assert.strictEqual(isBoundary, false);
  });

  test('isDifferentPredicateClause - different predicate', () => {
    const isDifferent = (renameProvider as any).isDifferentPredicateClause('other_pred :- true.', 'hello_world');
    assert.strictEqual(isDifferent, true);
  });

  test('isDifferentPredicateClause - same predicate', () => {
    const isDifferent = (renameProvider as any).isDifferentPredicateClause('hello_world :- true.', 'hello_world');
    assert.strictEqual(isDifferent, false);
  });

  test('isPredicateClause - valid clause', () => {
    const isClause = (renameProvider as any).isPredicateClause('hello_world :- true.', 'hello_world');
    assert.strictEqual(isClause, true);
  });

  test('isPredicateClause - invalid clause', () => {
    const isClause = (renameProvider as any).isPredicateClause('other_pred :- true.', 'hello_world');
    assert.strictEqual(isClause, false);
  });

  test('deduplicateLocations - removes duplicates', () => {
    const location1 = {
      uri: { toString: () => 'file:///test.lgt' },
      range: { start: { line: 1, character: 5 }, end: { line: 1, character: 10 } }
    };
    const location2 = {
      uri: { toString: () => 'file:///test.lgt' },
      range: { start: { line: 1, character: 5 }, end: { line: 1, character: 10 } }
    };
    const location3 = {
      uri: { toString: () => 'file:///test.lgt' },
      range: { start: { line: 2, character: 0 }, end: { line: 2, character: 5 } }
    };

    const locations = [location1, location2, location3];
    const unique = (renameProvider as any).deduplicateLocations(locations);
    assert.strictEqual(unique.length, 2);
  });

  test('deduplicateLocations - sorts by position', () => {
    const location1 = {
      uri: { toString: () => 'file:///test.lgt' },
      range: { start: { line: 2, character: 0 }, end: { line: 2, character: 5 } }
    };
    const location2 = {
      uri: { toString: () => 'file:///test.lgt' },
      range: { start: { line: 1, character: 5 }, end: { line: 1, character: 10 } }
    };

    const locations = [location1, location2];
    const sorted = (renameProvider as any).deduplicateLocations(locations);
    assert.strictEqual(sorted[0].range.start.line, 1);
    assert.strictEqual(sorted[1].range.start.line, 2);
  });
});
