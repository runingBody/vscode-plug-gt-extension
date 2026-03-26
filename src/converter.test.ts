import { strict as assert } from 'assert';
import { convertChineseToGt, convertChineseToGtWithReport } from './converter';

type TestCase = {
	name: string;
	languageId: string;
	input: string;
	expected: string;
};

const cases: TestCase[] = [
	{
		name: 'object property and assignment',
		languageId: 'typescript',
		input: 'const config = { label: "资源名称" };\nmessage = "处理中";',
		expected: 'const config = { label: gt("资源名称") };\nmessage = gt("处理中");'
	},
	{
		name: 'function arguments and existing gt calls',
		languageId: 'typescript',
		input: 'Toast.warning("提示信息");\nToast.warning(gt("已处理"));',
		expected: 'Toast.warning(gt("提示信息"));\nToast.warning(gt("已处理"));'
	},
	{
		name: 'comments stay untouched',
		languageId: 'typescript',
		input: 'const title = "标题";\n// 注释中文\n/* 多行注释中文 */',
		expected: 'const title = gt("标题");\n// 注释中文\n/* 多行注释中文 */'
	},
	{
		name: 'template string with interpolation',
		languageId: 'typescript',
		input: 'const title = `你好${name}，欢迎`; ',
		expected: 'const title = gt("你好") + (name) + gt("，欢迎"); '
	},
	{
		name: 'nested template branches',
		languageId: 'typescript',
		input: 'const title = `${mode === "new" ? `新建` : `编辑`}`;',
		expected: 'const title = `${mode === "new" ? gt("新建") : gt("编辑")}`;'
	},
	{
		name: 'jsx attributes and text',
		languageId: 'typescriptreact',
		input: '<div title="标题">创建人</div>',
		expected: '<div title={gt("标题")}>{gt("创建人")}</div>'
	},
	{
		name: 'jsx expression template string',
		languageId: 'typescriptreact',
		input: '<Input placeholder={`请输入${name}`} />',
		expected: '<Input placeholder={gt("请输入") + (name)} />'
	},
	{
		name: 'string concatenation pieces',
		languageId: 'typescript',
		input: 'const text = "共" + total + "条";',
		expected: 'const text = gt("共") + total + gt("条");'
	},
	{
		name: 'comparison literals are not converted',
		languageId: 'typescript',
		input: 'if (status === "已完成") {\n\treturn "展示文案";\n}',
		expected: 'if (status === "已完成") {\n\treturn gt("展示文案");\n}'
	}
];

for (const testCase of cases) {
	const actual = convertChineseToGt(testCase.input, testCase.languageId);
	assert.equal(actual, testCase.expected, testCase.name);
}

const report = convertChineseToGtWithReport(
	'const title = `你好${name}，欢迎`;\n<div title="标题">创建人</div>',
	'typescriptreact'
);
assert.deepEqual(report.messages, ['你好', '，欢迎', '标题', '创建人']);

console.log(`converter tests passed: ${cases.length}`);
