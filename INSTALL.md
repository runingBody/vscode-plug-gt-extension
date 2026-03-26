# 安装和使用指南

## 快速开始

### 方法1：开发模式（推荐用于测试）

1. **安装依赖**
   ```bash
   cd vscode-chinese-to-gt-extension
   npm install
   ```

2. **编译插件**
   ```bash
   npm run compile
   ```

3. **在 VSCode 中调试运行**
   - 在 VSCode 中打开 `vscode-chinese-to-gt-extension` 文件夹
   - 按 `F5` 启动调试
   - 会打开一个新的 "Extension Development Host" 窗口
   - 在这个新窗口中打开要转换的文件
   - 使用快捷键或命令进行转换

### 方法2：打包安装

1. **安装依赖并编译**
   ```bash
   cd vscode-chinese-to-gt-extension
   npm install
   npm run compile
   ```

2. **打包插件**
   ```bash
   # 如果没有安装 vsce，先安装
   npm install -g @vscode/vsce
   
   # 打包插件
   vsce package
   ```
   这会生成一个 `.vsix` 文件

3. **安装插件**
   - 在 VSCode 中按 `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (Mac)
   - 输入 "Extensions: Install from VSIX..."
   - 选择生成的 `.vsix` 文件

## 使用方法

### 快捷键

- **转换整个文件**：`Ctrl+Alt+G` (Windows/Linux) 或 `Cmd+Alt+G` (Mac)
- **转换选中内容**：`Ctrl+Shift+G` (Windows/Linux) 或 `Cmd+Shift+G` (Mac)

### 命令面板

1. 按 `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (Mac)
2. 输入以下命令之一：
   - `Chinese to gt() Converter: Convert Chinese to gt() - Entire File`
   - `Chinese to gt() Converter: Convert Chinese to gt() - Selection`

### 右键菜单

- 选中文本后，右键点击，选择 "Convert Chinese to gt() - Selection"

### 编辑器标题栏

- 点击编辑器右上角的按钮（如果有）

## 使用示例

### 示例1：转换对象属性

**转换前：**
```typescript
const filterFields = [
  {
    label: "资源名称",
    code: "resourceName",
  },
];
```

**转换后：**
```typescript
const filterFields = [
  {
    label: gt("资源名称"),
    code: "resourceName",
  },
];
```

### 示例2：转换 JSX 属性

**转换前：**
```tsx
<input placeholder="请输入..." />
```

**转换后：**
```tsx
<input placeholder={gt("请输入...")} />
```

### 示例3：转换嵌套对象属性

**转换前：**
```tsx
confirmProps={{
  title: '确认要结算关闭吗?',
  okText: '确定',
}}
```

**转换后：**
```tsx
confirmProps={{
  title: gt('确认要结算关闭吗?'),
  okText: gt('确定'),
}}
```

## 注意事项

1. **备份代码**：转换前建议先提交代码到版本控制系统
2. **检查结果**：转换后请仔细检查，确保转换正确
3. **已转换内容**：插件会自动跳过已经被 `gt()` 包裹的内容
4. **注释**：插件不会转换注释中的中文
5. **智能识别**：插件会尝试识别上下文，避免误转换

## 故障排除

### 插件无法运行

1. 检查是否已编译：运行 `npm run compile`
2. 检查 VSCode 版本：需要 VSCode 1.60.0 或更高版本
3. 查看输出面板：查看是否有错误信息

### 转换不正确

1. 检查文件类型：确保文件是 `.ts`, `.tsx`, `.js`, 或 `.jsx`
2. 检查语法：确保代码语法正确
3. 手动调整：如果某些地方转换不正确，可以手动调整

### 快捷键不工作

1. 检查快捷键冲突：在 VSCode 设置中查看是否有快捷键冲突
2. 使用命令面板：如果快捷键不工作，可以使用命令面板

## 反馈和建议

如果遇到问题或有改进建议，请创建 Issue 或提交 Pull Request。

