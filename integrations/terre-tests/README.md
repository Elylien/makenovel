# Terre 原断言测试兼容入口

在项目根运行：

```powershell
node integrations/terre-tests/run.cjs --no-cache
if ($LASTEXITCODE -ne 0) { throw 'Terre tests failed' }
```

前提是锁定 Terre 已安装依赖，且 `packages/editor-preview-protocol/dist/cjs/index.js` 已由构建生成。入口检查 `upstream.lock.json` 中的提交和 Yarn 锁文件摘要；允许正在审查的源码补丁。直接启动 Jest，**不调用会重新生成共享 protocol 目录的上游 `yarn test`**。新增 `*.spec.ts` 会按原版规则自动纳入。Jest CLI 参数可继续传入，例如 `--runTestsByPath`、`--json` 与 `--outputFile`；路径相对于 Terre 后端工作目录。

## 兼容范围

- 继承上游测试选择、Node 环境、覆盖率范围，保留 `ts-jest@29.4.9` 与 TypeScript 配置中的 Nest decorator metadata、类型检查及 Jest mock hoisting。
- 上游 `trash@10.1.1` 是 ESM，原 Jest CJS 测试环境跳过所有 `node_modules` 转译，因此三个 suite 在执行断言前失败。
- `esm-transformer.cjs` 使用上游锁定且已经安装的 `esbuild@0.18.20` 将真实 ESM JavaScript 转成 CJS，附 source map；CommonJS 文件原文传递。按最近 `package.json` 的 `type` 与文件扩展名判断，也覆盖嵌套 ESM 依赖。没有新增依赖或修改 lockfile。
- `resolver.cjs` 让来自 ESM package 的请求保留 `import` export 条件，以加载 `globby` 依赖 `unicorn-magic` 的真实 Node 入口。普通 CJS 请求保留原条件。未用 `moduleNameMapper` 或 mock 替换业务模块。
- 动态 import 转换为延迟的 Promise/require，`import.meta.url/filename/dirname` 使用实际文件位置；不支持含 top-level await 的 ESM 变体，遇到时会明确转译失败。此配置针对当前锁定依赖，不宣称 Jest 获得任意 ESM 的全部运行语义。
- 临时编译缓存写在根 `.local/terre-jest-cache/`；上游临时文件测试仍按原断言写入后端 `tmp/` 并自行清理。

机制依据：[Jest 29.7 自定义转换器](https://jestjs.io/docs/29.7/code-transformation)、[Jest resolver](https://jestjs.io/docs/29.7/configuration#resolver-string)、[esbuild transform API](https://esbuild.github.io/api/#transform)。

## 2026-10-07 实测

环境：Windows、Node 22.17.0、Jest 29.7.0，Terre `cf73dd58535d3ef15bddf0852adee153fa92d7da`。

| 执行 | 结果 | 本地证据 |
| --- | --- | --- |
| 原配置直接运行 Jest | 退出 1，6/9 suites、24 tests 通过，3 suites 在 trash ESM 加载期失败 | `docs/evidence/local/round2/terre-jest-original.log` |
| 只有 ESM 转换器、尚无 resolver | 退出 1，6/9 suites、24 tests 通过，明确暴露 unicorn-magic import-only exports | `terre-jest-adapted.log`、`terre-jest-adapted-result.json` |
| 完整兼容配置，`--no-cache` | 退出 0，9/9 suites、40/40 tests 通过，0 skip，23.53 s | `terre-jest-compatible.log`、`terre-jest-compatible-result.json` |

完整配置运行时，其他并行工作已新增 UserDataService 隔离 profile 的 3 条测试，因此 40 条包含全部上游原有 37 条及这 3 条新增测试。suite 计数为 editorPreviewHost 13、webgal-fs 11、user-data 6、logical-static 3、sentenceTokens 3，其余四套各 1 条。之后新增事务测试的总数以最新整体验证为准。

原版 filesystem suite 的真实读写、zip/gzip、越界拒绝断言均执行通过；其中拒绝用例输出的 Nest ERROR 是预期诊断。原套件没有实际执行回收站删除操作，本结果不代替回收站、GUI、启动或 Windows 离线包验收。所有完整日志被 Git 忽略。

需要机器可读结果时：

```powershell
$resultPath = Join-Path (Get-Location).Path 'docs/evidence/local/round2/terre-jest-latest-result.json'
node integrations/terre-tests/run.cjs --no-cache --json --outputFile $resultPath
if ($LASTEXITCODE -ne 0) { throw 'Terre tests failed' }
```

仅移除本目录的配置并回到上游 `yarn test` 即撤回此测试适配；没有 vendor 修改需要撤销。
