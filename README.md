# Git合并助手

一个自动化Git分支合并流程的VSCode插件，让您的Git工作流更加高效。

## ✨ 功能特性

- 🚀 **自动化合并流程**：一键完成Feature分支到主分支的合并
- ⚡ **快速提交合并**：快速提交当前更改并合并到目标分支
- 🎯 **智能分支检测**：自动检测当前分支状态和Git仓库信息
- 🔧 **灵活配置管理**：支持自定义主分支（main/master）和目标分支配置
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
2. 输入 "Git合并助手" 或相关命令名称
3. 选择相应的命令执行：
   - **合并Feature分支**：执行完整的分支合并流程
   - **快速提交并合并**：快速提交更改并执行合并
   - **配置管理**：管理插件配置

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
3. 切换到主分支（支持main/master自动检测）
4. 拉取最新代码
5. 合并主分支到Feature分支
6. 合并Feature分支到目标分支
7. 推送合并结果

### 快速提交并合并
快速完成提交和合并：
1. 暂存所有更改
2. 提交更改（支持自定义提交信息）
3. 执行分支合并流程

### 配置管理
灵活的配置管理功能：
1. **主分支设置**：选择使用main或master作为主分支
2. **自动检测**：自动检测远程仓库的主分支名称
3. **目标分支管理**：添加、删除、查看目标分支
4. **配置重置**：一键恢复默认配置

## ⚙️ 配置选项

### 主分支配置
- **gitMergeHelper.mainBranch**：设置主分支名称（master/main）
- **gitMergeHelper.autoDetectMainBranch**：是否自动检测主分支（默认开启）

### 目标分支配置
- **gitMergeHelper.targetBranches**：配置可选的目标分支列表

默认配置包含：
- `uat`：测试环境
- `pre`：预发布环境

您可以通过配置管理功能添加更多分支，如：
- `dev`：开发环境
- `staging`：预发布环境
- `prod`：生产环境

### 配置方式

#### 方法一：使用配置管理命令
1. 按 `Ctrl+Shift+P` 打开命令面板
2. 输入 "Git合并助手: 配置管理"
3. 选择相应的配置操作

#### 方法二：VSCode设置
1. 打开VSCode设置（`Ctrl+,`）
2. 搜索 "Git合并助手"
3. 修改相应的配置项

#### 方法三：settings.json
```json
{
  "gitMergeHelper.mainBranch": "main",
  "gitMergeHelper.autoDetectMainBranch": true,
  "gitMergeHelper.targetBranches": [
    {
      "name": "dev",
      "description": "开发环境"
    },
    {
      "name": "uat",
      "description": "测试环境"
    },
    {
      "name": "pre",
      "description": "预发布环境"
    },
    {
      "name": "prod",
      "description": "生产环境"
    }
  ]
}
```

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