"""购物车领域逻辑。

金额一律以「分」为单位的整数保存，避免浮点误差。
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CartLine:
    """购物车中的一行：同一 SKU 会合并成一行。"""

    sku: str
    unit_price: int
    quantity: int


class Cart:
    """一个最小可用的购物车。"""

    def __init__(self) -> None:
        self._lines: dict[str, CartLine] = {}

    def add(self, sku: str, unit_price: int, quantity: int = 1) -> None:
        """加入商品；同 SKU 累加数量。"""
        if quantity <= 0:
            raise ValueError("数量必须为正数")
        if unit_price < 0:
            raise ValueError("单价不能为负数")

        existing = self._lines.get(sku)
        if existing is None:
            self._lines[sku] = CartLine(sku, unit_price, quantity)
        else:
            self._lines[sku] = CartLine(
                sku, existing.unit_price, existing.quantity + quantity
            )

    def remove(self, sku: str) -> None:
        """移除一行；不存在时静默忽略。"""
        self._lines.pop(sku, None)

    def subtotal(self) -> int:
        """返回小计金额（分）。空购物车为 0。"""
        return sum(line.unit_price * line.quantity for line in self._lines.values())

    def most_expensive(self) -> str | None:
        """返回单价最高的 SKU。

        空购物车没有最贵商品，调用方按 None 处理。
        """
        return max(self._lines, key=lambda sku: self._lines[sku].unit_price)
