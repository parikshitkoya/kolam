import { expect, test } from 'vitest';
import { cardAccount } from './account';

test('the result card never asks a logged-in player to log in', () => {
  expect(cardAccount('server')).toBe('user');
  expect(cardAccount('buffer')).toBe('syncing'); // logged in, offline: taps waiting to sync
  expect(cardAccount('local')).toBe('anon');
});
