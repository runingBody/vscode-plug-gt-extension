import * as path from 'path';
import * as ts from 'typescript';

function getPropertyNameText(name: ts.PropertyName): string | undefined {
	if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) {
		return name.text;
	}

	return undefined;
}

function findObjectLiteralByIdentifier(
	sourceFile: ts.SourceFile,
	identifier: string
): ts.ObjectLiteralExpression | undefined {
	for (const statement of sourceFile.statements) {
		if (!ts.isVariableStatement(statement)) {
			continue;
		}

		for (const declaration of statement.declarationList.declarations) {
			if (
				ts.isIdentifier(declaration.name) &&
				declaration.name.text === identifier &&
				declaration.initializer &&
				ts.isObjectLiteralExpression(declaration.initializer)
			) {
				return declaration.initializer;
			}
		}
	}

	return undefined;
}

function findTranslationObjectLiteral(sourceFile: ts.SourceFile): ts.ObjectLiteralExpression | undefined {
	const zhObject = findObjectLiteralByIdentifier(sourceFile, 'zh');
	if (zhObject) {
		return zhObject;
	}

	const enObject = findObjectLiteralByIdentifier(sourceFile, 'en');
	if (enObject) {
		return enObject;
	}

	for (const statement of sourceFile.statements) {
		if (ts.isExportAssignment(statement) && ts.isObjectLiteralExpression(statement.expression)) {
			return statement.expression;
		}
	}

	let defaultIdentifier: string | undefined;

	for (const statement of sourceFile.statements) {
		if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
			defaultIdentifier = statement.expression.text;
			break;
		}
	}

	if (!defaultIdentifier) {
		for (const statement of sourceFile.statements) {
			if (!ts.isVariableStatement(statement)) {
				continue;
			}

			for (const declaration of statement.declarationList.declarations) {
				if (declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer)) {
					return declaration.initializer;
				}
			}
		}

		return undefined;
	}

	return findObjectLiteralByIdentifier(sourceFile, defaultIdentifier);
}

