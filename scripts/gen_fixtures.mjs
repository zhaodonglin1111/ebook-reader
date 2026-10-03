// 一次性样张生成脚本（TECH.md 第 7 节：GBK 样张由一次性脚本生成后入库）。
// 运行：node scripts/gen_fixtures.mjs（GBK 编码在 Windows 下另用系统代码页 936 转出）
import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync("tests/fixtures", { recursive: true });

const lines = [
  "楔子",
  "　　大雪封山，古驿站内只剩一盏残灯。",
  "第一章 风雪夜归人",
  "　　他推门进来时，带进一身寒气。",
  "第二章　山神庙",
  "　　庙里供着一尊缺了手臂的泥像。",
  "他说：第一章节很重要，不能跳过。",
  "　　山道迤逦，走了半日方到镇口。",
  "番外一 旧时月色",
  "　　年少时读过的句子，大多忘了。",
  "尾声",
  "　　故事到这里就结束了。",
];
const text = lines.join("\n") + "\n";

const utf8 = Buffer.from(text, "utf8");
writeFileSync("tests/fixtures/sample-utf8.txt", utf8);
writeFileSync("tests/fixtures/sample-utf8bom.txt",
  Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8]));
writeFileSync("tests/fixtures/invalid-utf8.txt",
  Buffer.from([0xff, 0xfe, 0x41, 0x00, 0xc3, 0x24]));
console.log("wrote sample-utf8 / sample-utf8bom / invalid-utf8");
