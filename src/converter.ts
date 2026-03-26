/**
 * 将代码中的中文转换为 gt('') 函数包裹的形式
 * 支持多种格式：
 * 1. 对象属性中的中文：label: "资源名称" -> label: gt("资源名称")
 * 2. JSX 中的纯文本中文：创建人 -> {gt('创建人')}
 * 3. JSX 属性中的中文：placeholder="请输入..." -> placeholder={gt("请输入...")}
 * 4. 对象属性中的单引号中文：title: '确认要结算关闭吗?' -> title: gt('确认要结算关闭吗?')
 * 5. 注释中的中文（不处理）
 */

// 检测字符串是否包含中文
function containsChinese(text: string): boolean {
	return /[\u4e00-\u9fa5]/.test(text);
}

// 检查字符串是否已经被 gt() 包裹
function isAlreadyWrapped(text: string): boolean {
	return /gt\s*\(['"`][^'"`]*['"`]\)/.test(text);
}

// 检查是否在 gt() 调用内部
function isInGtCall(text: string, index: number): boolean {
	const beforeText = text.substring(0, index);
	const lastGtIndex = beforeText.lastIndexOf('gt(');
	if (lastGtIndex === -1) {
		return false;
	}
	
	// 检查 gt( 后面是否有匹配的 )
	const afterGt = text.substring(lastGtIndex);
	const match = afterGt.match(/^gt\s*\(/);
	if (!match) {
		return false;
	}
	
	// 计算括号深度
	let depth = 1;
	let stringChar: string | null = null;
	let escape = false;
	
	for (let i = match[0].length; i < afterGt.length; i++) {
		const char = afterGt[i];
		
		if (escape) {
			escape = false;
			continue;
		}
		
		if (char === '\\') {
			escape = true;
			continue;
		}
		
		if (!stringChar && (char === '"' || char === "'" || char === '`')) {
			stringChar = char;
			continue;
		}
		
		if (char === stringChar) {
			stringChar = null;
			continue;
		}
		
		if (!stringChar) {
			if (char === '(') {
				depth++;
			} else if (char === ')') {
				depth--;
				if (depth === 0) {
					// 找到了匹配的右括号
					const endIndex = lastGtIndex + match[0].length + i;
					return index <= endIndex;
				}
			}
		}
	}
	
	return false;
}

// 检查是否在注释中
function isInComment(
	text: string,
	index: number,
	languageId: string
): boolean {
	if (languageId !== 'typescript' && languageId !== 'javascript' && languageId !== 'typescriptreact' && languageId !== 'javascriptreact') {
		return false;
	}
	
	const beforeText = text.substring(0, index);
	const afterText = text.substring(index);
	
	// 检查多行注释 /* */
	// 找到所有多行注释的开始位置
	let lastMultiLineStart = -1;
	for (let i = beforeText.length - 1; i >= 0; i--) {
		if (beforeText.substring(i, i + 2) === '/*') {
			lastMultiLineStart = i;
			break;
		}
	}
	
	if (lastMultiLineStart !== -1) {
		// 检查是否有匹配的结束标记
		const afterStart = text.substring(lastMultiLineStart);
		const endIndex = afterStart.indexOf('*/');
		if (endIndex !== -1) {
			const commentEnd = lastMultiLineStart + endIndex + 2;
			// 如果当前位置在多行注释内
			if (index >= lastMultiLineStart && index < commentEnd) {
				return true;
			}
		} else {
			// 没有找到结束标记，说明注释未闭合，当前位置在注释中
			return true;
		}
	}
	
	// 检查单行注释 //
	// 找到当前行的开始位置
	const lastNewline = beforeText.lastIndexOf('\n');
	const currentLineStart = lastNewline + 1;
	const currentLine = beforeText.substring(currentLineStart) + afterText.split('\n')[0];
	
	// 修复：更严格地检查单行注释
	// 查找当前行中的所有 // 位置（从后往前）
	for (let i = beforeText.length - 1; i >= currentLineStart; i--) {
		if (beforeText.substring(i, i + 2) === '//') {
			// 找到 //，检查它是否在字符串中
			const beforeComment = beforeText.substring(0, i);
			
			// 检查引号状态（考虑转义）
			let inString = false;
			let stringChar: string | null = null;
			let escape = false;
			
			for (let j = 0; j < beforeComment.length; j++) {
				const char = beforeComment[j];
				if (escape) {
					escape = false;
					continue;
				}
				if (char === '\\') {
					escape = true;
					continue;
				}
				if (!inString && (char === '"' || char === "'" || char === '`')) {
					inString = true;
					stringChar = char;
				} else if (inString && char === stringChar) {
					inString = false;
					stringChar = null;
				}
			}
			
			// 如果不在字符串中，且当前位置在 // 之后，认为在注释中
			if (!inString && index >= i) {
				return true;
			}
		}
	}
	
	return false;
}

