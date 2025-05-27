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

## 🔗 相关链接

- [使用指南](USAGE.md)
- [构建指南](BUILD.md) 

### 安装

1. 下载最新的 `.vsix` 文件
2. 在VSCode中按 `Ctrl+Shift+P` 打开命令面板
3. 输入 `Extensions: Install from VSIX...`
4. 选择下载的 `.vsix` 文件进行安装