import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv, applyEnv } from '../../server/env.ts';

test('parseEnv: 基础键值与注释', () => {
  const r = parseEnv(['# comment', 'PLAIN=plainvalue', ''].join('\n'));
  assert.equal(r.PLAIN, 'plainvalue');
  assert.equal(Object.keys(r).length, 1);
});

test('parseEnv: 引号与行尾注释', () => {
  const r = parseEnv(
    [
      'QUOTED="quoted value"',
      "SINGLE='single value'",
      'SPACED =  spaced  ',
      'WITH=v # c',
      'QUOTED_HASH="v # c"',
    ].join('\n')
  );
  assert.equal(r.QUOTED, 'quoted value');
  assert.equal(r.SINGLE, 'single value');
  assert.equal(r.SPACED, 'spaced');
  assert.equal(r.WITH, 'v'); // 未加引号 → 截断 ' #' 之后
  assert.equal(r.QUOTED_HASH, 'v # c'); // 加引号 → 保留
});

test('parseEnv: export 前缀（含多空格）与含等号的值', () => {
  const r = parseEnv(['export FOO=bar', 'export  BAZ=qux', 'EQ=a=b=c'].join('\n'));
  assert.equal(r.FOO, 'bar');
  assert.equal(r.BAZ, 'qux');
  assert.equal(r.EQ, 'a=b=c');
});

test('parseEnv: 空值与非法行被跳过', () => {
  const r = parseEnv(['EMPTY=', 'no equals sign', '1BAD=x', ' spaced'].join('\n'));
  assert.equal(r.EMPTY, '');
  assert.equal('no equals sign' in r, false);
  assert.equal('1BAD' in r, false);
  assert.equal('spaced' in r, false);
});

test('parseEnv: 容忍 CRLF', () => {
  const r = parseEnv('A=1\r\nB=2\r\n');
  assert.equal(r.A, '1');
  assert.equal(r.B, '2');
});

test('applyEnv: 不覆盖已存在的键，写入未定义的键', () => {
  const target: Record<string, string | undefined> = { EXISTING: 'keepme' };
  const written = applyEnv('EXISTING=changed\nNEW=fresh', target);
  assert.equal(target.EXISTING, 'keepme');
  assert.equal(target.NEW, 'fresh');
  assert.deepEqual(written, ['NEW']);
});
