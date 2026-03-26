# Chinese to gt() Converter

一个 VSCode 插件，用于把代码中的中文文案转换为 `gt(...)` 调用，便于统一接入国际化。

当前版本的核心转换逻辑基于 TypeScript AST，而不是简单正则替换，重点解决了以下问题：

- 识别更多真实代码场景，而不是只处理少量固定格式
- 跳过注释中的中文
- 跳过已经包裹过的 `gt(...)`
- 更稳妥地处理字符串拼接和模板字符串
- 减少误转换，例如条件比较值、模块路径、对象 key、类型字面量等
- 转换成功后自动生成模块级 `_i18n/en.ts`
- 自动尝试把模块 i18n 注入到全局 `src/i18n/namespace/global/en.ts`

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

## 自动生成 i18n 文件

当文件转换成功后，插件会额外收集本次新增的中文文案，并自动生成模块级英文词条文件。

默认规则：

- 生成位置：`当前命令执行目标所属模块/_i18n/en.ts`
- 模块根目录优先通过 `ui-helper.tsx`、`ui-content.ts`、`page.tsx` 判断
- 若当前目录没有这些标记文件，会继续向上回溯，并用原有的页面目录规则兜底
- 词条格式：中文原文为 key，英文 value 自动转为 PascalCase
- 已存在的 `_i18n/en.ts` 会保留原有内容，只补充缺失词条

示例：

```ts
const en = {
	"创建人": "Founder",
	"标题": "Title",
};

export default en;
```

## 自动注入全局聚合

如果当前工程里存在 `src/i18n` 目录，插件会继续尝试更新全局聚合文件：

- 优先更新：`src/i18n/namespace/global/en.ts`
- 若不存在 `.ts`，则尝试：`src/i18n/namespace/global/en.tsx`
- 若 `src/i18n` 存在但全局文件不存在，会默认创建 `src/i18n/namespace/global/en.ts`

注入方式：

- 自动插入模块 `_i18n/en` 的 import
- 自动把该模块的词条对象展开到全局 `en` 对象中

如果工程中不存在 `src/i18n` 目录，则只生成模块级 `_i18n/en.ts`，不会强行创建额外的全局配置。

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
- 会跳过 `_i18n` 和 `i18n` 目录，避免重复处理生成产物

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
- 转换后词条文件需要手工新建和手工接入全局的问题

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
- 插件会自动生成 `_i18n/en.ts`，并尝试生成英文 PascalCase value
- 优先复用全局 `src/i18n/namespace/global/en.ts` 中已有的英文字典，再转成 PascalCase
- 如果全局词典里没有对应翻译，会按内置规则生成英文名，极少数场景仍建议人工复核
- 插件会尽量注入全局 `src/i18n/namespace/global/en.ts`，前提是工程里存在 `src/i18n` 目录
- 插件仍然不会自动插入业务文件里的 `gt` import
- 对于特别复杂的业务表达式，建议转换后人工复核一次

## 许可证

MIT