// 检查是否在字符串字面量中
function isInStringLiteral(
	text: string,
	index: number
): { inString: boolean; stringType?: 'single' | 'double' | 'template' | 'backtick' } {
	const beforeText = text.substring(0, index);
	
	// 检查是否在模板字符串中
	const backtickCount = (beforeText.match(/`/g) || []).length;
	if (backtickCount % 2 !== 0) {
		const lastBacktick = beforeText.lastIndexOf('`');
		const afterText = text.substring(index);
		const nextBacktick = afterText.indexOf('`');
		if (nextBacktick !== -1 || !afterText.includes('`')) {
			return { inString: true, stringType: 'backtick' };
		}
	}
	
	// 检查是否在单引号字符串中
	let singleQuoteDepth = 0;
	let inSingleQuote = false;
	let escapeNext = false;
	
	for (let i = 0; i < index; i++) {
		const char = text[i];
		if (escapeNext) {
			escapeNext = false;
			continue;
		}
		if (char === '\\') {
			escapeNext = true;
			continue;
		}
		if (char === "'" && !inSingleQuote) {
			inSingleQuote = true;
			singleQuoteDepth++;
		} else if (char === "'" && inSingleQuote) {
			inSingleQuote = false;
		}
	}
	
	// 检查是否在双引号字符串中
	let doubleQuoteDepth = 0;
	let inDoubleQuote = false;
	escapeNext = false;
	
	for (let i = 0; i < index; i++) {
		const char = text[i];
		if (escapeNext) {
			escapeNext = false;
			continue;
		}
		if (char === '\\') {
			escapeNext = true;
			continue;
		}
		if (char === '"' && !inDoubleQuote) {
			inDoubleQuote = true;
			doubleQuoteDepth++;
		} else if (char === '"' && inDoubleQuote) {
			inDoubleQuote = false;
		}
	}
	
	if (inSingleQuote) {
		return { inString: true, stringType: 'single' };
	}
	if (inDoubleQuote) {
		return { inString: true, stringType: 'double' };
	}
	
	return { inString: false };
}

// 提取中文字符串（连续的中文）
function extractChineseStrings(text: string): Array<{ text: string; start: number; end: number }> {
	const results: Array<{ text: string; start: number; end: number }> = [];
	const chineseRegex = /[\u4e00-\u9fa5]+/g;
	let match;
	
	while ((match = chineseRegex.exec(text)) !== null) {
		results.push({
			text: match[0],
			start: match.index,
			end: match.index + match[0].length
		});
	}
	
	return results;
}

// 处理对象属性中的中文字符串（双引号）
function convertObjectPropertyChinese(text: string): string {
	// 更精确的对象属性匹配：key: "中文"
	// 考虑各种空白字符和缩进，只处理双引号
	const objectPropertyRegex = /(\w+)\s*:\s*"([^"]*[\u4e00-\u9fa5]+[^"]*)"/g;
	
	let result = text;
	const matches: Array<{ match: string; key: string; value: string; start: number; end: number }> = [];
	
	let match;
	while ((match = objectPropertyRegex.exec(text)) !== null) {
		const matchStart = match.index;
		const matchEnd = matchStart + match[0].length;
		
		// 检查上下文，确保这是对象属性而不是其他情况
		const beforeMatch = text.substring(Math.max(0, matchStart - 20), matchStart);
		
		// 如果已经在 gt() 中，跳过
		if (isInGtCall(text, matchStart)) {
			continue;
		}
		
		// 检查是否在注释中
		if (isInComment(text, matchStart, 'typescript')) {
			continue;
		}
		
		// 检查字符串值中是否已经包含 gt() 调用（避免嵌套转换）
		const value = match[2];
		if (value.includes('gt(') || value.includes('${gt(')) {
			continue;
		}
		
		// 修复：检查是否已经是 gt() 函数调用形式（如 key: gt("中文")），跳过
		const afterMatch = text.substring(matchEnd, Math.min(text.length, matchEnd + 10));
		if (beforeMatch.trim().endsWith('gt(') || afterMatch.trim().startsWith(')')) {
			continue;
		}
		
		// 修复：更严格地检查是否真的是对象属性
		// 排除函数调用参数的情况，如 .required("不允许为空")
		// 检查前面是否有函数调用的模式（如 .method 或 method()）
		if (/\.\w+\s*$/.test(beforeMatch) || /\)\s*$/.test(beforeMatch)) {
			// 前面是方法调用或函数调用，不是对象属性，跳过
			continue;
		}
		
			// 检查是否在对象字面量中（前面有 { 或 , 或换行后的缩进）
		const contextMatch = beforeMatch.match(/(\{|,|\n)\s*$/);
		if (!contextMatch && !/^\s*\{/.test(beforeMatch)) {
			// 可能不是对象属性，跳过
			continue;
		}
		
		matches.push({
			match: match[0],
			key: match[1],
			value: match[2],
			start: matchStart,
			end: matchEnd
		});
	}
	
	// 从后往前替换，避免索引变化
	for (let i = matches.length - 1; i >= 0; i--) {
		const m = matches[i];
		const replacement = `${m.key}: gt("${m.value}")`;
		result = result.substring(0, m.start) + replacement + result.substring(m.end);
	}
	
	return result;
}

// 处理嵌套对象属性中的中文字符串（嵌套在对象中的对象属性）
function convertNestedObjectPropertyChinese(text: string): string {
	// 匹配嵌套对象属性：{ key: { nestedKey: "中文" } } 或 { key: { nestedKey: '中文' } }
	// 需要处理嵌套在对象中的对象属性，例如：const obj = { prop: { nested: "中文" } }
	let result = text;
	
	// 查找所有包含嵌套对象的结构，然后处理其中的中文字符串
	// 使用更智能的方法：找到所有对象字面量，然后处理其中的嵌套对象属性
	
	// 简化方法：在已经转换过的对象属性之后，查找嵌套的对象属性
	// 匹配模式：key: { nestedKey: "中文" } 或 key: { nestedKey: '中文' }
	// 需要正确匹配嵌套的花括号
	const nestedObjectRegex = /(\w+)\s*:\s*\{([^}]*[\u4e00-\u9fa5]+[^}]*)\}/g;
	
	const matches: Array<{ key: string; nestedContent: string; start: number; end: number; fullMatch: string }> = [];
	
	let match;
	while ((match = nestedObjectRegex.exec(text)) !== null) {
		const matchStart = match.index;
		const matchEnd = matchStart + match[0].length;
		const nestedContent = match[2];
		
		// 如果已经在 gt() 中，跳过
		if (isInGtCall(text, matchStart)) {
			continue;
		}
		
		// 检查是否在注释中
		if (isInComment(text, matchStart, 'typescript')) {
			continue;
		}
		
		// 检查嵌套内容是否已经包含 gt() 调用
		if (nestedContent.includes('gt(') || nestedContent.includes('${gt(')) {
			continue;
		}
		
		// 检查是否是对象属性（前面应该有 : 或 { 或 ,）
		const beforeMatch = text.substring(Math.max(0, matchStart - 20), matchStart);
		if (!/(\{|,|:)\s*$/.test(beforeMatch.trim())) {
			continue;
		}
		
		matches.push({
			key: match[1],
			nestedContent: nestedContent,
			start: matchStart,
			end: matchEnd,
			fullMatch: match[0]
		});
	}
	
	// 从后往前处理每个嵌套对象
	for (let i = matches.length - 1; i >= 0; i--) {
		const m = matches[i];
		
		// 在嵌套内容中查找所有对象属性（key: "中文" 格式）
		const nestedMatches: Array<{ key: string; value: string; start: number; end: number }> = [];
		const nestedPropRegex = /(\w+)\s*:\s*"([^"]*[\u4e00-\u9fa5]+[^"]*)"/g;
		
		let nestedMatch;
		nestedPropRegex.lastIndex = 0;
		while ((nestedMatch = nestedPropRegex.exec(m.nestedContent)) !== null) {
			nestedMatches.push({
				key: nestedMatch[1],
				value: nestedMatch[2],
				start: nestedMatch.index,
				end: nestedMatch.index + nestedMatch[0].length
			});
		}
		
		// 从后往前替换嵌套对象中的属性
		if (nestedMatches.length > 0) {
			let newNestedContent = m.nestedContent;
			for (let j = nestedMatches.length - 1; j >= 0; j--) {
				const nm = nestedMatches[j];
				const before = newNestedContent.substring(0, nm.start);
				const after = newNestedContent.substring(nm.end);
				newNestedContent = before + `${nm.key}: gt("${nm.value}")` + after;
			}
			
			// 替换整个嵌套对象
			const before = result.substring(0, m.start);
			const after = result.substring(m.end);
			result = before + `${m.key}: {${newNestedContent}}` + after;
		}
	}
	
	return result;
}

// 处理 JSX 属性中的中文字符串
function convertJSXAttributeChinese(text: string): string {
	// 匹配 JSX 属性：attr="中文" 或 attr='中文'
	// 需要确保是在 JSX 标签中
	const jsxAttributeRegex = /(\w+)\s*=\s*(["'])([^"']*[\u4e00-\u9fa5]+[^"']*)\2/g;
	
	let result = text;
	const matches: Array<{ match: string; attr: string; quote: string; value: string; start: number; end: number }> = [];
	
	let match;
	while ((match = jsxAttributeRegex.exec(text)) !== null) {
		const matchStart = match.index;
		const matchEnd = matchStart + match[0].length;
		const value = match[3];
		
		// 修复：检查值是否已经包含 gt() 调用（避免重复转换）
		if (value.includes('gt(') || value.includes('${gt(')) {
			continue;
		}
		
		// 检查上下文，确保这是 JSX 属性
		const beforeMatch = text.substring(Math.max(0, matchStart - 50), matchStart);
		const afterMatch = text.substring(matchEnd, Math.min(text.length, matchEnd + 10));
		
		// 如果已经在 gt() 中，跳过
		if (isInGtCall(text, matchStart)) {
			continue;
		}
		
		// 检查是否在注释中
		if (isInComment(text, matchStart, 'typescriptreact')) {
			continue;
		}
		
		// 修复：检查是否已经是 JSX 表达式形式（如 {gt(...)}），跳过
		if (beforeMatch.trim().endsWith('{') || afterMatch.trim().startsWith('}')) {
			continue;
		}
		
		// 检查是否在 JSX 标签中（前面有 < 或空格）
		if (!/<\w+[\s>]/.test(beforeMatch) && !/\s/.test(beforeMatch.charAt(beforeMatch.length - 1))) {
			continue;
		}
		
		// 检查后面是否跟着其他属性或标签结束
		if (!/[\s>\/]/.test(afterMatch.charAt(0))) {
			continue;
		}
		
		matches.push({
			match: match[0],
			attr: match[1],
			quote: match[2],
			value: value,
			start: matchStart,
			end: matchEnd
		});
	}
	
	// 从后往前替换
	for (let i = matches.length - 1; i >= 0; i--) {
		const m = matches[i];
		// 修复：确保替换结果为 attr={gt("中文")} 格式，包含花括号，去掉等号前后的空格
		const replacement = `${m.attr}={gt(${m.quote}${m.value}${m.quote})}`;
		result = result.substring(0, m.start) + replacement + result.substring(m.end);
	}
	
	return result;
}

// 处理 JSX 文本节点中的中文
function convertJSXTextChinese(text: string): string {
	// 匹配 JSX 中的纯文本中文（不在标签属性中）
	// 这个比较复杂，需要避免匹配到标签内容
	
	// 先标记所有字符串字面量，避免误替换
	const stringPlaceholders: { [key: string]: string } = {};
	let placeholderIndex = 0;
	
	// 替换所有字符串字面量
	const textWithPlaceholders = text.replace(
		/(["'`])(?:(?=(\\?))\2.)*?\1/g,
		(match) => {
			const placeholder = `__STRING_PLACEHOLDER_${placeholderIndex}__`;
			stringPlaceholders[placeholder] = match;
			placeholderIndex++;
			return placeholder;
		}
	);
	
	// 在 JSX 内容中查找中文
	let result = textWithPlaceholders;
	
	// 匹配 JSX 文本内容中的中文（在 > 和 < 之间的纯文本）
	const jsxTextRegex = />([^<]*[\u4e00-\u9fa5]+[^<]*)</g;
	
	result = result.replace(jsxTextRegex, (match, textContent) => {
		// 提取中文部分
		const chineseParts = extractChineseStrings(textContent);
		if (chineseParts.length === 0) {
			return match;
		}
		
		let convertedContent = textContent;
		// 从后往前替换，避免索引变化
		for (let i = chineseParts.length - 1; i >= 0; i--) {
			const part = chineseParts[i];
			const chineseText = part.text;
			
			// 检查是否是纯中文文本（前后是空格、换行或标点）
			const beforeChar = textContent[part.start - 1] || ' ';
			const afterChar = textContent[part.end] || ' ';
			
			// 如果是独立的文本节点，用 gt() 包裹
			if (/\s|^/.test(beforeChar) && /\s|$/.test(afterChar)) {
				const before = convertedContent.substring(0, part.start);
				const after = convertedContent.substring(part.end);
				convertedContent = before + `{gt('${chineseText}')}` + after;
			} else {
				// 如果混在其他文本中，需要用 gt() 包裹整个文本
				// 这里简化处理，只包裹中文部分
				const before = convertedContent.substring(0, part.start);
				const after = convertedContent.substring(part.end);
				convertedContent = before + `{gt('${chineseText}')}` + after;
			}
		}
		
		return '>' + convertedContent + '<';
	});
	
	// 恢复字符串字面量
	for (const [placeholder, original] of Object.entries(stringPlaceholders)) {
		result = result.replace(placeholder, original);
	}
	
	return result;
}

// 处理对象属性中的单引号中文字符串（特殊情况）
function convertObjectPropertySingleQuote(text: string): string {
	// 匹配 key: '中文' 的情况（对象属性中的单引号字符串）
	const regex = /(\w+)\s*:\s*'([^']*[\u4e00-\u9fa5]+[^']*)'/g;
	
	let result = text;
	const matches: Array<{ match: string; key: string; value: string; start: number; end: number }> = [];
	
	let match;
	while ((match = regex.exec(text)) !== null) {
		const matchStart = match.index;
		const matchEnd = matchStart + match[0].length;
		
		// 如果已经在 gt() 中，跳过
		if (isInGtCall(text, matchStart)) {
			continue;
		}
		
		// 检查是否在注释中
		if (isInComment(text, matchStart, 'typescript')) {
			continue;
		}
		
		// 检查上下文，确保这是对象属性
		const beforeMatch = text.substring(Math.max(0, matchStart - 30), matchStart);
		
		// 检查是否在对象字面量中
		const contextMatch = beforeMatch.match(/(\{|,|\n)\s*$/);
		if (!contextMatch && !/^\s*\{/.test(beforeMatch)) {
			continue;
		}
		
		matches.push({
			match: match[0],
			key: match[1],
			value: match[2],
			start: matchStart,
			end: matchEnd
		});
	}
	
	// 从后往前替换
	for (let i = matches.length - 1; i >= 0; i--) {
		const m = matches[i];
		const replacement = `${m.key}: gt('${m.value}')`;
		result = result.substring(0, m.start) + replacement + result.substring(m.end);
	}
	
	return result;
}

// 处理普通赋值语句中的中文字符串
function convertAssignmentChinese(text: string): string {
	// 匹配赋值语句：variable = "中文" 或 variable = '中文'
	// 排除已经在 gt() 中的情况
	const assignmentRegex = /(\w+)\s*=\s*(["'])([^"']*[\u4e00-\u9fa5]+[^"']*)\2/g;
	
	let result = text;
	const matches: Array<{ match: string; variable: string; quote: string; value: string; start: number; end: number }> = [];
	
	let match;
	while ((match = assignmentRegex.exec(text)) !== null) {
		const matchStart = match.index;
		const matchEnd = matchStart + match[0].length;
		
		// 如果已经在 gt() 中，跳过
		if (isInGtCall(text, matchStart)) {
			continue;
		}
		
		// 检查是否在注释中
		if (isInComment(text, matchStart, 'typescript')) {
			continue;
		}
		
		// 检查上下文，确保这是赋值语句而不是对象属性或 JSX 属性
		const beforeMatch = text.substring(Math.max(0, matchStart - 50), matchStart);
		// 如果是对象属性（前面有 :），跳过（由其他函数处理）
		if (beforeMatch.trim().endsWith(':')) {
			continue;
		}
		
		// 修复：检查是否是 JSX 属性（前面有 < 或 JSX 标签），跳过（由 convertJSXAttributeChinese 处理）
		if (/<\w+[\s>]/.test(beforeMatch) || beforeMatch.trim().endsWith('<')) {
			continue;
		}
		
		matches.push({
			match: match[0],
			variable: match[1],
			quote: match[2],
			value: match[3],
			start: matchStart,
			end: matchEnd
		});
	}
	
	// 从后往前替换
	for (let i = matches.length - 1; i >= 0; i--) {
		const m = matches[i];
		const replacement = `${m.variable} = gt(${m.quote}${m.value}${m.quote})`;
		result = result.substring(0, m.start) + replacement + result.substring(m.end);
	}
	
	return result;
}

// 处理函数调用参数中的中文字符串
function convertFunctionCallChinese(text: string): string {
	// 匹配函数调用：functionName('中文') 或 functionName("中文")
	// 需要匹配各种函数调用形式：Toast.warning('中文'), console.log("中文"), .min(1, "中文") 等
	// 支持链式调用，如 .min(1, "中文")
	// 注意：需要匹配前面可能有换行和空格的情况
	// 修复：确保匹配完整的函数名，包括链式调用如 .required()
	const functionCallRegex = /(?:\.\w+|\w+(?:\.\w+)*)\s*\(\s*(["'])([^"']*[\u4e00-\u9fa5]+[^"']*)\1\s*\)/g;
	
	let result = text;
	const matches: Array<{ match: string; funcName: string; quote: string; value: string; start: number; end: number; beforeFunc: string }> = [];
	
	let match;
	while ((match = functionCallRegex.exec(text)) !== null) {
		const matchStart = match.index;
		const matchEnd = matchStart + match[0].length;
		const fullMatch = match[0];
		
		// 如果已经在 gt() 中，跳过
		if (isInGtCall(text, matchStart)) {
			continue;
		}
		
		// 检查是否在注释中
		if (isInComment(text, matchStart, 'typescript')) {
			continue;
		}
		
		// 提取函数名（可能以 . 开头，表示链式调用）
		// 修复：确保匹配完整的函数名
		const funcNameMatch = fullMatch.match(/^(\.\w+|\w+(?:\.\w+)*)/);
		if (!funcNameMatch) {
			continue;
		}
		const funcName = funcNameMatch[1];
		
		// 检查是否是 gt() 调用本身，避免递归
		if (funcName === 'gt' || funcName === '.gt' || funcName.endsWith('.gt')) {
			continue;
		}
		
		// 修复：检查整个匹配是否是已经转换过的形式（如 required(gt("中文"))）
		const fullMatchBefore = text.substring(Math.max(0, matchStart - 50), matchStart);
		const fullMatchAfter = text.substring(matchEnd, Math.min(text.length, matchEnd + 50));
		if (fullMatchAfter.includes(')') && fullMatchBefore.includes('gt(')) {
			// 可能已经是转换后的形式，检查一下
			const checkBefore = text.substring(Math.max(0, matchStart - 100), matchStart);
			if (checkBefore.match(/gt\s*\([^)]*\)\s*$/)) {
				continue; // 已经是 gt(...) 形式，跳过
			}
		}
		
		// 检查字符串内容是否已经在 gt() 中（避免嵌套转换）
		// 例如：gt('中文') 这种情况不应该再转换
		const value = match[2];
		if (value.includes('gt(') || value.includes('${gt(')) {
			// 字符串内容中已经包含 gt() 调用，跳过
			continue;
		}
		
		// 获取函数调用前的文本，用于检查上下文
		const beforeFunc = text.substring(Math.max(0, matchStart - 10), matchStart);
		
		// 检查是否在对象属性中（前面有 :），如果是，跳过（由其他函数处理）
		if (beforeFunc.trim().endsWith(':')) {
			continue;
		}
		
		const quote = match[1];
		matches.push({
			match: fullMatch,
			funcName: funcName,
			quote: quote,
			value: value,
			start: matchStart,
			end: matchEnd,
			beforeFunc: beforeFunc
		});
	}
	
	// 从后往前替换
	for (let i = matches.length - 1; i >= 0; i--) {
		const m = matches[i];
		// 修复：确保正确替换，保留完整的函数名
		const replacement = `${m.funcName}(gt(${m.quote}${m.value}${m.quote}))`;
		result = result.substring(0, m.start) + replacement + result.substring(m.end);
	}
	
	return result;
}

// 处理 JSX 嵌套对象属性中的中文字符串（JSX 组件属性中的嵌套对象）
function convertJSXNestedObjectPropertyChinese(text: string): string {
	// 匹配 JSX 属性中的嵌套对象：attr={{ nestedKey: "中文" }} 或 attr={{ nestedKey: '中文' }}
	// 例如：<Component props={{ label: "中文", value: "值" }} />
	let result = text;
	
	// 匹配 JSX 属性中的对象字面量：attr={{ ... }}
	// 需要正确处理嵌套的花括号
	const jsxNestedObjectRegex = /(\w+)\s*=\s*\{\s*\{/g;
	
	const matches: Array<{ attr: string; objStart: number; objEnd: number; content: string }> = [];
	
	let match;
	while ((match = jsxNestedObjectRegex.exec(text)) !== null) {
		const attrStart = match.index;
		const attr = match[1];
		const objStart = match.index + match[0].length - 1; // 第二个 { 的位置
		
		// 如果已经在 gt() 中，跳过
		if (isInGtCall(text, attrStart)) {
			continue;
		}
		
		// 检查是否在注释中
		if (isInComment(text, attrStart, 'typescriptreact')) {
			continue;
		}
		
		// 检查是否在 JSX 标签中
		const beforeMatch = text.substring(Math.max(0, attrStart - 50), attrStart);
		if (!/<\w+[\s>]/.test(beforeMatch) && !/\s/.test(beforeMatch.charAt(beforeMatch.length - 1))) {
			continue;
		}
		
		// 找到匹配的闭合花括号（考虑嵌套）
		let depth = 2; // 两个 {{
		let objEnd = objStart + 1;
		let inString = false;
		let stringChar: string | null = null;
		let escape = false;
		
		for (let i = objStart + 1; i < text.length; i++) {
			const char = text[i];
			
			if (escape) {
				escape = false;
				continue;
			}
			
			if (char === '\\') {
				escape = true;
				continue;
			}
			
			if (!inString && (char === '"' || char === "'" || char === '`')) {
				inString = true;
				stringChar = char;
				continue;
			}
			
			if (inString && char === stringChar) {
				inString = false;
				stringChar = null;
				continue;
			}
			
			if (!inString) {
				if (char === '{') {
					depth++;
				} else if (char === '}') {
					depth--;
					if (depth === 0) {
						objEnd = i + 1;
						break;
					}
				}
			}
		}
		
		if (depth === 0) {
			// 找到了完整的嵌套对象
			// 找到内层对象的结束位置（第二个 } 的位置）
			// objStart 是第二个 { 的位置，我们需要找到匹配的 }
			let innerObjEnd = objStart + 1;
			let innerDepth = 1;
			let innerInString = false;
			let innerStringChar: string | null = null;
			let innerEscape = false;
			
			for (let i = objStart + 1; i < objEnd - 1; i++) {
				const char = text[i];
				
				if (innerEscape) {
					innerEscape = false;
					continue;
				}
				
				if (char === '\\') {
					innerEscape = true;
					continue;
				}
				
				if (!innerInString && (char === '"' || char === "'" || char === '`')) {
					innerInString = true;
					innerStringChar = char;
					continue;
				}
				
				if (innerInString && char === innerStringChar) {
					innerInString = false;
					innerStringChar = null;
					continue;
				}
				
				if (!innerInString) {
					if (char === '{') {
						innerDepth++;
					} else if (char === '}') {
						innerDepth--;
						if (innerDepth === 0) {
							innerObjEnd = i;
							break;
						}
					}
				}
			}
			
			// 内层对象的内容（去掉内层对象的 { 和 }）
			const content = text.substring(objStart + 1, innerObjEnd);
			
			// 检查内容是否已经包含 gt() 调用
			if (content.includes('gt(') || content.includes('${gt(')) {
				continue;
			}
			
			// 检查内容中是否有中文
			if (!/[\u4e00-\u9fa5]/.test(content)) {
				continue;
			}
			
			matches.push({
				attr: attr,
				objStart: attrStart, // 属性名开始位置
				objEnd: objEnd, // 整个属性结束位置（最后一个 } 之后）
				content: content
			});
		}
	}
	
	// 从后往前处理每个嵌套对象
	for (let i = matches.length - 1; i >= 0; i--) {
		const m = matches[i];
		
		// 在嵌套对象内容中查找所有对象属性（key: "中文" 格式）
		const nestedMatches: Array<{ key: string; value: string; quote: string; start: number; end: number }> = [];
		const nestedPropRegex = /(\w+)\s*:\s*(["'])([^"']*[\u4e00-\u9fa5]+[^"']*)\2/g;
		
		let nestedMatch;
		nestedPropRegex.lastIndex = 0;
		while ((nestedMatch = nestedPropRegex.exec(m.content)) !== null) {
			nestedMatches.push({
				key: nestedMatch[1],
				value: nestedMatch[3],
				quote: nestedMatch[2],
				start: nestedMatch.index,
				end: nestedMatch.index + nestedMatch[0].length
			});
		}
		
		// 从后往前替换嵌套对象中的属性
		if (nestedMatches.length > 0) {
			let newContent = m.content;
			for (let j = nestedMatches.length - 1; j >= 0; j--) {
				const nm = nestedMatches[j];
				const before = newContent.substring(0, nm.start);
				const after = newContent.substring(nm.end);
				newContent = before + `${nm.key}: gt(${nm.quote}${nm.value}${nm.quote})` + after;
			}
			
			// 替换整个 JSX 嵌套对象属性
			// m.objStart 是属性名的开始位置（match.index），m.objEnd 是整个属性结束位置（最后一个 } 之后）
			const before = result.substring(0, m.objStart);
			const after = result.substring(m.objEnd);
			// 构造新的属性：attr={{...}}
			result = before + `${m.attr}={{${newContent}}}` + after;
		}
	}
	
	return result;
}

// 处理 JSX 属性中的模板字符串（如 title={`中文`}）
function convertJSXAttributeTemplateString(text: string): string {
	// 匹配 JSX 属性中的模板字符串：attr={`中文`} 或 attr={\`中文\`}
	let result = text;
	
	// 匹配 JSX 属性：attr={`...中文...`} 或 attr={\`...中文...\`}
	const jsxAttrTemplateRegex = /(\w+)\s*=\s*\{\s*`([^`]*[\u4e00-\u9fa5]+[^`]*)`\s*\}/g;
	
	const matches: Array<{ match: string; attr: string; content: string; start: number; end: number }> = [];
	
	let match;
	while ((match = jsxAttrTemplateRegex.exec(text)) !== null) {
		const matchStart = match.index;
		const matchEnd = matchStart + match[0].length;
		const content = match[2];
		
		// 如果已经在 gt() 中，跳过
		if (isInGtCall(text, matchStart)) {
			continue;
		}
		
		// 检查是否在注释中
		if (isInComment(text, matchStart, 'typescriptreact')) {
			continue;
		}
		
		// 检查内容是否已经包含 gt() 调用
		if (content.includes('${gt(') || content.includes('gt(')) {
			continue;
		}
		
		// 检查是否在 JSX 标签中
		const beforeMatch = text.substring(Math.max(0, matchStart - 50), matchStart);
		if (!/<\w+[\s>]/.test(beforeMatch) && !/\s/.test(beforeMatch.charAt(beforeMatch.length - 1))) {
			continue;
		}
		
		matches.push({
			match: match[0],
			attr: match[1],
			content: content,
			start: matchStart,
			end: matchEnd
		});
	}
	
	// 从后往前替换
	for (let i = matches.length - 1; i >= 0; i--) {
		const m = matches[i];
		// 提取中文部分
		const chineseParts = extractChineseStrings(m.content);
		if (chineseParts.length === 0) {
			continue;
		}
		
		let newContent = m.content;
		// 从后往前替换每个中文部分
		for (let j = chineseParts.length - 1; j >= 0; j--) {
			const part = chineseParts[j];
			const chineseText = part.text;
			
			// 检查中文前后是否有其他内容
			const beforeText = newContent.substring(0, part.start);
			const afterText = newContent.substring(part.end);
			
			// 如果中文前后有表达式（${...}），需要保留表达式
			if (beforeText.includes('${') || afterText.includes('${')) {
				// 包含表达式的模板字符串，需要用 ${gt('中文')} 的形式
				newContent = beforeText + '${gt(\'' + chineseText + '\')}' + afterText;
			} else {
				// 纯中文模板字符串，直接用 gt('中文')
				newContent = 'gt(\'' + chineseText + '\')';
			}
		}
		
		const replacement = `${m.attr}={${newContent}}`;
		result = result.substring(0, m.start) + replacement + result.substring(m.end);
	}
	
	return result;
}

// 处理 JSX 文本内容中的中文（标签之间的纯文本）
function convertJSXTextContent(text: string): string {
	// 更精确地匹配 JSX 文本节点：>文本< 或 >文本{ 或 }文本<
	// 需要避免匹配到字符串字面量和注释
	
	// 先标记所有字符串字面量和注释，避免误替换
	const stringPlaceholders: { [key: string]: string } = {};
	const commentPlaceholders: { [key: string]: string } = {};
	let placeholderIndex = 0;
	let commentIndex = 0;
	
	// 先标记注释
	let textWithComments = text.replace(
		/\/\/.*$/gm, // 单行注释
		(match) => {
			const placeholder = `__COMMENT_PLACEHOLDER_${commentIndex}__`;
			commentPlaceholders[placeholder] = match;
			commentIndex++;
			return placeholder;
		}
	);
	
	textWithComments = textWithComments.replace(
		/\/\*[\s\S]*?\*\//g, // 多行注释
		(match) => {
			const placeholder = `__COMMENT_PLACEHOLDER_${commentIndex}__`;
			commentPlaceholders[placeholder] = match;
			commentIndex++;
			return placeholder;
		}
	);
	
	// 替换所有字符串字面量（包括模板字符串）
	const textWithPlaceholders = textWithComments.replace(
		/(["'`])(?:(?=(\\?))\2.)*?\1/g,
		(match) => {
			const placeholder = `__STRING_PLACEHOLDER_${placeholderIndex}__`;
			stringPlaceholders[placeholder] = match;
			placeholderIndex++;
			return placeholder;
		}
	);
	
	let result = textWithPlaceholders;
	
	// 匹配 JSX 标签之间的文本内容
	// 匹配模式：
	// 1. >文本<  - 标签之间的文本
	// 2. />文本< - 自闭合标签后的文本
	// 3. >文本{  - 标签后文本，后面是 JSX 表达式
	// 4. }文本<  - JSX 表达式后的文本
	const jsxTextPatterns = [
		// 模式1: >文本< (标签之间的文本，包括 </tag> 的情况)
		// 修复：字符类 [^<{}] 已经包含换行符，使用非贪婪匹配
		/>([^<{}]*?[\u4e00-\u9fa5]+[^<{}]*?)</g,
		// 模式2: />文本< (自闭合标签后的文本)
		/\/>([^<{}]*?[\u4e00-\u9fa5]+[^<{}]*?)</g,
		// 模式3: >文本{ (标签后文本，后面是表达式)
		/>([^<{}]*?[\u4e00-\u9fa5]+[^<{}]*?){/g,
		// 模式4: }文本< (表达式后的文本)
		/}([^<{}]*?[\u4e00-\u9fa5]+[^<{}]*?)</g
	];
	
	const matches: Array<{ match: string; textContent: string; start: number; end: number; prefix: string; suffix: string }> = [];
	const originalResult = result;
	
	// 遍历所有模式
	for (const pattern of jsxTextPatterns) {
		pattern.lastIndex = 0; // 重置正则表达式
		let match;
		
		while ((match = pattern.exec(originalResult)) !== null) {
			const matchStart = match.index;
			const matchEnd = matchStart + match[0].length;
			const textContent = match[1];
			
			// 修复：检查文本内容是否已经包含 gt() 调用（避免重复转换）
			if (textContent.includes('gt(') || textContent.includes('{gt(')) {
				continue;
			}
			
			// 修复：检查是否在 JSX 表达式中（即 {...} 中）
			// 如果是，应该跳过，因为表达式中的内容不应该被文本节点转换处理
			// 但要更精确地检查，避免误判
			const beforeText = originalResult.substring(Math.max(0, matchStart - 200), matchStart);
			const afterText = originalResult.substring(matchEnd, Math.min(originalResult.length, matchEnd + 200));
			
			// 检查前面是否有未闭合的 {（但要排除在字符串中的 {）
			let openBraces = 0;
			let closeBraces = 0;
			let inString = false;
			let stringChar: string | null = null;
			let escape = false;
			
			for (let i = 0; i < beforeText.length; i++) {
				const char = beforeText[i];
				if (escape) {
					escape = false;
					continue;
				}
				if (char === '\\') {
					escape = true;
					continue;
				}
				if (!inString && (char === '"' || char === "'" || char === '`')) {
					inString = true;
					stringChar = char;
				} else if (inString && char === stringChar) {
					inString = false;
					stringChar = null;
				} else if (!inString) {
					if (char === '{') {
						openBraces++;
					} else if (char === '}') {
						closeBraces++;
					}
				}
			}
			
			if (openBraces > closeBraces) {
				// 在 JSX 表达式中，跳过
				continue;
			}
			
			// 检查是否已经在 gt() 中
			if (isInGtCall(originalResult, matchStart)) {
				continue;
			}
			
			// 检查是否在注释占位符中（注释已经被占位符替换）
			// 检查匹配位置前后是否有注释占位符
			if (beforeText.includes('__COMMENT_PLACEHOLDER_') || afterText.includes('__COMMENT_PLACEHOLDER_')) {
				continue;
			}
			
			// 检查 < 后面是否是 </tag>
			// 如果是 </tag>，说明这是标签之间的文本节点，应该转换
			// 例如：<span>文本</span> 中的 "文本" 应该被转换
			// 不需要跳过这种情况，应该转换
			
			// 确定前缀和后缀
			let prefix = '';
			let suffix = '';
			if (match[0].startsWith('>')) {
				prefix = '>';
				suffix = match[0].endsWith('<') ? '<' : '{';
			} else if (match[0].startsWith('/>')) {
				prefix = '/>';
				suffix = '<';
			} else if (match[0].startsWith('}')) {
				prefix = '}';
				suffix = '<';
			}
			
			matches.push({
				match: match[0],
				textContent: textContent,
				start: matchStart,
				end: matchEnd,
				prefix: prefix,
				suffix: suffix
			});
		}
	}
	
	// 按位置排序，从后往前处理
	matches.sort((a, b) => b.start - a.start);
	
	// 从后往前替换，避免索引变化
	// 使用 originalResult 的索引，但替换到 result 中
	// 由于从后往前替换，后面的替换不会影响前面的索引
	for (const m of matches) {
		// 提取中文部分
		const chineseParts = extractChineseStrings(m.textContent);
		if (chineseParts.length === 0) {
			continue;
		}
		
		let convertedContent = m.textContent;
		
		// 从后往前替换每个中文部分
		for (let j = chineseParts.length - 1; j >= 0; j--) {
			const part = chineseParts[j];
			const chineseText = part.text;
			
			// 提取中文前后的文本
			const beforeText = convertedContent.substring(0, part.start);
			const afterText = convertedContent.substring(part.end);
			
			// 修复：检查中文文本的前后是否有其他内容
			// 如果是纯中文文本节点（只包含中文和空白字符），直接用 gt() 包裹整个文本
			const trimmedBefore = beforeText.trim();
			const trimmedAfter = afterText.trim();
			if (trimmedBefore === '' && trimmedAfter === '') {
				// 纯中文文本节点
				convertedContent = `{gt('${chineseText}')}`;
			} else {
				// 混合文本，只包裹中文部分
				convertedContent = beforeText + `{gt('${chineseText}')}` + afterText;
			}
		}
		
		// 替换整个匹配
		// m.match 已经包含了前缀和后缀，所以直接替换整个匹配
		const replacement = m.prefix + convertedContent + m.suffix;
		result = result.substring(0, m.start) + replacement + result.substring(m.end);
	}
	
	// 恢复字符串字面量
	for (const [placeholder, original] of Object.entries(stringPlaceholders)) {
		result = result.replace(placeholder, original);
	}
	
	// 恢复注释
	for (const [placeholder, original] of Object.entries(commentPlaceholders)) {
		result = result.replace(placeholder, original);
	}
	
	return result;
}

// 处理模板字符串中的中文
function convertTemplateStringChinese(text: string): string {
	// 匹配模板字符串：`...中文...` 或 `...${expr}...中文...`
	// 需要处理模板字符串中的中文字面量部分
	// 注意：只处理模板字符串（反引号），不处理普通字符串字面量
	
	let result = text;
	// 只匹配模板字符串（反引号），不匹配普通字符串
	const templateStringRegex = /`([^`]*[\u4e00-\u9fa5]+[^`]*)`/g;
	
	const matches: Array<{ match: string; content: string; start: number; end: number }> = [];
	let match;
	
	while ((match = templateStringRegex.exec(text)) !== null) {
		const matchStart = match.index;
		const matchEnd = matchStart + match[0].length;
		const content = match[1];
		
		// 修复：检查内容是否已经包含 gt() 调用（避免重复转换嵌套模板字符串）
		if (content.includes('${gt(') || content.includes('gt(')) {
			// 如果内容中已经有 gt() 调用，说明已经被处理过，跳过
			continue;
		}
		
		// 检查是否已经在 gt() 中（检查模板字符串的开始位置和结束位置）
		if (isInGtCall(text, matchStart) || isInGtCall(text, matchEnd)) {
			continue;
		}
		
		// 检查是否在注释中
		if (isInComment(text, matchStart, 'typescript')) {
			continue;
		}
		
		// 检查模板字符串内容是否整个都在 gt() 调用中
		// 例如：`gt('中文')` 这种情况应该跳过
		// 或者检查模板字符串是否在 gt() 的参数中
		const beforeTemplate = text.substring(Math.max(0, matchStart - 50), matchStart);
		if (beforeTemplate.match(/gt\s*\(\s*$/)) {
			// 模板字符串紧跟在 gt( 后面，说明是 gt() 的参数，跳过
			continue;
		}
		
		if (content.trim().startsWith('gt(')) {
			// 检查是否整个内容都是 gt() 调用
			let depth = 1;
			let stringChar: string | null = null;
			let escape = false;
			let inGtCall = true;
			
			// 跳过 'gt('
			for (let i = 3; i < content.length; i++) {
				const char = content[i];
				
				if (escape) {
					escape = false;
					continue;
				}
				
				if (char === '\\') {
					escape = true;
					continue;
				}
				
				if (!stringChar && (char === '"' || char === "'" || char === '`')) {
					stringChar = char;
					continue;
				}
				
				if (char === stringChar) {
					stringChar = null;
					continue;
				}
				
				if (!stringChar) {
					if (char === '(') {
						depth++;
					} else if (char === ')') {
						depth--;
						if (depth === 0) {
							// 找到了匹配的右括号
							// 检查后面是否只有空白字符
							const remaining = content.substring(i + 1).trim();
							if (remaining === '') {
								// 整个内容都在 gt() 中，跳过
								continue;
							}
							inGtCall = false;
							break;
						}
					}
				}
			}
		}
		
		// 检查是否在注释中
		if (isInComment(text, matchStart, 'typescript')) {
			continue;
		}
		
		// 检查是否在 JSX 中（JSX 中的模板字符串应该由 JSX 文本节点转换处理）
		// 简单检查：如果模板字符串在 < 和 > 之间，可能是在 JSX 中
		const beforeText = text.substring(Math.max(0, matchStart - 100), matchStart);
		const afterText = text.substring(matchEnd, Math.min(text.length, matchEnd + 100));
		// 如果前面有未闭合的 <，可能是在 JSX 中
		const openTags = (beforeText.match(/</g) || []).length;
		const closeTags = (beforeText.match(/>/g) || []).length;
		if (openTags > closeTags) {
			// 可能在 JSX 中，跳过（由 JSX 文本节点转换处理）
			continue;
		}
		
		// 检查模板字符串中是否包含表达式 ${...}
		// 如果包含表达式，需要更复杂的处理
		if (content.includes('${')) {
			// 处理包含表达式的模板字符串
			// 提取所有中文字面量部分
			const chineseParts = extractChineseStrings(content);
			if (chineseParts.length === 0) {
				continue;
			}
			
			// 构建新的模板字符串，将中文部分用 gt() 包裹
			let newContent = content;
			// 从后往前替换，避免索引变化
			for (let i = chineseParts.length - 1; i >= 0; i--) {
				const part = chineseParts[i];
				const chineseText = part.text;
				
				// 检查中文部分是否在表达式中
				const beforeText = content.substring(0, part.start);
				const afterText = content.substring(part.end);
				
				// 修复：更精确地检查中文是否在 ${} 表达式中
				// 需要计算未闭合的 ${ 数量，考虑字符串中的 ${ 不算
				let inExpression = false;
				let depth = 0;
				let inString = false;
				let stringChar: string | null = null;
				let escape = false;
				
				for (let i = 0; i < beforeText.length; i++) {
					const char = beforeText[i];
					if (escape) {
						escape = false;
						continue;
					}
					if (char === '\\') {
						escape = true;
						continue;
					}
					if (!inString && (char === '"' || char === "'" || char === '`')) {
						inString = true;
						stringChar = char;
						continue;
					}
					if (inString && char === stringChar) {
						inString = false;
						stringChar = null;
						continue;
					}
					if (!inString) {
						if (beforeText.substring(i, i + 2) === '${') {
							depth++;
							i++; // 跳过 $ 和 { 中的 {
							continue;
						} else if (char === '}' && depth > 0) {
							depth--;
						}
					}
				}
				
				// 如果 depth > 0，说明中文在表达式中
				if (depth > 0) {
					// 检查是否是嵌套的模板字符串（在 ${} 表达式中的模板字符串）
					// 例如：`${pathId === "new" ? `新建` : `编辑`}` 中的 `新建` 和 `编辑`
					// 查找最近的未闭合的 ${
					const lastDollarBrace = beforeText.lastIndexOf('${');
					if (lastDollarBrace !== -1) {
						// 检查 ${ 和当前位置之间是否有嵌套的模板字符串
						const betweenText = beforeText.substring(lastDollarBrace + 2);
						// 如果中文在嵌套的模板字符串中（如 `新建`），应该转换为 gt('新建')
						// 而不是 ${gt('新建')}
						const nestedTemplateMatch = betweenText.match(/`([^`]*[\u4e00-\u9fa5]+[^`]*)`/);
						if (nestedTemplateMatch && nestedTemplateMatch.index !== undefined) {
							const nestedStart = lastDollarBrace + 2 + nestedTemplateMatch.index;
							const nestedEnd = nestedStart + nestedTemplateMatch[0].length;
							// 如果当前中文在嵌套模板字符串的范围内
							if (part.start >= nestedStart && part.end <= nestedEnd) {
								// 这是嵌套模板字符串中的中文，应该在 convertNestedTemplateStringChinese 中处理
								continue;
							}
						}
					}
					// 如果不在嵌套模板字符串中，且中文在表达式中，跳过（表达式中的其他中文应该由表达式本身处理）
					continue;
				}
				
				// 检查中文部分是否在 gt() 调用中
				// 在模板字符串内容中查找 gt() 调用
				const contentBeforePart = content.substring(0, part.start);
				const lastGtIndex = contentBeforePart.lastIndexOf('gt(');
				if (lastGtIndex !== -1) {
					// 检查是否在 gt() 调用内部
					const afterGt = content.substring(lastGtIndex);
					const gtMatch = afterGt.match(/^gt\s*\(/);
					if (gtMatch) {
						// 计算括号深度，找到匹配的右括号
						let depth = 1;
						let stringChar: string | null = null;
						let escape = false;
						
						for (let j = gtMatch[0].length; j < afterGt.length; j++) {
							const char = afterGt[j];
							
							if (escape) {
								escape = false;
								continue;
							}
							
							if (char === '\\') {
								escape = true;
								continue;
							}
							
							if (!stringChar && (char === '"' || char === "'" || char === '`')) {
								stringChar = char;
								continue;
							}
							
							if (char === stringChar) {
								stringChar = null;
								continue;
							}
							
							if (!stringChar) {
								if (char === '(') {
									depth++;
								} else if (char === ')') {
									depth--;
									if (depth === 0) {
										// 找到了匹配的右括号
										const gtEndIndex = lastGtIndex + gtMatch[0].length + j;
										if (part.start <= gtEndIndex) {
											// 中文在 gt() 调用内部，跳过
											continue;
										}
										break;
									}
								}
							}
						}
					}
				}
				
				// 替换中文部分（在模板字符串中使用 ${gt('中文')}）
				const before = newContent.substring(0, part.start);
				const after = newContent.substring(part.end);
				newContent = before + '${gt(\'' + chineseText + '\')}' + after;
			}
			
			matches.push({
				match: match[0],
				content: newContent,
				start: matchStart,
				end: matchEnd
			});
		} else {
			// 纯文本模板字符串，直接转换
			// 但需要检查是否包含 gt() 调用
			if (content.includes('gt(')) {
				// 如果包含 gt() 调用，检查是否整个内容都在 gt() 中
				// 如果是，跳过（已经在 gt() 中，不需要再转换）
				const gtMatch = content.match(/gt\s*\(/);
				if (gtMatch) {
					const gtIndex = content.indexOf(gtMatch[0]);
					// 检查 gt() 是否覆盖了整个内容
					let depth = 1;
					let stringChar: string | null = null;
					let escape = false;
					
					for (let i = gtMatch[0].length; i < content.length; i++) {
						const char = content[i];
						
						if (escape) {
							escape = false;
							continue;
						}
						
						if (char === '\\') {
							escape = true;
							continue;
						}
						
						if (!stringChar && (char === '"' || char === "'" || char === '`')) {
							stringChar = char;
							continue;
						}
						
						if (char === stringChar) {
							stringChar = null;
							continue;
						}
						
						if (!stringChar) {
							if (char === '(') {
								depth++;
							} else if (char === ')') {
								depth--;
								if (depth === 0) {
									// 找到了匹配的右括号
									const gtEndIndex = gtIndex + gtMatch[0].length + i;
									// 如果 gt() 覆盖了整个内容（除了反引号），跳过
									if (gtIndex === 0 && gtEndIndex >= content.length - 1) {
										continue;
									}
									break;
								}
							}
						}
					}
				}
			}
			
			const chineseParts = extractChineseStrings(content);
			if (chineseParts.length === 0) {
				continue;
			}
			
			let newContent = content;
			for (let i = chineseParts.length - 1; i >= 0; i--) {
				const part = chineseParts[i];
				const chineseText = part.text;
				
				// 检查中文部分是否在 gt() 调用中
				const contentBeforePart = content.substring(0, part.start);
				const lastGtIndex = contentBeforePart.lastIndexOf('gt(');
				if (lastGtIndex !== -1) {
					const afterGt = content.substring(lastGtIndex);
					const gtMatch = afterGt.match(/^gt\s*\(/);
					if (gtMatch) {
						let depth = 1;
						let stringChar: string | null = null;
						let escape = false;
						
						for (let j = gtMatch[0].length; j < afterGt.length; j++) {
							const char = afterGt[j];
							
							if (escape) {
								escape = false;
								continue;
							}
							
							if (char === '\\') {
								escape = true;
								continue;
							}
							
							if (!stringChar && (char === '"' || char === "'" || char === '`')) {
								stringChar = char;
								continue;
							}
							
							if (char === stringChar) {
								stringChar = null;
								continue;
							}
							
							if (!stringChar) {
								if (char === '(') {
									depth++;
								} else if (char === ')') {
									depth--;
									if (depth === 0) {
										const gtEndIndex = lastGtIndex + gtMatch[0].length + j;
										if (part.start <= gtEndIndex) {
											// 中文在 gt() 调用内部，跳过
											continue;
										}
										break;
									}
								}
							}
						}
					}
				}
				
				const before = newContent.substring(0, part.start);
				const after = newContent.substring(part.end);
				newContent = before + '${gt(\'' + chineseText + '\')}' + after;
			}
			
			matches.push({
				match: match[0],
				content: newContent,
				start: matchStart,
				end: matchEnd
			});
		}
	}
	
	// 从后往前替换
	for (let i = matches.length - 1; i >= 0; i--) {
		const m = matches[i];
		const replacement = '`' + m.content + '`';
		result = result.substring(0, m.start) + replacement + result.substring(m.end);
	}
	
	return result;
}

// 处理嵌套模板字符串中的中文（在 ${} 表达式中的模板字符串）
function convertNestedTemplateStringChinese(text: string): string {
	// 匹配包含嵌套模板字符串的模板字符串表达式
	// 例如：`${pathId === "new" ? `新建` : `编辑`}`
	// 需要找到所有 ${...`中文`...} 的模式，支持多个嵌套模板字符串
	
	let result = text;
	// 修复：改进方法：找到所有模板字符串（包括包含表达式的）
	// 然后检查每个模板字符串中是否包含嵌套的模板字符串
	const templateStringRegex = /`([^`]*)`/g;
	
	const matches: Array<{ fullMatch: string; start: number; end: number; replacement: string }> = [];
	
	let match;
	while ((match = templateStringRegex.exec(text)) !== null) {
		const matchStart = match.index;
		const matchEnd = matchStart + match[0].length;
		const fullMatch = match[0];
		const content = match[1];
		
		// 检查是否已经在 gt() 中
		if (isInGtCall(text, matchStart)) {
			continue;
		}
		
		// 检查是否在注释中
		if (isInComment(text, matchStart, 'typescript')) {
			continue;
		}
		
		// 修复：检查内容是否包含表达式（${...}），如果没有表达式，跳过
		if (!content.includes('${')) {
			continue;
		}
		
		// 修复：查找所有嵌套的模板字符串（在 ${} 表达式中的 `...`）
		// 需要匹配多个嵌套模板字符串，例如：`${pathId === "new" ? `新建` : `编辑`}`
		let newContent = content;
		let changed = false;
		
		// 使用更精确的方法：找到所有表达式 ${...}，然后在每个表达式中查找嵌套的模板字符串
		// 修复：需要正确处理包含嵌套模板字符串的表达式
		// 由于表达式可能包含多个嵌套的模板字符串，需要使用更复杂的解析方法
		// 简单方法：在表达式中查找所有嵌套的模板字符串 `...`，这些模板字符串中如果包含中文，就转换它们
		
		// 修复：改进方法，查找所有包含嵌套模板字符串的表达式
		// 使用更智能的方法：找到所有 ${...} 表达式，然后在每个表达式中查找嵌套的模板字符串
		// 需要处理多个嵌套模板字符串的情况，如 `${pathId === "new" ? `新建` : `编辑`}`
		
		// 先找到所有 ${...} 表达式（需要考虑嵌套的花括号）
		const allExpressions: Array<{ start: number; end: number; content: string }> = [];
		let depth = 0;
		let exprStart = -1;
		
		for (let i = 0; i < content.length; i++) {
			if (content.substring(i, i + 2) === '${') {
				if (depth === 0) {
					exprStart = i + 2; // 跳过 ${
					depth = 1;
				} else {
					depth++;
				}
			} else if (content[i] === '}' && depth > 0) {
				depth--;
				if (depth === 0 && exprStart !== -1) {
					// 找到了一个完整的表达式
					const exprContent = content.substring(exprStart, i);
					// 检查表达式内容中是否包含嵌套的模板字符串
					if (exprContent.includes('`') && exprContent.match(/[\u4e00-\u9fa5]/)) {
						allExpressions.push({
							start: exprStart - 2, // 包括 ${
							end: i + 1, // 包括 }
							content: exprContent
						});
					}
					exprStart = -1;
				}
			}
		}
		
		// 从后往前处理每个表达式
		for (let k = allExpressions.length - 1; k >= 0; k--) {
			const expr = allExpressions[k];
			const exprContent = expr.content;
			
			// 在表达式内容中查找所有嵌套的模板字符串
			const nestedTemplates: Array<{ full: string; content: string; start: number; end: number }> = [];
			const nestedTemplatePattern = /`([^`]*[\u4e00-\u9fa5]+[^`]*)`/g;
			let nestedMatch;
			
			nestedTemplatePattern.lastIndex = 0;
			while ((nestedMatch = nestedTemplatePattern.exec(exprContent)) !== null) {
				nestedTemplates.push({
					full: nestedMatch[0],
					content: nestedMatch[1],
					start: nestedMatch.index,
					end: nestedMatch.index + nestedMatch[0].length
				});
			}
			
			// 从后往前处理每个嵌套模板字符串
			if (nestedTemplates.length > 0) {
				changed = true;
				let exprNewContent = exprContent;
				
				// 从后往前替换，避免索引变化
				for (let i = nestedTemplates.length - 1; i >= 0; i--) {
					const nt = nestedTemplates[i];
					
					const chineseParts = extractChineseStrings(nt.content);
					if (chineseParts.length === 0) {
						continue;
					}
					
					// 替换嵌套模板字符串中的中文为 gt('中文')
					let newNestedContent = nt.content;
					for (let j = chineseParts.length - 1; j >= 0; j--) {
						const part = chineseParts[j];
						const chineseText = part.text;
						const before = newNestedContent.substring(0, part.start);
						const after = newNestedContent.substring(part.end);
						newNestedContent = before + `gt('${chineseText}')` + after;
					}
					
					// 替换整个嵌套模板字符串
					const before = exprNewContent.substring(0, nt.start);
					const after = exprNewContent.substring(nt.end);
					exprNewContent = before + '`' + newNestedContent + '`' + after;
				}
				
				// 替换整个表达式
				const beforeExpr = newContent.substring(0, expr.start);
				const afterExpr = newContent.substring(expr.end);
				newContent = beforeExpr + '${' + exprNewContent + '}' + afterExpr;
			}
		}
		
		if (changed) {
			const replacement = '`' + newContent + '`';
			matches.push({
				fullMatch: fullMatch,
				start: matchStart,
				end: matchEnd,
				replacement: replacement
			});
		}
	}
	
	// 从后往前替换
	for (let i = matches.length - 1; i >= 0; i--) {
		const m = matches[i];
		result = result.substring(0, m.start) + m.replacement + result.substring(m.end);
	}
	
	return result;
}

// 主转换函数
export function convertChineseToGt(text: string, languageId: string): string {
	let result = text;
	
	// 检查文件类型：确保文件是 .ts, .tsx, .js, 或 .jsx
	if (languageId !== 'typescriptreact' && languageId !== 'javascriptreact' && languageId !== 'typescript' && languageId !== 'javascript') {
		return result;
	}
	
	// 按照优先级顺序转换（优先级越高，越先执行）
	// 注意：所有转换函数内部都已有以下检查：
	// 1. 注释中文不处理（isInComment 检查）
	// 2. 已gt()转化的，不再处理（isInGtCall 和包含 gt() 的检查）
	
	// 优先级 3: 转换对象属性（最高优先级）
	result = convertObjectPropertyChinese(result);
	result = convertObjectPropertySingleQuote(result);
	
	// 优先级 4: 转换嵌套对象属性
	result = convertNestedObjectPropertyChinese(result);
	
	// 优先级 5: 转换 JSX 属性，标签组件属性（仅对 TSX/JSX 文件）
	if (languageId === 'typescriptreact' || languageId === 'javascriptreact') {
		result = convertJSXAttributeChinese(result);
		// 转换 JSX 属性中的模板字符串（如 title={`中文`}）
		result = convertJSXAttributeTemplateString(result);
	}
	
	// 优先级 6: 转换JSX 嵌套对象属性，标签组件属性（仅对 TSX/JSX 文件）
	if (languageId === 'typescriptreact' || languageId === 'javascriptreact') {
		result = convertJSXNestedObjectPropertyChinese(result);
	}
	
	// 其他转换（在对象属性和JSX属性之后）
	// 处理嵌套模板字符串中的中文（在 ${} 表达式中的模板字符串）
	result = convertNestedTemplateStringChinese(result);
	
	// 处理函数调用参数中的中文
	result = convertFunctionCallChinese(result);
	
	// 处理模板字符串中的中文
	result = convertTemplateStringChinese(result);
	
	// 处理 JSX 文本节点中的中文（仅对 TSX/JSX 文件）
	if (languageId === 'typescriptreact' || languageId === 'javascriptreact') {
		result = convertJSXTextContent(result);
	}
	
	// 处理普通赋值语句中的中文（最后处理，避免误匹配）
	result = convertAssignmentChinese(result);
	
	return result;
}

