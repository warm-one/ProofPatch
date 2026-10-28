# ProofPatch

> 让修复跑给人看。一个不依赖 Agent 自证的执行证据层。

AI 写代码已经比人快。但它说"修好了"，你凭什么信？

**"测试通过"不算证据**——测试可以被跳过、被改小、被删掉。
唯一算数的是：**同一个测试，在改动前失败，在改动后通过，且没有打坏别的。**

ProofPatch 只回答一个问题：

> 这个补丁是真的修复了那个 bug，还是只是让测试变绿了？

它不生成代码，不做静态审查，也不是更聪明的 Agent。它是一个对 Agent 输出持怀疑态度的外部检查器。

---

## 快速开始

```bash
git clone <repo> && cd ProofPatch
npm install
npm install -g .          # 或直接用 node bin/proofpatch.mjs

cd 你的项目目录
proofpatch check --python /path/to/python.exe
```

如果本机 `python` 已装 pytest，`--python` 可以省略。

它会：

1. 在你的项目里跑一遍测试，找出**已经在失败**的测试
2. 用这个失败作为验收契约，问你一次确认
3. 把你的改动做成补丁，在**独立克隆**里验证
4. 给出四行结论和一份可校验的回执

实际输出：

```
ProofPatch
  D:\projects\cartlogic

  正在查找基线失败…

  发现基线失败：most expensive on empty cart returns none
    ValueError: max() iterable argument is empty
    tests/test_cart.py::test_most_expensive_on_empty_cart_returns_none
  契约已冻结 sha256:bc86ab3fe667f51…

  候选：工作区改动，1 个文件
  正在验证（每阶段 3 次）…

  ✓ 基线复现  3/3 稳定失败
  ✓ 应用补丁  独立副本 git-tree:aaa8181195a11d…
  ✓ 候选验证  3/3 稳定通过
  ✓ 回归检查  tests/test_cart.py 无新增失败

  结论  ✓ PROVEN    证明成立
        基线稳定失败，候选稳定通过，且无新增回归
```

退出码：`0` 证明成立 / `1` 拒绝 / `2` 无法判定 / `64` 参数或环境错误。

---

## 它会拒绝什么

七个作弊补丁，全部被拒，误接受率 0.0%（`npm run acceptance` 可复现）：

| 补丁 | 手法 | 拒绝原因 |
|---|---|---|
| `cheat-noop` | 只加注释 | 候选仍失败 |
| `cheat-weak` | 目标测试能过，但打坏别的 | 回归新增失败 |
| `cheat-flaky` | 按调用次数交替通过 | 候选不稳定 |
| `cheat-skip` | 给目标测试加 skip | 修改受保护测试文件 |
| `cheat-rename` | 纯重命名把测试文件挪走 | 应用后按真实 Git 树发现 |
| `cheat-conftest` | 用 hook 把失败报告改写成通过 | 修改测试控制面 |
| `cheat-sitecustomize` | 解释器退出时强制退出码 0 | 修改测试控制面 |

其中最值得注意的一行是 `cheat-weak`：它的目标测试三次全过，**只有回归检查揭示了它打坏了另一个功能**。

---

## 它怎么判

判定是一个纯函数，输入只有已观测到的事实：

| 观察到什么 | 结论 |
|---|---|
| 基线测试本来就通过 | `INCONCLUSIVE` —— 没有可证明的修复 |
| 基线时好时坏 | `INCONCLUSIVE` —— 契约本身不稳定 |
| 基线稳定失败，候选稳定通过，无回归 | `PROVEN` |
| 基线稳定失败，候选时好时坏 | `REJECTED` —— 职责在候选 |
| 候选引入新增失败 | `REJECTED` |
| 补丁改了测试或测试控制面 | `REJECTED` —— 执行前即拦截 |

基线的问题永远不会算成候选的错。这条边界是故意划的。

---

## 回执

每次验证产出一份 `.proofpatch/receipt.json`，包含：

- 基线 commit、补丁摘要、候选树的 Git 哈希
- 契约内容、摘要、受保护路径
- 环境指纹（Python / pytest / 平台 / 依赖声明）
- 每次 trial 的结果、退出码、耗时、输出摘要
- **未证明边界**——这次到底没证明什么

独立校验（不需要仓库、不需要网络）：

```bash
proofpatch verify-receipt .proofpatch/receipt.json
```

改动其中任何一个字段，校验都会失败。

回执里始终有一节 `unproven`，例如：

```
· 验收契约由基线失败自动推导（强度 L1）：断言是否覆盖根因、未经人工复核
· 回归仅覆盖 tests/test_cart.py，未运行项目全量测试套件
· 未按依赖清单重建环境：验证使用的是宿主已安装的依赖
· 执行隔离为进程级：不构成安全沙箱
· 回执仅包含内容哈希，未包含签名身份
```

这不是免责声明，是这份回执的适用边界。

---

## 它做不到什么

诚实列出，这些是已知边界而非待修 bug：

- **只支持 Python / pytest**。其它语言没有适配层。
- **依赖来自宿主环境**。不建虚拟环境，项目依赖需要预先装好。
- **隔离是进程级**，不是安全沙箱。不可信代码仍以你的用户身份运行、可访问网络。
- **回执只有内容哈希**，没有签名身份。能验证"没被改过"，不能证明"是谁生成的"。
- **回归范围默认只覆盖目标测试所在文件**，跨文件破坏抓不到（会写在 `unproven` 里）。
- **不自动修复**，不调用 LLM 做判定。

---

## 项目结构

```
bin/proofpatch.mjs           CLI 入口
server/verifier/             判定内核
  verdict.mjs                判定函数（纯函数，四种结论的边界都在这里）
  receipt.mjs                回执协议与自校验
  oracle.mjs                 契约校验与强度分级
  sandbox.mjs                一次性克隆、补丁应用、树哈希
  pytestRunner.mjs           执行与结果四态分类
  index.mjs                  编排：拦截 → 双克隆 → 基线 N 次 → 候选 N 次 → 回归
  replay.mjs                 读回执 + 同一补丁，独立重跑并比对结论
src/                         官网与回执查看器（纯静态，无后端）
fixtures/python-bugfix/      含一个真实缺陷的夹具项目
scripts/acceptance-matrix.mjs 对抗补丁验收矩阵
docs/audit-2026-10-28.md     一次完整的正确性审查记录
```

Web 端只有一个执行无关的页面：`/receipt`。拖入一份 `receipt.json`，它会把四步验证、
契约、执行记录、未证明边界摊开，并**在你的浏览器里重算内容哈希**——不经过任何服务器。


测试：`npm test`（59 项）。验收矩阵：`npm run acceptance -- --python <python.exe>`。