function parseTranslationEntries(content: string): Map<string, string> {
	const sourceFile = ts.createSourceFile('en.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const objectLiteral = findTranslationObjectLiteral(sourceFile);
	const entries = new Map<string, string>();

	if (!objectLiteral) {
		return entries;
	}

	for (const property of objectLiteral.properties) {
		if (!ts.isPropertyAssignment(property)) {
			continue;
		}

		const key = getPropertyNameText(property.name);
		if (!key) {
			continue;
		}

		const initializer = property.initializer;
		if (
			ts.isStringLiteral(initializer) ||
			ts.isNoSubstitutionTemplateLiteral(initializer)
		) {
			entries.set(key, initializer.text);
		}
	}

	return entries;
}

function formatTranslationEntries(entries: Map<string, string>): string {
	const keys = Array.from(entries.keys()).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
	const lines = keys.map((key) => `\t${JSON.stringify(key)}: ${JSON.stringify(entries.get(key) ?? key)},`);

	return `const en = {\n${lines.join('\n')}\n};\n\nexport default en;\n`;
}

const COMMON_TRANSLATIONS: Array<[string, string]> = [
	['操作', 'Action'],
	['订单编号', 'OrderNumber'],
	['订单日期', 'OrderDate'],
	['返', 'Return'],
	['寄', 'Send'],
	['寄出单号', 'OutboundTrackingNumber'],
	['寄回单号', 'ReturnTrackingNumber'],
	['来源', 'Source'],
	['往来单号', 'TransactionNumber'],
	['原因', 'Reason'],
	['质保函状态', 'WarrantyLetterStatus'],
	['供应商名称/代码', 'SupplierNameOrCode'],
	['创建人', 'Creator'],
	['创建时间', 'CreateTime'],
	['资源名称', 'ResourceName'],
	['处理中', 'Processing'],
	['请输入', 'PleaseEnter'],
	['请选择', 'PleaseSelect'],
	['标题', 'Title'],
	['名称', 'Name'],
	['编码', 'Code'],
	['状态', 'Status'],
	['类型', 'Type'],
	['时间', 'Time'],
	['内容', 'Content'],
	['描述', 'Description'],
	['备注', 'Remark'],
	['详情', 'Detail'],
	['列表', 'List'],
	['新增', 'Add'],
	['新建', 'Create'],
	['编辑', 'Edit'],
	['删除', 'Delete'],
	['搜索', 'Search'],
	['查看', 'View'],
	['导出', 'Export'],
	['提交', 'Submit'],
	['保存', 'Save'],
	['取消', 'Cancel'],
	['确认', 'Confirm'],
	['业务方', 'Purchaser'],
	['企业', 'Company'],
	['项目', 'Project'],
	['供应商', 'Supplier'],
	['物料', 'Material'],
	['模板', 'Template'],
	['流程', 'Process'],
	['附件', 'Attachment'],
	['帮助', 'Help'],
	['数量', 'Count'],
	['共', 'Total'],
	['条', 'Items']
];

function normalizeMessageKey(value: string): string {
	return value
		.trim()
		.replace(/[：﹕]/g, ':')
		.replace(/\s+/g, ' ')
		.replace(/[:：/\\,，。.！!？?；;、\s]+$/g, '');
}

function toPascalCase(value: string): string {
	const words = value
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[\/\\]/g, ' Or ')
		.replace(/[^a-zA-Z0-9]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

	return words.join('');
}

function createNormalizedTranslationMemory(entries: Map<string, string>): Map<string, string> {
	const normalized = new Map<string, string>();

	for (const [key, value] of entries) {
		const normalizedKey = normalizeMessageKey(key);
		if (normalizedKey && !normalized.has(normalizedKey)) {
			normalized.set(normalizedKey, value.trim());
		}
	}

	return normalized;
}

function translateWithDictionary(message: string): string | undefined {
	const tokens: string[] = [];
	const normalizedMessage = normalizeMessageKey(message);
	let cursor = 0;
	const sortedDictionary = [...COMMON_TRANSLATIONS].sort((left, right) => right[0].length - left[0].length);

	while (cursor < normalizedMessage.length) {
		let matched = false;

		for (const [chinese, english] of sortedDictionary) {
			if (normalizedMessage.startsWith(chinese, cursor)) {
				tokens.push(english);
				cursor += chinese.length;
				matched = true;
				break;
			}
		}

		if (matched) {
			continue;
		}

		const current = normalizedMessage[cursor];
		if (/[\/\\]/.test(current)) {
			tokens.push('Or');
			cursor++;
			continue;
		}

		if (/[\s，。、“”‘’；：！？,.!?:()（）【】\-_]/.test(current)) {
			cursor++;
			continue;
		}

		return undefined;
	}

	return tokens.length > 0 ? tokens.join(' ') : undefined;
}

function buildPascalCaseEnglishValue(
	message: string,
	translationMemory: Map<string, string>,
	normalizedTranslationMemory: Map<string, string>
): string {
	const exactOverrides = new Map<string, string>([
		['操作', 'Action'],
		['查询条件不能为空', 'TheQueryConditionCannotBeEmpty'],
		['导出中', 'Exporting'],
		['订单编号', 'OrderNumber'],
		['订单日期', 'OrderDate'],
		['返', 'Return'],
		['请输入名称或代码', 'PleaseEnterANameOrCode'],
		['供应商名称/代码', 'SupplierNameOrCode'],
		['寄', 'Send'],
		['寄出单号', 'OutboundTrackingNumber'],
		['寄回单号', 'ReturnTrackingNumber'],
		['来源', 'Source'],
		['筛选', 'Filter'],
		['往来单号', 'TransactionNumber'],
		['业务方', 'Purchaser'],
		['原因', 'Reason'],
		['原因:', 'Reason'],
		['只能导出状态为待寄出的记录', 'OnlyRecordsWithAStatusOfPendingShipmentCanBeExported'],
		['质保函列表', 'ListOfQualityAssuranceLetters'],
		['质保函状态', 'WarrantyLetterStatus']
	]);
	const normalizedMessage = normalizeMessageKey(message);
	const exactOverride = exactOverrides.get(message) ?? exactOverrides.get(normalizedMessage);
	if (exactOverride) {
		return exactOverride;
	}

	const exact = translationMemory.get(message) ?? normalizedTranslationMemory.get(normalizedMessage);
	if (exact) {
		const normalized = toPascalCase(exact);
		if (normalized) {
			return normalized;
		}
	}

	const fromDictionary = translateWithDictionary(message);
	if (fromDictionary) {
		const normalized = toPascalCase(fromDictionary);
		if (normalized) {
			return normalized;
		}
	}

	return '';
}

export function parseTranslationMemory(content: string | undefined): Map<string, string> {
	return content ? parseTranslationEntries(content) : new Map<string, string>();
}

export type MergeModuleTranslationContentResult = {
	content: string;
	unresolvedMessages: string[];
};

export function mergeModuleTranslationContent(
	existingContent: string | undefined,
	messages: string[],
	translationMemory: Map<string, string>
): MergeModuleTranslationContentResult {
	const entries = existingContent ? parseTranslationEntries(existingContent) : new Map<string, string>();
	const normalizedTranslationMemory = createNormalizedTranslationMemory(translationMemory);
	const unresolvedMessages: string[] = [];

	for (const message of messages) {
		if (!entries.has(message)) {
			const translatedValue = buildPascalCaseEnglishValue(
				message,
				translationMemory,
				normalizedTranslationMemory
			);
			entries.set(
				message,
				translatedValue
			);

			if (!translatedValue) {
				unresolvedMessages.push(message);
			}
		}
	}

	return {
		content: formatTranslationEntries(entries),
		unresolvedMessages
	};
}

export function buildImportName(moduleDir: string, workspaceRoot: string): string {
	const relative = path.relative(workspaceRoot, moduleDir).replace(/\\/g, '/');
	const base = relative
		.split('/')
		.filter(Boolean)
		.map((segment) => segment.replace(/[^a-zA-Z0-9]/g, '_'))
		.join('_') || 'module';

	return `${base}_en`;
}

export function toImportPath(fromFile: string, targetFile: string): string {
	let relative = path.relative(path.dirname(fromFile), targetFile).replace(/\\/g, '/');
	relative = relative.replace(/\.(tsx?|jsx?)$/, '');

	if (!relative.startsWith('.')) {
		relative = `./${relative}`;
	}

	return relative;
}

function insertImport(content: string, importName: string, importPath: string): string {
	const sourceFile = ts.createSourceFile('global-en.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const importStatement = `import ${importName} from '${importPath}';\n`;

	for (const statement of sourceFile.statements) {
		if (
			ts.isImportDeclaration(statement) &&
			ts.isStringLiteral(statement.moduleSpecifier) &&
			statement.moduleSpecifier.text === importPath
		) {
			return content;
		}
	}

	for (const statement of sourceFile.statements) {
		if (ts.isImportDeclaration(statement)) {
			return content.slice(0, statement.getFullStart()) + importStatement + content.slice(statement.getFullStart());
		}
	}

	return importStatement + content;
}

function insertSpread(content: string, importName: string): string {
	const sourceFile = ts.createSourceFile('global-en.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const objectLiteral = findTranslationObjectLiteral(sourceFile);

	if (!objectLiteral) {
		return content;
	}

	for (const property of objectLiteral.properties) {
		if (ts.isSpreadAssignment(property) && ts.isIdentifier(property.expression) && property.expression.text === importName) {
			return content;
		}
	}

	const insertAt = objectLiteral.properties.pos;
	const before = content.slice(0, insertAt);
	const after = content.slice(insertAt);
	const needsTrailingNewline = after.length > 0 && !after.startsWith('\n');
	const insertion = `\n\t...${importName},${needsTrailingNewline ? '\n' : ''}`;

	return before + insertion + after;
}

export function upsertGlobalNamespaceContent(
	existingContent: string | undefined,
	importName: string,
	importPath: string
): string {
	if (!existingContent || !existingContent.trim()) {
		return `import ${importName} from '${importPath}';\n\nconst en = {\n\t...${importName},\n};\n\nexport default en;\n`;
	}

	const withImport = insertImport(existingContent, importName, importPath);
	const sourceFile = ts.createSourceFile('global-en.ts', withImport, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const objectLiteral = findTranslationObjectLiteral(sourceFile);

	if (!objectLiteral) {
		return `${withImport.trimEnd()}\n\nconst en = {\n\t...${importName},\n};\n\nexport default en;\n`;
	}

	return insertSpread(withImport, importName);
}
