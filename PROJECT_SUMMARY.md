# Chinese to gt() Converter - 项目总结

## 项目概述

这是一个 VSCode 插件，用于将 TypeScript/JavaScript/TSX/JSX 代码中的中文字符串自动转换为 `gt('中文')` 函数包裹的形式，方便进行国际化处理。

## 功能特性

### ✅ 已实现的功能

1. **对象属性中的中文转换**
   - 双引号字符串：`label: "资源名称"` → `label: gt("资源名称")`
   - 单引号字符串：`title: '确认要结算关闭吗?'` → `title: gt('确认要结算关闭吗?')`
   - 支持嵌套对象属性

2. **JSX 属性中的中文转换**
   - `placeholder="请输入..."` → `placeholder={gt("请输入...")}`
   - `title="标题"` → `title={gt("标题")}`

3. **智能跳过**
   - 自动跳过已经被 `gt()` 包裹的内容
   - 自动跳过注释中的中文
   - 智能识别上下文，避免误转换

### ⚠️ 可选功能（默认关闭）

- JSX 文本节点中的中文转换（可能误匹配，需谨慎使用）

## 项目结构

```
vscode-chinese-to-gt-extension/
├── src/
│   ├── extension.ts          # 插件入口文件，注册命令和菜单
│   └── converter.ts          # 核心转换逻辑
├── .vscode/
│   ├── launch.json           # 调试配置
│   └── tasks.json            # 构建任务配置
├── package.json              # 插件配置文件
├── tsconfig.json             # TypeScript 配置
├── README.md                 # 项目说明文档
├── INSTALL.md                # 安装和使用指南
├── test-examples.tsx         # 测试用例示例
├── .gitignore                # Git 忽略文件
└── .vscodeignore             # VSCode 打包忽略文件
```

## 支持的文件类型

- TypeScript (`.ts`)
- JavaScript (`.js`)
- TypeScript React (`.tsx`)
- JavaScript React (`.jsx`)

## 转换示例

### 示例 1: 对象属性

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

### 示例 2: 嵌套对象属性

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

### 示例 3: JSX 属性

**转换前：**
```tsx
<input placeholder="请输入..." />
```

**转换后：**
```tsx
<input placeholder={gt("请输入...")} />
```

### 示例 4: 已转换内容（自动跳过）

**代码：**
```typescript
const columns = [
  {
    text: gt("业务方编码"),  // 已经转换，不会被再次转换
    dataField: "purchaserCode",
  },
];
```

## 使用方法

### 快捷键

- **转换整个文件**：`Ctrl+Alt+G` (Windows/Linux) 或 `Cmd+Alt+G` (Mac)
- **转换选中内容**：`Ctrl+Shift+G` (Windows/Linux) 或 `Cmd+Shift+G` (Mac)

### 命令面板

1. 按 `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (Mac)
2. 输入 "Convert Chinese to gt()"
3. 选择相应的命令

## 技术实现

### 核心转换逻辑

插件使用正则表达式和字符串处理来识别和转换中文字符串：

1. **中文检测**：使用 Unicode 范围 `[\u4e00-\u9fa5]` 检测中文字符
2. **上下文识别**：检查代码上下文，判断是否为对象属性、JSX 属性等
3. **智能跳过**：检测是否已在 `gt()` 函数中，避免重复转换
4. **上下文处理**：从后往前替换，避免索引变化导致的错误

### 转换流程

1. 检测文件类型（TypeScript/JavaScript/TSX/JSX）
2. 识别各种格式的中文字符串
3. 检查上下文，确保准确转换
4. 跳过已转换和注释中的内容
5. 执行转换并更新代码

## 开发指南

### 本地开发

1. **安装依赖**
   ```bash
   npm install
   ```

2. **编译代码**
   ```bash
   npm run compile
   ```

3. **启动调试**
   - 在 VSCode 中打开项目
   - 按 `F5` 启动调试
   - 在新窗口中测试插件

4. **监听模式**
   ```bash
   npm run watch
   ```

### 打包发布

1. **安装打包工具**
   ```bash
   npm install -g @vscode/vsce
   ```

2. **打包插件**
   ```bash
   vsce package
   ```

3. **安装插件**
   - 在 VSCode 中使用 "Extensions: Install from VSIX..."

## 注意事项

1. ⚠️ **转换前备份代码**：建议先提交代码到版本控制系统
2. ⚠️ **检查转换结果**：转换后请仔细检查，确保正确
3. ⚠️ **智能识别限制**：某些复杂情况可能需要手动调整
4. ⚠️ **JSX 文本转换**：默认关闭，如需使用需手动启用

## 未来改进

- [ ] 支持更多文件格式
- [ ] 改进 JSX 文本内容转换的准确性
- [ ] 添加配置选项（如自定义函数名）
- [ ] 支持批量文件转换
- [ ] 添加预览功能

## 许可证

MIT

