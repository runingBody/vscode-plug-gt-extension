# Chinese to gt() Converter

一个 VSCode 插件，用于把代码中的中文文案转换为 `gt(...)` 调用，便于统一接入国际化。

当前版本的核心转换逻辑基于 TypeScript AST，而不是简单正则替换，重点解决了以下问题：

- 识别更多真实代码场景，而不是只处理少量固定格式
- 跳过注释中的中文
- 跳过已经包裹过的 `gt(...)`
- 更稳妥地处理字符串拼接和模板字符串
- 减少误转换，例如条件比较值、模块路径、对象 key、类型字面量等

## 适用文件

- `.ts`
- `.tsx`
- `.js`
- `.jsx`

## 支持的转换场景

### 1. 对象属性值

```ts
const columns = [
  {
    title: "资源名称",
    emptyText: '暂无数据',
  },
];
```

转换后：

```ts
const columns = [
  {
    title: gt("资源名称"),
    emptyText: gt('暂无数据'),
  },
];
```

### 2. 赋值语句

```ts
message = "处理中";
```

转换后：

```ts
message = gt("处理中");
```

### 3. 函数调用参数

```ts
Toast.warning("请先选择数据");
form.required("不能为空");
```

转换后：

```ts
Toast.warning(gt("请先选择数据"));
form.required(gt("不能为空"));
```

### 4. JSX 属性

```tsx
<Input placeholder="请输入用户名" title="标题" />
```

转换后：

```tsx
<Input placeholder={gt("请输入用户名")} title={gt("标题")} />
```

### 5. JSX 文本节点

```tsx
<div>创建人</div>
```

转换后：

```tsx
<div>{gt("创建人")}</div>
```

### 6. 字符串拼接

```ts
const text = "共" + total + "条";
```

转换后：

```ts
const text = gt("共") + total + gt("条");
```

### 7. 模板字符串

```ts
const title = `你好${name}，欢迎`;
const modeText = `${mode === "new" ? `新建` : `编辑`}`;
```

转换后：

```ts
const title = gt("你好") + (name) + gt("，欢迎");
const modeText = `${mode === "new" ? gt("新建") : gt("编辑")}`;
```

## 不会转换的内容

以下内容会被主动跳过：

- 单行注释和多行注释中的中文
- 已经是 `gt(...)` 的内容
- `import` / `export` 的模块路径
- `require("...")` 的模块路径
- 对象 key、类成员名、方法名、枚举成员名
- 类型字面量
- 类似 `status === "已完成"` 这种比较常量
- 下标访问，如 `map["中文key"]`

示例：

```ts
// 注释中的中文不会转换
if (status === "已完成") {
  return gt("展示文案");
}
```

## 使用方式

插件提供 3 个命令：

### 1. 转换整个文件

- 命令：`转化中文为 => gt('中文')`
- 快捷键：
  - Windows / Linux: `Ctrl + Alt + G`
  - macOS: `Cmd + Alt + G`

### 2. 转换选中内容

- 命令：`转化选中部分的中文为 => gt('中文')`
- 快捷键：
  - Windows / Linux: `Ctrl + Shift + G`
  - macOS: `Cmd + Shift + G`

### 3. 转换文件夹中的所有文件

- 在资源管理器中右键文件夹或文件触发
- 会递归处理当前目录下的 `.ts` / `.tsx` / `.js` / `.jsx` 文件

## 转换规则

当前实现遵循以下原则：

1. 先判断文件类型，只处理 JS / TS / JSX / TSX
2. 只转换“文案表达式”里的中文
3. 注释不处理
4. 已经是 `gt(...)` 的内容不重复处理
5. 优先保证语法正确，避免生成嵌套错误代码

## 已修复的问题

相较于旧版本，当前版本重点修复了这些问题：

- 已转换内容被重复包裹
- 注释中文被误转换
- 函数参数中的中文漏转
- JSX 文本和 JSX 属性处理不稳定
- 中文字符串拼接处理不完整
- 模板字符串和带插值模板字符串处理不稳定
- 某些非展示文案被误转换

## 安装与开发

### 安装依赖

```bash
npm install
```

### 编译

```bash
npm run compile
```

### 测试

```bash
npm test
```

### 调试插件

1. 用 VSCode 打开项目
2. 按 `F5`
3. 在新开的 Extension Development Host 中测试命令

## 注意事项

- 转换前建议先提交代码，方便回滚
- 插件只负责把中文文案包成 `gt(...)`，不会自动插入 `gt` 的 import
- 对于特别复杂的业务表达式，建议转换后人工复核一次

## 许可证

MIT
