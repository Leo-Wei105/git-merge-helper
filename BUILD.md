# 构建和发布指南

本文档介绍如何构建、打包和发布Git合并助手插件。

## 🚀 快速开始

### 开发环境设置

1. 安装依赖：
```bash
npm install
```

2. 编译TypeScript代码：
```bash
npm run compile
```

3. 监听文件变化（开发模式）：
```bash
npm run watch
```

## 📦 版本管理

### 自动版本升级

项目支持语义化版本管理，可以自动升级版本号并更新CHANGELOG。

#### 版本升级类型

- **patch**: 修复版本 (1.0.0 → 1.0.1) - 用于bug修复
- **minor**: 功能版本 (1.0.0 → 1.1.0) - 用于新功能添加
- **major**: 重大版本 (1.0.0 → 2.0.0) - 用于破坏性更改

#### 升级版本命令

```bash
# 升级patch版本
npm run version:patch

# 升级minor版本
npm run version:minor

# 升级major版本
npm run version:major
```

### 手动版本升级（带发布说明）

```bash
# 升级patch版本并添加发布说明
node scripts/version-bump.js patch "修复了菜单显示问题"

# 升级minor版本并添加发布说明
node scripts/version-bump.js minor "新增了快速合并功能"

# 升级major版本并添加发布说明
node scripts/version-bump.js major "重构了整个合并流程"
```

## 📦 打包发布

### 交互式打包（推荐）

运行交互式打包工具，它会引导您完成整个打包流程：

```bash
npm run package
```

交互式打包工具会：
1. 显示当前版本信息
2. 让您选择版本升级类型
3. 输入发布说明（可选）
4. 确认打包信息
5. 自动执行完整的打包流程

### 快速打包

如果您已经知道要升级的版本类型，可以直接使用：

```bash
# 升级patch版本并打包
npm run package:patch

# 升级minor版本并打包
npm run package:minor

# 升级major版本并打包
npm run package:major
```

### 仅构建（不升级版本）

如果您只想构建当前版本的包：

```bash
npm run build
```

## 📝 更新日志管理

项目使用 `CHANGELOG.md` 文件来记录版本更新历史。

### CHANGELOG格式

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 格式：

```markdown
## [未发布]

### 新增
- 待添加的新功能

### 修改
- 待修改的功能

### 修复
- 待修复的问题

## [1.0.1] - 2024-01-02

### 修复
- 修复了菜单显示问题
```

### 自动更新CHANGELOG

当您使用版本升级脚本时，CHANGELOG会自动更新：

1. 将"未发布"部分的内容移动到新版本下
2. 添加版本号和发布日期
3. 创建新的"未发布"部分

## 🔧 开发工作流

### 推荐的开发流程

1. **开发新功能**：
   ```bash
   npm run watch  # 启动监听模式
   ```

2. **测试功能**：
   - 在VSCode中按F5启动调试
   - 或者构建包进行手动测试

3. **更新CHANGELOG**：
   - 在"未发布"部分添加您的更改

4. **打包发布**：
   ```bash
   npm run package  # 交互式打包
   ```

5. **安装测试**：
   - 在VSCode中安装生成的.vsix文件
   - 测试所有功能是否正常

### 文件结构

```
git-merge-helper/
├── src/                    # 源代码
│   ├── extension.ts        # 插件入口
│   └── gitMergeService.ts  # Git合并服务
├── out/                    # 编译输出
├── scripts/                # 构建脚本
│   ├── version-bump.js     # 版本升级脚本
│   └── package.js          # 打包脚本
├── CHANGELOG.md            # 更新日志
├── package.json            # 项目配置
└── *.vsix                  # 生成的插件包
```

## 🚀 发布检查清单

在发布新版本之前，请确保：

- [ ] 所有功能都已测试
- [ ] CHANGELOG已更新
- [ ] 版本号符合语义化版本规范
- [ ] 生成的.vsix文件可以正常安装
- [ ] 所有菜单和命令都能正常工作
- [ ] 代码已编译且无错误

## 🛠️ 故障排除

### 常见问题

1. **打包失败**：
   - 检查TypeScript编译是否有错误
   - 确保所有依赖都已安装

2. **版本升级失败**：
   - 检查package.json格式是否正确
   - 确保有写入权限

3. **CHANGELOG格式错误**：
   - 检查CHANGELOG.md的格式是否符合规范
   - 确保"未发布"部分存在

### 获取帮助

如果遇到问题，请：
1. 检查控制台输出的错误信息
2. 查看相关日志文件
3. 参考VSCode插件开发文档 