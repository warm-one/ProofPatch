import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  CircleDashed,
  CornerDownRight,
  ShieldCheck,
  Terminal,
  UserCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "../ui/StatusBadge";
import "./MarketingSections.css";

interface SectionHeadingProps {
  index: string;
  label: string;
  title: ReactNode;
  description?: string;
}

function SectionHeading({
  index,
  label,
  title,
  description,
}: SectionHeadingProps) {
  return (
    <div className="section-heading">
      <div className="section-heading__meta">
        <span className="mono">{index}</span>
        <span />
        <span className="eyebrow">{label}</span>
      </div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

/** 问题定义：生成结束不等于交付完成。 */
export function ProblemSection() {
  return (
    <section className="home-section problem-section" id="evidence">
      <div className="home-section__inner problem-section__grid">
        <div className="problem-section__copy">
          <SectionHeading
            description="代码已生成、页面能打开，只说明产物存在；需求是否被满足，仍需要逐项证据证明。缺的不是更多生成，而是一条可被复核的交付链。"
            index="01"
            label="The delivery gap"
            title={
              <>
                交付缺口不在生成，
                <br />
                而在证明。
              </>
            }
          />
          <div className="problem-section__note">
            <CircleDashed aria-hidden="true" size={16} strokeWidth={1.5} />
            <p>
              “看起来做完了”不是验收结论。
              <br />
              它只是等待证据的状态。
            </p>
          </div>
        </div>

        <div className="gap-ledger" aria-label="交付断裂示意图">
          <div className="gap-ledger__label">
            <span className="mono">DELIVERY CHAIN / 001</span>
            <span className="mono">UNVERIFIED</span>
          </div>

          <div className="gap-node">
            <div className="gap-node__marker">
              <span className="mono">REQ</span>
            </div>
            <div className="gap-node__body">
              <strong>支持可持久化的暗色模式</strong>
              <p>偏好刷新后保留，主要界面可读，并支持键盘操作。</p>
            </div>
            <span className="gap-node__state mono">已定义</span>
          </div>

          <div className="gap-connector">
            <span />
            <span className="mono">HANDOFF TO AI</span>
          </div>

          <div className="gap-node gap-node--amber">
            <div className="gap-node__marker">
              <span className="mono">AI</span>
            </div>
            <div className="gap-node__body">
              <strong>“已经完成，页面看起来正常。”</strong>
              <p>4 个文件被修改，但没有能对应到验收项的测试结果。</p>
            </div>
            <span className="gap-node__state mono">仅声称</span>
          </div>

          <div className="gap-break">
            <div className="gap-break__title">
              <CornerDownRight aria-hidden="true" size={15} strokeWidth={1.5} />
              <span className="mono">MISSING EVIDENCE</span>
            </div>
            <ul>
              <li>刷新后是否保持？</li>
              <li>键盘能否操作？</li>
              <li>对比度是否达标？</li>
            </ul>
          </div>

          <div className="gap-resolution">
            <ShieldCheck aria-hidden="true" size={17} strokeWidth={1.5} />
            <p>
              ProofPatch 把这些口头完成，转成
              <strong>逐项可复核的证据。</strong>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

type WorkflowPreviewKind = "requirement" | "diff" | "log" | "confirm" | "report";

interface WorkflowStep {
  number: string;
  title: string;
  description: string;
  preview: WorkflowPreviewKind;
}

const workflowSteps: WorkflowStep[] = [
  {
    number: "01",
    title: "定义需求",
    description: "把模糊的“做完”拆成可验证的条件，先明确边界，再接受代码。",
    preview: "requirement",
  },
  {
    number: "02",
    title: "关联变更",
    description: "每一项验收都落到具体文件与行号，未被覆盖的改动无处躲藏。",
    preview: "diff",
  },
  {
    number: "03",
    title: "运行检查",
    description: "测试、构建和浏览器证据只记录事实，不由模型替结果背书。",
    preview: "log",
  },
  {
    number: "04",
    title: "人工确认",
    description: "自动通过不等于可以交付，负责人检查证据是否充分且属于当前快照。",
    preview: "confirm",
  },
  {
    number: "05",
    title: "生成报告",
    description: "把需求、状态、证据和未决风险装订成一份可复核的交付记录。",
    preview: "report",
  },
];

function WorkflowPreview({ kind }: { kind: WorkflowPreviewKind }) {
  if (kind === "requirement") {
    return (
      <div className="workflow-preview">
        <span className="mono workflow-preview__label">REQ / 012</span>
        <p>用户可切换暗色模式。</p>
        <div className="workflow-preview__chips">
          <span>刷新保留</span>
          <span>键盘可操作</span>
        </div>
      </div>
    );
  }

  if (kind === "diff") {
    return (
      <div className="workflow-preview workflow-preview--code">
        <span className="workflow-preview__file mono">ThemeProvider.tsx</span>
        <span className="workflow-preview__plus mono">+ persistTheme()</span>
        <span className="workflow-preview__file mono">tokens.css</span>
        <span className="workflow-preview__minus mono">− color: #7b847e</span>
      </div>
    );
  }

  if (kind === "log") {
    return (
      <div className="workflow-preview workflow-preview--code">
        <span className="workflow-preview__pass mono">✓ SHOT-01 captured</span>
        <span className="workflow-preview__pass mono">✓ LOG-08 passed</span>
        <span className="workflow-preview__fail mono">× LOG-14 contrast 3.8</span>
      </div>
    );
  }

  if (kind === "confirm") {
    return (
      <div className="workflow-preview workflow-preview--confirm">
        <span>
          <StatusBadge compact status="passed" />
          证据属于当前快照
        </span>
        <span>
          <StatusBadge compact status="unverified" />
          负责人待确认
        </span>
      </div>
    );
  }

  return (
    <div className="workflow-preview workflow-preview--report">
      <span className="mono">REPORT / DRAFT</span>
      <div>
        <strong>1 项未决</strong>
        <span className="workflow-preview__stamp mono">不可交付</span>
      </div>
    </div>
  );
}

/** 五步工作方式：从需求到可复核报告。 */
export function WorkflowSection() {
  return (
    <section className="home-section workflow-section" id="workflow">
      <div className="home-section__inner">
        <div className="workflow-section__heading">
          <SectionHeading
            description="生成只占流程的一小段。ProofPatch 把验收拆成五个可检查的动作，让每一步都留下能被追溯的痕迹。"
            index="02"
            label="How the ledger closes"
            title="五次装订，才是一次交付。"
          />
          <span className="workflow-section__aside mono">
            REQ → DIFF → CHECK → CONFIRM → REPORT
          </span>
        </div>

        <div className="workflow-rail">
          {workflowSteps.map((step) => (
            <article className="workflow-step" key={step.number}>
              <div className="workflow-step__head">
                <span className="mono">{step.number}</span>
                <span className="workflow-step__line" />
              </div>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              <WorkflowPreview kind={step.preview} />
            </article>
          ))}
        </div>

        <div className="workflow-footnote">
          <ShieldCheck aria-hidden="true" size={15} strokeWidth={1.5} />
          <span>
            工具只记录事实；结论必须由证据支持，并由人签字确认。
          </span>
        </div>
      </div>
    </section>
  );
}

const responsibilities = [
  {
    role: "ai",
    index: "01",
    label: "建议软件",
    title: "AI 可建议",
    description: "帮助拆解需求、整理可能相关的代码，但不拥有判定结果的权力。",
    icon: Bot,
    points: ["建议验收项", "推荐关联代码", "起草报告摘要"],
    footnote: "建议未经采纳，不进入验收矩阵。",
  },
  {
    role: "tool",
    index: "02",
    label: "事实记录",
    title: "工具可记录",
    description: "测试、构建、浏览器检查留下原始输出、退出码与截图快照。",
    icon: Terminal,
    points: ["记录退出码", "保存日志与截图", "标记证据所属快照"],
    footnote: "证据失败时，不允许改写为通过。",
  },
  {
    role: "human",
    index: "03",
    label: "最终责任",
    title: "人来确认",
    description: "交付负责人判断证据是否充分、是否过期，并对最终结论负责。",
    icon: UserCheck,
    points: ["采纳 AI 建议", "确认验收结论", "决定是否交付"],
    footnote: "没有确认，自动通过仍不可交付。",
  },
];

/** 三方责任边界：AI、工具与人不能混为一谈。 */
export function ResponsibilitySection() {
  return (
    <section className="home-section responsibility-section" id="responsibility">
      <div className="home-section__inner">
        <SectionHeading
          description="AI 时代最容易模糊的不是能力边界，而是责任边界。ProofPatch 把建议、事实和签字分开记录，让每个结论都有出处。"
          index="03"
          label="Separation of duties"
          title={
            <>
              建议、事实与签字，
              <br />
              不能混为一谈。
            </>
          }
        />

        <div className="responsibility-grid">
          {responsibilities.map((item) => {
            const Icon = item.icon;
            return (
              <article
                className={`responsibility-card responsibility-card--${item.role}`}
                key={item.role}
              >
                <div className="responsibility-card__meta">
                  <span className="mono">{item.index}</span>
                  <span className="mono">{item.label}</span>
                </div>
                <div className="responsibility-card__title">
                  <Icon aria-hidden="true" size={19} strokeWidth={1.4} />
                  <h3>{item.title}</h3>
                </div>
                <p>{item.description}</p>
                <ul>
                  {item.points.map((point) => (
                    <li key={point}>
                      <Check aria-hidden="true" size={13} strokeWidth={1.8} />
                      {point}
                    </li>
                  ))}
                </ul>
                <footer>{item.footnote}</footer>
              </article>
            );
          })}
        </div>

        <p className="responsibility-statement">
          <span className="responsibility-statement__claim">
            没有证据的“通过”，仍然是<span>未验证</span>。
          </span>
          <span className="mono">NO EVIDENCE / NO PASS</span>
        </p>
      </div>
    </section>
  );
}

/** 报告预览：展示最终交付物，而不是另一块仪表盘。 */
export function ReportPreviewSection() {
  return (
    <section className="home-section report-section" id="report">
      <div className="home-section__inner report-section__grid">
        <div className="report-section__copy">
          <SectionHeading
            description="一份好的报告不是“全部通过”的截图，而是即使出事也能追溯到需求、变更、证据与确认人的完整记录。"
            index="04"
            label="Delivery record"
            title={
              <>
                交付需要一个
                <br />
                能被质疑的结尾。
              </>
            }
          />
          <ul className="report-facts">
            <li>
              <span className="mono">01</span>
              每项通过都有证据编号，而不是一个绿色对勾。
            </li>
            <li>
              <span className="mono">02</span>
              失败、未验证与证据过期会被明确保留。
            </li>
            <li>
              <span className="mono">03</span>
              自动结果与人工签字分开记录。
            </li>
          </ul>
          <Link className="pp-button pp-button--primary" to="/receipt">
            打开一份真实回执
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>

        <article className="report-paper" aria-label="验收报告预览">
          <div aria-hidden="true" className="report-paper__binding">
            {Array.from({ length: 6 }, (_, index) => (
              <span key={index} />
            ))}
          </div>
          <div className="report-paper__inner">
            <header className="report-paper__header">
              <div>
                <span className="mono">PROOFPATCH / DELIVERY RECORD</span>
                <strong>交付验收记录</strong>
              </div>
              <span className="report-paper__draft mono">草稿 / DRAFT</span>
            </header>

            <dl className="report-paper__meta">
              <div>
                <dt className="mono">PROJECT</dt>
                <dd className="mono">storefront-web</dd>
              </div>
              <div>
                <dt className="mono">SNAPSHOT</dt>
                <dd className="mono">before-fix</dd>
              </div>
              <div>
                <dt className="mono">REQ</dt>
                <dd className="mono">REQ-012</dd>
              </div>
            </dl>

            <div className="report-paper__requirement">
              <span className="mono">REQUIREMENT</span>
              <h3>支持可持久化的暗色模式</h3>
              <p>用户可切换主题，偏好在刷新后保留，主要界面可读，并支持键盘操作。</p>
            </div>

            <div className="report-paper__summary">
              <span>
                <strong>03</strong>
                通过
              </span>
              <span className="is-risk">
                <strong>01</strong>
                阻塞
              </span>
              <span>
                <strong>01</strong>
                未验证
              </span>
            </div>

            <div className="report-paper__matrix">
              <div className="report-paper__matrix-head">
                <span className="mono">ACCEPTANCE / EVIDENCE</span>
                <span className="mono">STATE</span>
              </div>
              <div className="report-paper__row">
                <div>
                  <span className="mono">AC-01</span>
                  <p>切换后应用暗色主题</p>
                </div>
                <span className="mono">SHOT-01</span>
                <StatusBadge compact status="passed" />
              </div>
              <div className="report-paper__row">
                <div>
                  <span className="mono">AC-02</span>
                  <p>刷新后保持用户选择</p>
                </div>
                <span className="mono">LOG-08</span>
                <StatusBadge compact status="passed" />
              </div>
              <div className="report-paper__row is-blocking">
                <div>
                  <span className="mono">AC-04</span>
                  <p>设置页文字对比度达标</p>
                </div>
                <span className="mono">LOG-14</span>
                <StatusBadge compact status="failed" />
              </div>
            </div>

            <footer className="report-paper__footer">
              <span>
                <strong>阻塞原因</strong>
                设置页次要文字对比度为 3.8:1，低于 4.5:1。
              </span>
              <span className="mono">DEMO DATA · NOT DELIVERABLE</span>
            </footer>
          </div>
        </article>
      </div>
    </section>
  );
}

/** 最终行动号召。 */
export function ClosingSection() {
  return (
    <section className="closing-section">
      <div className="closing-section__inner">
        <div className="closing-section__meta">
          <span className="mono">PROOF BEFORE CLAIM.</span>
          <span className="mono">A PORTFOLIO PROJECT / 2026</span>
        </div>
        <div className="closing-section__content">
          <h2>
            让“完成”成为
            <br />
            可复核的事实。
          </h2>
          <div>
            <p>
              打开一份被拒绝的验证记录：目标测试全部通过，却被回归检查发现打坏了另一个功能。
            </p>
            <Link className="pp-button pp-button--primary" to="/receipt">
              查看验收回执
              <ArrowUpRight aria-hidden="true" size={16} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
