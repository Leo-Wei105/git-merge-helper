# Git合并助手 VSCode插件

一个自动化Git分支合并流程的VSCode插件，简化feature分支到pre/uat环境的合并操作。

## 功能特性

- 🔍 自动检查当前分支状态
- 📝 智能处理未提交的更改
- 🔄 自动化合并流程（feature → master → target）
- 🎯 支持合并到pre/uat环境
- 💡 友好的用户界面和进度提示
- ⚡ 快速提交并合并功能

## 安装方法

### 从源码安装

1. 克隆或下载此项目
2. 在项目根目录运行：
   ```bash
   npm install
   npm run compile
   ```
3. 按 `F5` 在VSCode中启动调试模式，或者打包安装：
   ```bash
   npx @vscode/vsce package
   ```

## 使用方法

### 命令面板

1. 打开命令面板（`Ctrl+Shift+P` 或 `Cmd+Shift+P`）
2. 输入以下命令之一：
   - `Git合并助手: 合并Feature分支` - 执行完整的合并流程
   - `Git合并助手: 快速提交并合并` - 快速提交当前更改并可选择继续合并

### Git面板

在VSCode的Git面板标题栏中，点击合并按钮快速启动合并流程。

## 工作流程

### 合并Feature分支流程

1. **检查当前分支** - 确保在feature分支上
2. **处理未提交更改** - 提示用户提交或取消
3. **选择目标分支** - 选择pre或uat环境
4. **更新master分支** - 拉取最新的master代码
5. **合并master到feature** - 确保feature分支包含最新代码
6. **合并到目标分支** - 将feature分支合并到选定的目标分支
7. **切回原分支** - 操作完成后回到原始分支

### 快速提交并合并

1. **检查未提交更改** - 如果没有更改则提示
2. **输入提交信息** - 用户输入commit message
3. **执行提交** - 自动add和commit
4. **可选合并** - 询问是否继续执行合并流程

## 配置要求

- VSCode 1.74.0 或更高版本
- Git 已安装并配置
- 工作区必须是Git仓库
- 需要有master、pre、uat分支的访问权限

## 注意事项

- 请确保在执行合并前已经测试过代码
- 建议在合并前备份重要分支
- 如果合并过程中出现冲突，需要手动解决
- 插件会自动切换分支，请确保没有重要的未保存工作

## 开发说明

### 项目结构

```
├── src/
│   ├── extension.ts          # 插件主入口
│   └── gitMergeService.ts    # Git操作服务类
├── out/                      # 编译输出目录
├── package.json              # 插件配置和依赖
├── tsconfig.json            # TypeScript配置
└── README.md                # 说明文档
```

### 开发命令

- `npm run compile` - 编译TypeScript代码
- `npm run watch` - 监听文件变化并自动编译
- `npx @vscode/vsce package` - 打包插件

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request来改进这个插件！ 