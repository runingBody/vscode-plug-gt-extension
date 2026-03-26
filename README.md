# Chinese to gt() Converter

一个 VSCode 插件，用于将代码中的中文转换为 `gt('')` 函数包裹的形式，方便进行国际化处理。

## 功能特性

支持多种格式的中文转换：

1. **对象属性中的中文**
   - `label: "资源名称"` → `label: gt("资源名称")`
   - `title: '确认要结算关闭吗?'` → `title: gt('确认要结算关闭吗?')`

2. **表格列定义中的中文**
   - `text: "业务方编码"` → `text: gt("业务方编码")`

3. **JSX 属性中的中文**
   - `placeholder="请输入..."` → `placeholder={gt("请输入...")}`
   - `title="标题"` → `title={gt("标题")}`

4. **JSX 文本内容中的中文**（可选功能）
   - `<div>创建人</div>` → `<div>{gt('创建人')}</div>`
   - `<b>搜索</b>` → `<b>{gt('搜索')}</b>`

<!-- ## 使用方法

### 安装

1. 在 VSCode 中打开扩展开发主机：
   - 按 `F5` 启动调试
   - 或在终端运行：`code --extensionDevelopmentPath=./vscode-chinese-to-gt-extension`

2. 或者打包插件后安装：
   ```bash
   cd vscode-chinese-to-gt-extension
   npm install
   npm run compile
   # 使用 vsce 打包
   npx vsce package
   ``` -->

### 使用命令

插件提供了两个命令：

1. **转换整个文件**
   - 命令：`Chinese to gt() Converter: Convert Chinese to gt() - Entire File`
   - 快捷键：`Ctrl+Alt+G` (Windows/Linux) 或 `Cmd+Alt+G` (Mac)
   - 或者点击编辑器标题栏的按钮

2. **转换选中内容**
   - 命令：`Chinese to gt() Converter: Convert Chinese to gt() - Selection`
   - 快捷键：`Ctrl+Shift+G` (Windows/Linux) 或 `Cmd+Shift+G` (Mac)
   - 或者右键菜单选择

### 使用步骤

1. 打开一个 TypeScript/JavaScript/TSX/JSX 文件
2. 选择要转换的代码（或直接转换整个文件）
3. 使用快捷键或命令进行转换
4. 检查转换结果，确保符合预期

## 支持的格式

### ✅ 已支持

- 对象属性中的双引号字符串：`key: "中文"`
- 对象属性中的单引号字符串：`key: '中文'`
- JSX 属性中的字符串：`attr="中文"` 或 `attr='中文'`
- 自动跳过已经被 `gt()` 包裹的内容
- 自动跳过注释中的内容

### ⚠️ 注意事项

- 插件会智能判断上下文，避免误转换
- 建议在转换前先提交代码到版本控制系统
- 转换后请仔细检查，确保没有误转换的情况
- JSX 文本节点中的中文转换功能默认关闭（可能误匹配），如需使用可取消注释相关代码

转化过程中最核心的要求：
转化逻辑顺序， 越在前优先级越高，检查文件类型：确保文件是 `.ts`, `.tsx`, `.js`, 或 `.jsx`
1. 注释中文不处理
2. 已gt()转化的，不再处理
3. 转换对象属性
4. 转换嵌套对象属性
5. 转换 JSX 属性，标签组件属性
6. 转换JSX 嵌套对象属性，标签组件属性

## 示例

### 转换前

```typescript
const filterFields = [
  {
    label: "资源名称",
    code: "resourceName",
  },
  {
    label: "下载方式",
    code: "downloadType",
  },
];

const columns = [
  {
    text: "业务方编码",
    dataField: "purchaserCode",
  },
];
```

### 转换后

```typescript
const filterFields = [
  {
    label: gt("资源名称"),
    code: "resourceName",
  },
  {
    label: gt("下载方式"),
    code: "downloadType",
  },
];

const columns = [
  {
    text: gt("业务方编码"),
    dataField: "purchaserCode",
  },
];
```

## 开发

### 构建

```bash
npm install
npm run compile
```

### 调试

1. 在 VSCode 中打开项目
2. 按 `F5` 启动调试
3. 在新打开的扩展开发主机窗口中测试插件

## 许可证

MIT

