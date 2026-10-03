// 纯函数：字节 → 文本。不引用任何浏览器/Node 专有 API（TextDecoder 两边内建）。
// 探测顺序：UTF-8 BOM → UTF-8 严格解码 → gb18030 兜底（gb18030 是 GBK 超集）。

export const UTF8_BOM = [0xef, 0xbb, 0xbf];

export function decode(bytes) {
  if (bytes.length >= 3
    && bytes[0] === UTF8_BOM[0] && bytes[1] === UTF8_BOM[1] && bytes[2] === UTF8_BOM[2]) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // 严格 UTF-8 失败 → gb18030 非 fatal 兜底，理论上不抛
    return new TextDecoder("gb18030").decode(bytes);
  }
}
