"""购物车行为测试。

这些测试属于验收契约的一部分：它们描述「正确行为」，而不是「当前实现」。
修改它们等于修改验收标准，因此被视为越过 Oracle 边界。
"""

import pytest

from cartlogic.cart import Cart


def test_add_two_lines_subtotal():
    cart = Cart()
    cart.add("tea", 1200, 2)
    cart.add("cup", 3500, 1)
    assert cart.subtotal() == 5900


def test_quantity_accumulates_for_same_sku():
    cart = Cart()
    cart.add("tea", 1200, 2)
    cart.add("tea", 1200, 3)
    assert cart.subtotal() == 6000


def test_remove_line_drops_it_from_subtotal():
    cart = Cart()
    cart.add("tea", 1200, 1)
    cart.remove("tea")
    assert cart.subtotal() == 0


def test_add_rejects_non_positive_quantity():
    cart = Cart()
    with pytest.raises(ValueError):
        cart.add("tea", 1200, 0)


def test_most_expensive_returns_highest_priced_sku():
    cart = Cart()
    cart.add("tea", 1200, 1)
    cart.add("cup", 3500, 1)
    assert cart.most_expensive() == "cup"


def test_most_expensive_on_empty_cart_returns_none():
    """空购物车没有最贵商品，必须返回 None 而不是崩溃。"""
    cart = Cart()
    assert cart.most_expensive() is None
