# AI 机械 CAD 监控台

面向 SolidWorks、NX/UG、CATIA、Creo 与工程图自动化的公开资料追踪看板。

- **公开网页**：GitHub Pages 部署后在仓库 Settings → Pages 显示网址。
- **自动更新**：GitHub Actions 每天 01:30 UTC（北京时间 09:30）启动一次；脚本只在距离上一次正式追踪满 3 天时写入报告。
- **摘要策略**：配置 `OPENAI_API_KEY` GitHub Secret 后，工作流将请求 OpenAI Responses API 生成中文深度摘要；未配置时，保留基于可验证元数据的规则摘要。

## 监控对象

1. Markov AI / CAD 工作流数据
2. MIT VideoCAD 团队
3. Artem Taturevych / Xarial / CodeStack
4. haunchen / SolidWorks MCP
5. Adam-Schildkraut / SolidWorks MCP
6. Yandong Guan / CAD-Coder
7. CADGenBench / AI4Engineering
8. Autodesk AI Lab

## 手动触发

在 GitHub Actions 的 **AI CAD Monitor** 工作流中选择 **Run workflow**。勾选 `force_run` 可忽略三天间隔并立即生成一份报告。

## OpenAI Secret

仓库创建并推送后，在 **Settings → Secrets and variables → Actions → New repository secret** 创建：

- Name：`OPENAI_API_KEY`
- Secret：你的 OpenAI API Key

不要将密钥写入代码、Markdown 报告或 Issue。

## 重要边界

看板只把新的 release、默认分支提交、数据集更新时间、benchmark 规则/数据变更、或官方研究发布标为“正式更新”。Issue、论坛帖和个人实测统一标为“待验证线索”。网页不等同于已经可在 SolidWorks/NX/CATIA/Creo 内稳定生成原生特征树和工程图；实际落地仍需验证原生文件、重建、草图约束、B-Rep、工程图/BOM/GD&T 与可导出文件。
