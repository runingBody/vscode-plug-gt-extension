import * as ts from 'typescript';

const SUPPORTED_LANGUAGES = new Set([
	'typescript',
	'javascript',
	'typescriptreact',
	'javascriptreact'
]);

const CHINESE_CHAR_REGEX = /[\u3400-\u9fff\uf900-\ufaff]/;

type Replacement = {
	start: number;
	end: number;
	text: string;
	messages?: string[];
};

export type ConversionReport = {
	text: string;
	messages: string[];
};

function containsChinese(text: string): boolean {
	return CHINESE_CHAR_REGEX.test(text);
}

function quoteText(text: string): string {
	return JSON.stringify(text);
}

function getScriptKind(languageId: string): ts.ScriptKind | undefined {
	switch (languageId) {
		case 'typescript':
			return ts.ScriptKind.TS;
		case 'javascript':
			return ts.ScriptKind.JS;
		case 'typescriptreact':
			return ts.ScriptKind.TSX;
		case 'javascriptreact':
			return ts.ScriptKind.JSX;
		default:
			return undefined;
	}
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
	return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function isGtCallee(expression: ts.LeftHandSideExpression): boolean {
	return ts.isIdentifier(expression) && expression.text === 'gt';
}

function isInsideGtCall(node: ts.Node): boolean {
	for (let current = node.parent; current; current = current.parent) {
		if (ts.isCallExpression(current) && isGtCallee(current.expression)) {
			return true;
		}
	}

	return false;
}

function isDirectivePrologue(node: ts.StringLiteral): boolean {
	const statement = node.parent;
	if (!ts.isExpressionStatement(statement)) {
		return false;
	}

	const container = statement.parent;
	const statements = ts.isSourceFile(container) || ts.isBlock(container)
		? container.statements
		: undefined;

	if (!statements) {
		return false;
	}

	for (const item of statements) {
		if (!ts.isExpressionStatement(item) || !ts.isStringLiteral(item.expression)) {
			return false;
		}

		if (item.expression === node) {
			return true;
		}
	}

	return false;
}

function isSkippableLiteralNode(
	node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral
): boolean {
	const parent = node.parent;

	if (!parent) {
		return false;
	}

	if (ts.isJsxAttribute(parent) && parent.initializer === node) {
		return false;
	}

	if (ts.isTaggedTemplateExpression(parent) && parent.template === node) {
		return true;
	}

	if (ts.isPropertyAssignment(parent) && parent.name === node) {
		return true;
	}

	if (ts.isPropertySignature(parent) && parent.name === node) {
		return true;
	}

	if (ts.isPropertyDeclaration(parent) && parent.name === node) {
		return true;
	}

	if (ts.isMethodDeclaration(parent) && parent.name === node) {
		return true;
	}

	if (ts.isMethodSignature(parent) && parent.name === node) {
		return true;
	}

	if (ts.isGetAccessorDeclaration(parent) && parent.name === node) {
		return true;
	}

	if (ts.isSetAccessorDeclaration(parent) && parent.name === node) {
		return true;
	}

	if (ts.isEnumMember(parent) && parent.name === node) {
		return true;
	}

	if (ts.isImportDeclaration(parent) && parent.moduleSpecifier === node) {
		return true;
	}

	if (ts.isExportDeclaration(parent) && parent.moduleSpecifier === node) {
		return true;
	}

	if (ts.isExternalModuleReference(parent) && parent.expression === node) {
		return true;
	}

	if (ts.isLiteralTypeNode(parent)) {
		return true;
	}

	if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) {
		return true;
	}

	if (
		ts.isCallExpression(parent) &&
		parent.arguments.includes(node) &&
		ts.isIdentifier(parent.expression) &&
		parent.expression.text === 'require'
	) {
		return true;
	}

	if (ts.isStringLiteral(node) && isDirectivePrologue(node)) {
		return true;
	}

	return false;
}

function isTranslatableExpression(node: ts.Expression): boolean {
	let current: ts.Node = node;

	while (current.parent) {
		const parent = current.parent;

		if (
			ts.isParenthesizedExpression(parent) ||
			ts.isAsExpression(parent) ||
			ts.isTypeAssertionExpression(parent) ||
			ts.isNonNullExpression(parent)
		) {
			current = parent;
			continue;
		}

		if (ts.isSatisfiesExpression?.(parent)) {
			current = parent;
			continue;
		}

		if (ts.isConditionalExpression(parent) && (parent.whenTrue === current || parent.whenFalse === current)) {
			current = parent;
			continue;
		}

		if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.PlusToken) {
			current = parent;
			continue;
		}

		if (ts.isArrayLiteralExpression(parent)) {
			current = parent;
			continue;
		}

		if (ts.isTemplateSpan(parent) && parent.expression === current) {
			current = parent.parent;
			continue;
		}

		if (ts.isJsxExpression(parent) && parent.expression === current) {
			current = parent;
			continue;
		}

		if (ts.isJsxAttribute(parent) && parent.initializer === current) {
			return true;
		}

		if (
			(ts.isJsxElement(parent) || ts.isJsxFragment(parent)) &&
			parent.children.includes(current as ts.JsxChild)
		) {
			return true;
		}

		if (ts.isPropertyAssignment(parent) && parent.initializer === current) {
			return true;
		}

		if (ts.isPropertyDeclaration(parent) && parent.initializer === current) {
			return true;
		}

		if (ts.isVariableDeclaration(parent) && parent.initializer === current) {
			return true;
		}

		if (ts.isBinaryExpression(parent) && isAssignmentOperator(parent.operatorToken.kind) && parent.right === current) {
			return true;
		}

		if ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.arguments?.includes(current as ts.Expression)) {
			return true;
		}

		if (ts.isReturnStatement(parent) && parent.expression === current) {
			return true;
		}

		return false;
	}

	return false;
}

