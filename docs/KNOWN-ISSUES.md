# 博闻已知报错与规避

## Codex 内置浏览器打开本地项目会导致桌面端不稳定

现象：使用 Codex 内置浏览器打开 `http://localhost:3000` 时，浏览器动作会被中断，严重时会导致 Codex 桌面端崩溃。

当前判断：项目服务本身可用，命令行访问 `/` 与 `/api/hot-videos` 均可返回 200；问题更接近 Codex 内置浏览器/本地 localhost 预览链路的不稳定，而不是博闻应用启动失败。

处理规范：

- 后续打开本地 MVP 时，优先使用 Microsoft Edge 外部浏览器。
- 不再默认使用 Codex 内置浏览器打开、预览或测试本项目。
- 若需要演示地址，先确认 Next dev server 端口，再提供或打开 `http://localhost:3000`。
- 如需重启服务，先确认现有 Next dev server PID，避免重复启动导致端口冲突。
