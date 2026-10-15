import test from 'node:test';
import assert from 'node:assert/strict';
import { cronMatches } from '../server/cron.js';

test('cron matches minute, hour and weekday in the creator time zone', () => {
  // 2026-10-19 是周一；芝加哥 09:00 = UTC 14:00
  const mon9 = new Date('2026-10-19T14:00:00Z');
  assert.equal(cronMatches('0 9 * * 1', mon9, 'America/Chicago'), true);
  assert.equal(cronMatches('0 9 * * 1', mon9, 'UTC'), false);
  assert.equal(cronMatches('0 9 * * 1-5', mon9, 'America/Chicago'), true);
  assert.equal(cronMatches('0 9 * * 0,6', mon9, 'America/Chicago'), false);
  assert.equal(cronMatches('*/15 * * * *', new Date('2026-10-19T14:30:00Z'), 'UTC'), true);
  assert.equal(cronMatches('*/15 * * * *', new Date('2026-10-19T14:31:00Z'), 'UTC'), false);
  assert.equal(cronMatches('bad', mon9, 'UTC'), false);
});
