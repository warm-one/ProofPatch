import { createHash } from "node:crypto";

/**
 * 规范化序列化：同一份数据无论键顺序如何，都必须得到同一个哈希。
 * 回执的可校验性完全依赖这个函数，因此规则要写死：
 * - 对象键按字典序排序
 * - 值为 undefined 的键直接跳过（等价于该字段不存在）
 * - 数组保持原顺序，元素按同一规则递归
 */
export function canonicalize(value) {
  if (value === null) return "null";
  if (value === undefined) return "null";

  const type = typeof value;
  if (type === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("规范化序列化不接受 NaN 或 Infinity。");
    }
    return JSON.stringify(value);
  }
  if (type === "string" || type === "boolean") {
    return JSON.stringify(value);
  }
  if (type === "bigint") return JSON.stringify(value.toString());

  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalize(item));
    return `[${items.join(",")}]`;
  }
  if (type === "object") {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort();
    const pairs = keys.map(
      (key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`,
    );
    return `{${pairs.join(",")}}`;
  }

  throw new TypeError(`规范化序列化遇到不支持的类型：${type}`);
}

export function sha256Hex(input) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** 返回带算法前缀的摘要，便于回执里显式标明算法而不靠文档约定。 */
export function digestOf(value) {
  return `sha256:${sha256Hex(canonicalize(value))}`;
}

/** 对任意字节内容求摘要（补丁文件、输出文本等）。 */
export function digestOfText(text) {
  return `sha256:${sha256Hex(text)}`;
}
