import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { decode } from "../src/encoding.js";

const fixture = (name) =>
  new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

test("三种编码样张解码出同一文本", () => {
  const a = decode(fixture("sample-utf8.txt"));
  const b = decode(fixture("sample-utf8bom.txt"));
  const c = decode(fixture("sample-gbk.txt"));
  assert.equal(a, b);
  assert.equal(a, c);
  assert.ok(a.includes("风雪夜归人"));
  assert.ok(!a.startsWith("\uFEFF"), "BOM 应被剥掉");
});

test("非法 UTF-8 字节不抛异常，走 gb18030 兜底", () => {
  const bytes = fixture("invalid-utf8.txt");
  let out;
  assert.doesNotThrow(() => { out = decode(bytes); });
  assert.equal(typeof out, "string");
});

test("空文件返回空串", () => {
  assert.equal(decode(new Uint8Array(0)), "");
});
