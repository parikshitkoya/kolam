import { expect, test } from 'vitest';
import { MESSAGE_MAX, cleanMessage, commentText, communityLine, trailText, verdictText } from './result';
import type { Result } from './api';

test('verdictText', () => {
  expect(verdictText(4, 4, 0)).toBe('Perfect. 4 taps, right on par.');
  expect(verdictText(6, 4, 0)).toBe('6 taps, 2 over par.');
  expect(verdictText(5, 4, 1)).toBe('5 taps, 1 over par. 1 hint used.');
  expect(verdictText(6, 4, 2)).toBe('6 taps, 2 over par. 2 hints used.');
  expect(verdictText(1, 1, 0)).toBe('Perfect. 1 tap, right on par.');
});

test('trailText', () => {
  expect(trailText([6, 4, 2, 1])).toBe('6 › 4 › 2 › 1');
});

test('communityLine', () => {
  expect(communityLine({ players: 10, solved: 8, over: [3, 1, 0, 0, 0, 4] })).toBe('38% of players matched par.');
  expect(communityLine({ players: 3, solved: 0, over: [0, 0, 0, 0, 0, 0] })).toBeNull();
});

const R: Result = {
  trail: [6, 4, 2, 1],
  taps: 3,
  par: 3,
  hints: 0,
  streak: null,
  stats: { players: 1, solved: 1, over: [1, 0, 0, 0, 0, 0] },
};

test('commentText', () => {
  expect(commentText(3, R, null)).toBe('Kolam No. 3: 6 › 4 › 2 › 1  (3 taps, par 3)');
  expect(commentText(3, R, 'Nice one')).toBe('Kolam No. 3: 6 › 4 › 2 › 1  (3 taps, par 3)\n\nNice one');
});

test('cleanMessage', () => {
  expect(cleanMessage('  ')).toBeNull();
  expect(cleanMessage(undefined)).toBeNull();
  expect(cleanMessage(42)).toBeNull();
  expect(cleanMessage('  hi  ')).toBe('hi');
  expect(cleanMessage('x'.repeat(MESSAGE_MAX + 20))?.length).toBe(MESSAGE_MAX);
});