function getStringLiteralReplacement(
	node: ts.StringLiteral,
	sourceFile: ts.SourceFile
): Replacement | undefined {
	if (!containsChinese(node.text) || isInsideGtCall(node) || isSkippableLiteralNode(node)) {
		return undefined;
	}

	if (!isTranslatableExpression(node)) {
		return undefined;
	}

	const raw = node.getText(sourceFile);

	if (ts.isJsxAttribute(node.parent) && node.parent.initializer === node) {
		return {
			start: node.getStart(sourceFile),
			end: node.getEnd(),
			text: `{gt(${raw})}`,
			messages: [node.text]
		};
	}

	return {
		start: node.getStart(sourceFile),
		end: node.getEnd(),
		text: `gt(${raw})`,
		messages: [node.text]
	};
}

function getNoSubstitutionTemplateReplacement(
	node: ts.NoSubstitutionTemplateLiteral
): Replacement | undefined {
	if (!containsChinese(node.text) || isInsideGtCall(node) || isSkippableLiteralNode(node)) {
		return undefined;
	}

	if (!isTranslatableExpression(node)) {
		return undefined;
	}

	return {
		start: node.getStart(),
		end: node.getEnd(),
		text: `gt(${quoteText(node.text)})`,
		messages: [node.text]
	};
}

function getTemplateExpressionReplacement(
	node: ts.TemplateExpression,
	sourceFile: ts.SourceFile
): Replacement | undefined {
	if (isInsideGtCall(node) || ts.isTaggedTemplateExpression(node.parent)) {
		return undefined;
	}

	if (!isTranslatableExpression(node)) {
		return undefined;
	}

	const literalParts = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
	if (!literalParts.some((part) => containsChinese(part))) {
		return undefined;
	}

	const parts: string[] = [];

	const pushLiteral = (value: string) => {
		if (!value) {
			return;
		}

		parts.push(containsChinese(value) ? `gt(${quoteText(value)})` : quoteText(value));
	};

	pushLiteral(node.head.text);

	for (const span of node.templateSpans) {
		parts.push(`(${span.expression.getText(sourceFile)})`);
		pushLiteral(span.literal.text);
	}

	if (parts.length === 0) {
		return undefined;
	}

	const messages = literalParts.filter((part) => part && containsChinese(part));

	return {
		start: node.getStart(sourceFile),
		end: node.getEnd(),
		text: parts.join(' + '),
		messages
	};
}

function getJsxTextReplacement(node: ts.JsxText, sourceText: string): Replacement | undefined {
	const raw = sourceText.slice(node.pos, node.end);
	if (!containsChinese(raw)) {
		return undefined;
	}

	const match = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
	if (!match) {
		return undefined;
	}

	const leading = match[1];
	const core = match[2];
	const trailing = match[3];

	if (!core.trim() || !containsChinese(core)) {
		return undefined;
	}

	return {
		start: node.pos,
		end: node.end,
		text: `${leading}{gt(${quoteText(core)})}${trailing}`,
		messages: [core]
	};
}

function applyReplacements(text: string, replacements: Replacement[]): string {
	const sorted = replacements
		.slice()
		.sort((left, right) => right.start - left.start || right.end - left.end);

	let result = text;

	for (const replacement of sorted) {
		result =
			result.slice(0, replacement.start) +
			replacement.text +
			result.slice(replacement.end);
	}

	return result;
}

function uniqueMessages(messages: string[]): string[] {
	const seen = new Set<string>();
	const results: string[] = [];

	for (const message of messages) {
		if (!message || seen.has(message)) {
			continue;
		}

		seen.add(message);
		results.push(message);
	}

	return results;
}

export function convertChineseToGtWithReport(text: string, languageId: string): ConversionReport {
	if (!SUPPORTED_LANGUAGES.has(languageId)) {
		return { text, messages: [] };
	}

	const scriptKind = getScriptKind(languageId);
	if (scriptKind === undefined) {
		return { text, messages: [] };
	}

	const sourceFile = ts.createSourceFile(
		languageId === 'typescriptreact' ? 'file.tsx' : languageId === 'javascriptreact' ? 'file.jsx' : languageId === 'typescript' ? 'file.ts' : 'file.js',
		text,
		ts.ScriptTarget.Latest,
		true,
		scriptKind
	);

	const replacements: Replacement[] = [];

	const visit = (node: ts.Node) => {
		if (node !== sourceFile && isInsideGtCall(node)) {
			return;
		}

		if (ts.isTemplateExpression(node)) {
			const replacement = getTemplateExpressionReplacement(node, sourceFile);
			if (replacement) {
				replacements.push(replacement);
				return;
			}
		}

		if (ts.isNoSubstitutionTemplateLiteral(node)) {
			const replacement = getNoSubstitutionTemplateReplacement(node);
			if (replacement) {
				replacements.push(replacement);
				return;
			}
		}

		if (ts.isStringLiteral(node)) {
			const replacement = getStringLiteralReplacement(node, sourceFile);
			if (replacement) {
				replacements.push(replacement);
				return;
			}
		}

		if (ts.isJsxText(node)) {
			const replacement = getJsxTextReplacement(node, text);
			if (replacement) {
				replacements.push(replacement);
				return;
			}
		}

		ts.forEachChild(node, visit);
	};

	visit(sourceFile);

	if (replacements.length === 0) {
		return { text, messages: [] };
	}

	return {
		text: applyReplacements(text, replacements),
		messages: uniqueMessages(
			replacements.flatMap((replacement) => replacement.messages ?? [])
		)
	};
}

export function convertChineseToGt(text: string, languageId: string): string {
	return convertChineseToGtWithReport(text, languageId).text;
}
