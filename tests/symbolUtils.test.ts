import * as assert from 'assert';
import { SymbolUtils, SymbolRegexes } from '../src/utils/symbols';

suite('SymbolUtils Test Suite', () => {
  
  suite('extractPredicateName function', () => {
    test('should extract name from predicates with arguments', () => {
      assert.strictEqual(SymbolUtils.extractPredicateName('foo(X, Y)'), 'foo');
      assert.strictEqual(SymbolUtils.extractPredicateName('bar(X)'), 'bar');
      assert.strictEqual(SymbolUtils.extractPredicateName('complex_predicate(A, B, C)'), 'complex_predicate');
    });

    test('should extract name from predicates with zero arguments', () => {
      assert.strictEqual(SymbolUtils.extractPredicateName('foo'), 'foo');
      assert.strictEqual(SymbolUtils.extractPredicateName('simple_fact'), 'simple_fact');
      assert.strictEqual(SymbolUtils.extractPredicateName('test_predicate'), 'test_predicate');
    });

    test('should handle quoted predicate names', () => {
      assert.strictEqual(SymbolUtils.extractPredicateName("'quoted predicate'"), "'quoted predicate'");
      assert.strictEqual(SymbolUtils.extractPredicateName("'quoted predicate'(X)"), "'quoted predicate'");
    });

    test('should return null for invalid input', () => {
      assert.strictEqual(SymbolUtils.extractPredicateName('invalid('), null);
      assert.strictEqual(SymbolUtils.extractPredicateName(''), null);
      assert.strictEqual(SymbolUtils.extractPredicateName('123invalid'), null);
    });
  });

  suite('extractNonTerminalName function', () => {
    test('should extract name from non-terminals with arguments', () => {
      assert.strictEqual(SymbolUtils.extractNonTerminalName('phrase(X)'), 'phrase');
      assert.strictEqual(SymbolUtils.extractNonTerminalName('sentence(S)'), 'sentence');
      assert.strictEqual(SymbolUtils.extractNonTerminalName('complex_nt(A, B)'), 'complex_nt');
    });

    test('should extract name from non-terminals with zero arguments', () => {
      assert.strictEqual(SymbolUtils.extractNonTerminalName('determiner'), 'determiner');
      assert.strictEqual(SymbolUtils.extractNonTerminalName('start'), 'start');
      assert.strictEqual(SymbolUtils.extractNonTerminalName('noun_phrase'), 'noun_phrase');
    });

    test('should handle quoted non-terminal names', () => {
      assert.strictEqual(SymbolUtils.extractNonTerminalName("'quoted non-terminal'"), "'quoted non-terminal'");
      assert.strictEqual(SymbolUtils.extractNonTerminalName("'quoted non-terminal'(X)"), "'quoted non-terminal'");
    });

    test('should return null for invalid input', () => {
      assert.strictEqual(SymbolUtils.extractNonTerminalName('invalid('), null);
      assert.strictEqual(SymbolUtils.extractNonTerminalName(''), null);
      assert.strictEqual(SymbolUtils.extractNonTerminalName('123invalid'), null);
    });
  });

  suite('extractPredicateIndicator function', () => {
    test('should extract indicator from predicates with arguments', () => {
      assert.strictEqual(SymbolUtils.extractPredicateIndicator('foo(X, Y)'), 'foo/2');
      assert.strictEqual(SymbolUtils.extractPredicateIndicator('bar(X)'), 'bar/1');
      assert.strictEqual(SymbolUtils.extractPredicateIndicator('complex_predicate(A, B, C)'), 'complex_predicate/3');
    });

    test('should extract indicator from predicates with zero arguments', () => {
      assert.strictEqual(SymbolUtils.extractPredicateIndicator('foo'), 'foo/0');
      assert.strictEqual(SymbolUtils.extractPredicateIndicator('simple_fact'), 'simple_fact/0');
      assert.strictEqual(SymbolUtils.extractPredicateIndicator('test_predicate'), 'test_predicate/0');
    });

    test('should handle quoted predicate names', () => {
      assert.strictEqual(SymbolUtils.extractPredicateIndicator("'quoted predicate'"), "'quoted predicate'/0");
      assert.strictEqual(SymbolUtils.extractPredicateIndicator("'quoted predicate'(X)"), "'quoted predicate'/1");
    });

    test('should handle empty argument lists', () => {
      assert.strictEqual(SymbolUtils.extractPredicateIndicator('foo()'), 'foo/0');
    });

    test('should handle nested structures', () => {
      assert.strictEqual(SymbolUtils.extractPredicateIndicator('complex([a,b,c], f(x,y), {z})'), 'complex/3');
      assert.strictEqual(SymbolUtils.extractPredicateIndicator('nested(foo(bar([1,2]), baz))'), 'nested/1');
      assert.strictEqual(SymbolUtils.extractPredicateIndicator('deep([{a: [1,2]}, {b: [3,4]}])'), 'deep/1');
    });

    test('should return null for invalid input', () => {
      assert.strictEqual(SymbolUtils.extractPredicateIndicator('invalid('), null);
      assert.strictEqual(SymbolUtils.extractPredicateIndicator(''), null);
      assert.strictEqual(SymbolUtils.extractPredicateIndicator('123invalid'), null);
    });
  });

  suite('extractNonTerminalIndicator function', () => {
    test('should extract indicator from non-terminals with arguments', () => {
      assert.strictEqual(SymbolUtils.extractNonTerminalIndicator('phrase(X)'), 'phrase//1');
      assert.strictEqual(SymbolUtils.extractNonTerminalIndicator('sentence(S, T)'), 'sentence//2');
      assert.strictEqual(SymbolUtils.extractNonTerminalIndicator('complex_nt(A, B)'), 'complex_nt//2');
    });

    test('should extract indicator from non-terminals with zero arguments', () => {
      assert.strictEqual(SymbolUtils.extractNonTerminalIndicator('determiner'), 'determiner//0');
      assert.strictEqual(SymbolUtils.extractNonTerminalIndicator('start'), 'start//0');
      assert.strictEqual(SymbolUtils.extractNonTerminalIndicator('noun_phrase'), 'noun_phrase//0');
    });

    test('should handle quoted non-terminal names', () => {
      assert.strictEqual(SymbolUtils.extractNonTerminalIndicator("'quoted non-terminal'"), "'quoted non-terminal'//0");
      assert.strictEqual(SymbolUtils.extractNonTerminalIndicator("'quoted non-terminal'(X)"), "'quoted non-terminal'//1");
    });

    test('should handle empty argument lists', () => {
      assert.strictEqual(SymbolUtils.extractNonTerminalIndicator('phrase()'), 'phrase//0');
    });

    test('should handle nested structures', () => {
      assert.strictEqual(SymbolUtils.extractNonTerminalIndicator('complex([a,b,c], f(x,y), {z})'), 'complex//3');
      assert.strictEqual(SymbolUtils.extractNonTerminalIndicator('nested(foo(bar([1,2]), baz))'), 'nested//1');
      assert.strictEqual(SymbolUtils.extractNonTerminalIndicator('deep([{a: [1,2]}, {b: [3,4]}])'), 'deep//1');
    });

    test('should return null for invalid input', () => {
      assert.strictEqual(SymbolUtils.extractNonTerminalIndicator('invalid('), null);
      assert.strictEqual(SymbolUtils.extractNonTerminalIndicator(''), null);
      assert.strictEqual(SymbolUtils.extractNonTerminalIndicator('123invalid'), null);
    });
  });

  suite('predicateClause regex', () => {
    test('should match predicate clauses with arguments', () => {
      const match1 = 'foo(X, Y) :- bar(X), baz(Y).'.match(SymbolRegexes.predicateClause);
      assert.strictEqual(match1?.[1], 'foo(X, Y)');

      const match2 = 'fact(data).'.match(SymbolRegexes.predicateClause);
      assert.strictEqual(match2?.[1], 'fact(data)');
    });

    test('should match predicate clauses with zero arguments', () => {
      const match1 = 'simple_fact.'.match(SymbolRegexes.predicateClause);
      assert.strictEqual(match1?.[1], 'simple_fact');

      const match2 = 'start :- initialize.'.match(SymbolRegexes.predicateClause);
      assert.strictEqual(match2?.[1], 'start');

      const match3 = '    indented_fact.'.match(SymbolRegexes.predicateClause);
      assert.strictEqual(match3?.[1], 'indented_fact');
    });

    test('should match quoted predicate names', () => {
      const match = "'quoted predicate'(X) :- true.".match(SymbolRegexes.predicateClause);
      assert.strictEqual(match?.[1], "'quoted predicate'(X)");
    });

    test('should not match invalid patterns', () => {
      assert.strictEqual('not_a_clause'.match(SymbolRegexes.predicateClause), null);
      assert.strictEqual(':- directive.'.match(SymbolRegexes.predicateClause), null);
      assert.strictEqual('123invalid.'.match(SymbolRegexes.predicateClause), null);
    });
  });

  suite('nonTerminalRule regex', () => {
    test('should match DCG rules with arguments', () => {
      const match1 = 'sentence(S) --> noun_phrase(NP), verb_phrase(VP).'.match(SymbolRegexes.nonTerminalRule);
      assert.strictEqual(match1?.[1], 'sentence(S)');

      const match2 = 'determiner(the) --> [the].'.match(SymbolRegexes.nonTerminalRule);
      assert.strictEqual(match2?.[1], 'determiner(the)');
    });

    test('should match DCG rules with zero arguments', () => {
      const match1 = 'start --> [].'.match(SymbolRegexes.nonTerminalRule);
      assert.strictEqual(match1?.[1], 'start');

      const match2 = 'empty_rule --> { true }.'.match(SymbolRegexes.nonTerminalRule);
      assert.strictEqual(match2?.[1], 'empty_rule');

      const match3 = '    indented --> [word].'.match(SymbolRegexes.nonTerminalRule);
      assert.strictEqual(match3?.[1], 'indented');
    });

    test('should match quoted non-terminal names', () => {
      const match = "'quoted nt'(X) --> [X].".match(SymbolRegexes.nonTerminalRule);
      assert.strictEqual(match?.[1], "'quoted nt'(X)");
    });

    test('should not match invalid patterns', () => {
      assert.strictEqual('not_dcg :- true.'.match(SymbolRegexes.nonTerminalRule), null);
      assert.strictEqual('fact.'.match(SymbolRegexes.nonTerminalRule), null);
      assert.strictEqual('123invalid --> [].'.match(SymbolRegexes.nonTerminalRule), null);
    });
  });
});
