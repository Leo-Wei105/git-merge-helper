# Git合并助手

一个自动化Git分支合并流程的VSCode插件，让您的Git工作流更加高效。

## ✨ 功能特性

- 🚀 **自动化合并流程**：一键完成Feature分支到主分支的合并
- ⚡ **快速提交合并**：快速提交当前更改并合并到目标分支
- 🎯 **智能分支检测**：自动检测当前分支状态和Git仓库信息
- 🔄 **多种调用方式**：支持命令面板、右键菜单、SCM面板等多种方式
- 📝 **友好提示**：详细的操作提示和错误信息
- 🛡️ **安全检查**：合并前自动检查分支状态和冲突

## 🚀 快速开始

### 安装

1. 下载最新的 `.vsix` 文件
2. 在VSCode中按 `Ctrl+Shift+P` 打开命令面板
3. 输入 `Extensions: Install from VSIX...`
4. 选择下载的 `.vsix` 文件进行安装

### 使用方法

#### 方法一：命令面板
1. 按 `Ctrl+Shift+P` 打开命令面板
2. 输入 "Git合并助手" 或 "合并Feature分支"
3. 选择相应的命令执行

#### 方法二：右键菜单
- 在资源管理器中右键文件夹
- 在编辑器中右键
- 选择相应的Git合并命令

#### 方法三：SCM面板
- 打开源代码管理面板
- 点击标题栏中的合并按钮

## 📦 主要功能

### 合并Feature分支
自动执行以下流程：
1. 检查当前Git仓库状态
2. 获取当前分支信息
3. 切换到目标分支（通常是main/master）
4. 拉取最新代码
5. 合并Feature分支
6. 推送合并结果

### 快速提交并合并
快速完成提交和合并：
1. 暂存所有更改
2. 提交更改（支持自定义提交信息）
3. 执行分支合并流程

## 🔧 开发和构建

### 开发环境设置

```bash
# 克隆项目
git clone https://github.com/Leo-Wei105/git-merge-helper.git
cd git-merge-helper

# 安装依赖
npm install

# 编译代码
npm run compile

# 监听文件变化（开发模式）
npm run watch
```

### 版本管理

项目支持自动版本升级和CHANGELOG管理：

```bash
# 升级patch版本（修复）
npm run version:patch

# 升级minor版本（新功能）
npm run version:minor

# 升级major版本（重大更改）
npm run version:major
```

### 打包发布

```bash
# 交互式打包（推荐）
npm run package

# 快速打包
npm run package:patch  # 升级patch版本并打包
npm run package:minor  # 升级minor版本并打包
npm run package:major  # 升级major版本并打包

# 仅构建（不升级版本）
npm run build
```

交互式打包工具会引导您：
1. 选择版本升级类型
2. 输入发布说明
3. 确认打包信息
4. 自动执行完整流程

详细的构建说明请参考 [BUILD.md](BUILD.md)。

## 📝 更新日志

查看 [CHANGELOG.md](CHANGELOG.md) 了解版本更新历史。

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 许可证

MIT License - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🔗 相关链接

- [GitHub仓库](https://github.com/Leo-Wei105/git-merge-helper)
- [使用指南](USAGE.md)
- [构建指南](BUILD.md) 