import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { convertChineseToGtWithReport } from './converter';
import {
	buildImportName,
	mergeModuleTranslationContent,
	parseTranslationMemory,
	toImportPath,
	upsertGlobalNamespaceContent
} from './i18n-helper';
import {
	DirectTranslationConfig,
	translateMessagesWithDirectProvider
} from './translator';

type I18nSyncResult = {
	moduleFilesUpdated: number;
	globalFilesUpdated: number;
	unresolvedMessages: string[];
	samgeTranslateAttempted: boolean;
	samgeTranslateSkippedForMissingConfig: boolean;
	warnings: string[];
};

type SamgeTranslateConfig = {
	providerName: string;
	providerAppId: string;
	providerAppSecret: string;
};

type SamgeCommandReadResult = {
	value?: string;
	fatalError?: boolean;
};

const INDEX_FILE_NAMES = ['index.tsx', 'index.ts', 'index.jsx', 'index.js'];
const MODULE_ROOT_MARKER_FILES = ['ui-helper.tsx', 'ui-content.ts', 'page.tsx'];
const MODULE_CHILD_DIR_NAMES = new Set([
	'components',
	'component',
	'hooks',
	'utils',
	'services',
	'service',
	'constants',
	'constant',
	'types',
	'models',
	'apis',
	'api',
	'store',
	'stores',
	'config'
]);

let hasShownSamgeConfigPrompt = false;

export function activate(context: vscode.ExtensionContext) {
	console.log('Chinese to gt() converter is now active!');

	// 转换整个文件
	const convertFileCommand = vscode.commands.registerCommand(
		'chineseToGt.convertFile',
		async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showWarningMessage('No active editor found.');
				return;
			}

			const document = editor.document;
			const fullText = document.getText();
			const report = convertChineseToGtWithReport(fullText, document.languageId);
			const convertedText = report.text;

			if (convertedText === fullText) {
				vscode.window.showInformationMessage('No convertible Chinese text found.');
				return;
			}

			await editor.edit((editBuilder) => {
				const fullRange = new vscode.Range(
					document.positionAt(0),
					document.positionAt(fullText.length)
				);
				editBuilder.replace(fullRange, convertedText);
			});

			const syncResult = await syncDocumentI18n(document.uri, report.messages, document.uri.fsPath);
			await maybeHandleSamgeTranslateAssistance(syncResult);
			showSingleFileResult('执行成功！', syncResult);
		}
	);

	// 转换选中的内容
	const convertSelectionCommand = vscode.commands.registerCommand(
		'chineseToGt.convertSelection',
		async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showWarningMessage('No active editor found.');
				return;
			}

			const selection = editor.selection;
			if (selection.isEmpty) {
				vscode.window.showWarningMessage('Please select text to convert.');
				return;
			}

			const document = editor.document;
			const selectedText = document.getText(selection);
			const report = convertChineseToGtWithReport(selectedText, document.languageId);
			const convertedText = report.text;

			if (convertedText === selectedText) {
				vscode.window.showInformationMessage('No convertible Chinese text found in selection.');
				return;
			}

			await editor.edit((editBuilder) => {
				editBuilder.replace(selection, convertedText);
			});

			const syncResult = await syncDocumentI18n(document.uri, report.messages, document.uri.fsPath);
			await maybeHandleSamgeTranslateAssistance(syncResult);
			showSingleFileResult('执行成功！', syncResult);
		}
	);

	// 转换文件夹中的所有文件
	const convertFolderCommand = vscode.commands.registerCommand(
		'chineseToGt.convertFolder',
		async (uri: vscode.Uri) => {
			// 如果没有传入 uri，尝试从资源管理器获取
			let targetUri = uri;
			if (!targetUri) {
				// 尝试从活动编辑器获取文件路径
				const editor = vscode.window.activeTextEditor;
				if (editor) {
					targetUri = editor.document.uri;
				} else {
					vscode.window.showWarningMessage('请选择一个文件夹或文件。');
					return;
				}
			}

			// 获取文件或文件夹路径
			const fsPath = targetUri.fsPath;
			let folderPath: string;
			let filesToConvert: string[] = [];

			try {
				const stats = fs.statSync(fsPath);
				if (stats.isDirectory()) {
					folderPath = fsPath;
				} else if (stats.isFile()) {
					// 如果是文件，转换其所在文件夹
					folderPath = path.dirname(fsPath);
				} else {
					vscode.window.showWarningMessage('请选择一个有效的文件夹或文件。');
					return;
				}

				// 收集所有需要转换的文件
				filesToConvert = collectFiles(folderPath);
				
				if (filesToConvert.length === 0) {
					vscode.window.showInformationMessage('文件夹中没有找到需要转换的文件。');
					return;
				}

				// 确认操作
				const confirmMessage = `找到 ${filesToConvert.length} 个文件，是否继续转换？`;
				const confirm = await vscode.window.showWarningMessage(
					confirmMessage,
					{ modal: true },
					'确定'
				);

				if (confirm !== '确定') {
					return;
				}

				// 显示进度
				await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: '转换文件夹中的文件',
						cancellable: true
					},
					async (progress, token) => {
						let convertedCount = 0;
						let errorCount = 0;
						const moduleMessages = new Map<string, Set<string>>();
						let workspaceRoot: string | undefined;
						let targetModuleRoot: string | undefined;

						for (let i = 0; i < filesToConvert.length; i++) {
							if (token.isCancellationRequested) {
								vscode.window.showInformationMessage('转换已取消。');
								break;
							}

							const filePath = filesToConvert[i];
							const relativePath = path.relative(folderPath, filePath);
							
							progress.report({
								increment: 100 / filesToConvert.length,
								message: `正在转换: ${relativePath}`
							});

							try {
								// 读取文件内容
								const fileContent = fs.readFileSync(filePath, 'utf-8');
								
								// 获取文件扩展名以确定语言类型
								const ext = path.extname(filePath).toLowerCase();
								const languageId = getLanguageId(ext);
								
								// 转换内容
								const report = convertChineseToGtWithReport(fileContent, languageId);
								const convertedContent = report.text;
								
								// 如果内容有变化，写入文件
								if (fileContent !== convertedContent) {
									fs.writeFileSync(filePath, convertedContent, 'utf-8');
									convertedCount++;

										if (!workspaceRoot) {
											workspaceRoot = findWorkspaceRootFromPath(filePath);
										}

										if (!targetModuleRoot && workspaceRoot) {
											targetModuleRoot = resolveModuleRoot(targetUri.fsPath, workspaceRoot);
										}

										if (workspaceRoot && targetModuleRoot) {
											const existing = moduleMessages.get(targetModuleRoot) ?? new Set<string>();
											for (const message of report.messages) {
												existing.add(message);
											}
											moduleMessages.set(targetModuleRoot, existing);
										}
									}
							} catch (error) {
								console.error(`转换文件失败: ${filePath}`, error);
								errorCount++;
							}
						}

							const syncResult = await syncModuleMessageMap(moduleMessages, workspaceRoot);
							await maybeHandleSamgeTranslateAssistance(syncResult);

							// 显示完成消息
						if (errorCount === 0) {
							vscode.window.showInformationMessage(
								buildFolderSuccessMessage(convertedCount, syncResult)
							);
						} else {
							vscode.window.showWarningMessage(
								`${buildFolderSuccessMessage(convertedCount, syncResult)} 失败: ${errorCount} 个。`
							);
						}
					}
				);
			} catch (error) {
				vscode.window.showErrorMessage(`转换文件夹时出错: ${error}`);
			}
		}
	);

	context.subscriptions.push(convertFileCommand, convertSelectionCommand, convertFolderCommand);
}

// 收集文件夹中所有需要转换的文件
function collectFiles(folderPath: string): string[] {
	const files: string[] = [];
	const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx'];

	function walkDir(dir: string) {
		try {
			const entries = fs.readdirSync(dir, { withFileTypes: true });
			
			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);
				
				// 跳过 node_modules、.git 等常见目录
				if (entry.isDirectory()) {
					if (entry.name === 'node_modules' || 
						entry.name === '.git' || 
						entry.name === 'dist' ||
						entry.name === 'build' ||
						entry.name === '.next' ||
						entry.name === 'out' ||
						entry.name === '_i18n' ||
						entry.name === 'i18n') {
						continue;
					}
					walkDir(fullPath);
				} else if (entry.isFile()) {
					const ext = path.extname(entry.name).toLowerCase();
					if (supportedExtensions.includes(ext)) {
						files.push(fullPath);
					}
				}
			}
		} catch (error) {
			console.error(`读取目录失败: ${dir}`, error);
		}
	}

	walkDir(folderPath);
	return files;
}

function findWorkspaceRootFromUri(uri: vscode.Uri): string | undefined {
	return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
}

function findWorkspaceRootFromPath(filePath: string): string | undefined {
	const workspaceFolder = vscode.workspace.workspaceFolders?.find((folder) => {
		const folderPath = folder.uri.fsPath;
		return filePath === folderPath || filePath.startsWith(`${folderPath}${path.sep}`);
	});

	return workspaceFolder?.uri.fsPath;
}

function hasIndexFile(dir: string): boolean {
	return INDEX_FILE_NAMES.some((fileName) => fs.existsSync(path.join(dir, fileName)));
}

function hasModuleRootMarker(dir: string): boolean {
	return MODULE_ROOT_MARKER_FILES.some((fileName) => fs.existsSync(path.join(dir, fileName)));
}

function resolveModuleRoot(targetPath: string, workspaceRoot: string): string {
	let currentDir = fs.statSync(targetPath).isDirectory() ? targetPath : path.dirname(targetPath);
	const baseName = path.basename(targetPath);

	if (!fs.statSync(targetPath).isDirectory() && MODULE_ROOT_MARKER_FILES.includes(baseName)) {
		return currentDir;
	}

	if (path.basename(currentDir) === '_i18n') {
		currentDir = path.dirname(currentDir);
	}

	let cursor = currentDir;

	while (cursor.startsWith(workspaceRoot) && cursor !== workspaceRoot) {
		if (hasModuleRootMarker(cursor)) {
			return cursor;
		}

		if (hasIndexFile(cursor)) {
			return cursor;
		}

		const baseName = path.basename(cursor);
		if (MODULE_CHILD_DIR_NAMES.has(baseName)) {
			return path.dirname(cursor);
		}

		const parent = path.dirname(cursor);
		if (parent === cursor) {
			break;
		}

		cursor = parent;
	}

	return currentDir;
}

function resolveGlobalNamespaceFile(workspaceRoot: string): string | undefined {
	const candidates = [
		path.join(workspaceRoot, 'src', 'i18n', 'namespace', 'global', 'en.ts'),
		path.join(workspaceRoot, 'src', 'i18n', 'namespace', 'global', 'en.tsx')
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	const i18nRoot = path.join(workspaceRoot, 'src', 'i18n');
	if (fs.existsSync(i18nRoot) && fs.statSync(i18nRoot).isDirectory()) {
		return candidates[0];
	}

	return undefined;
}

async function syncDocumentI18n(uri: vscode.Uri, messages: string[], targetPath: string): Promise<I18nSyncResult> {
	const workspaceRoot = findWorkspaceRootFromUri(uri);
	if (!workspaceRoot || uri.scheme !== 'file') {
		return {
			moduleFilesUpdated: 0,
			globalFilesUpdated: 0,
			unresolvedMessages: [],
			samgeTranslateAttempted: false,
			samgeTranslateSkippedForMissingConfig: false,
			warnings: messages.length > 0 ? ['当前文件不在本地工作区，已跳过 i18n 文件生成。'] : []
		};
	}

	const moduleDir = resolveModuleRoot(targetPath, workspaceRoot);
	const messageMap = new Map<string, Set<string>>();
	messageMap.set(moduleDir, new Set(messages));
	return await syncModuleMessageMap(messageMap, workspaceRoot);
}

async function syncModuleMessageMap(
	moduleMessages: Map<string, Set<string>>,
	workspaceRoot: string | undefined
): Promise<I18nSyncResult> {
	if (!workspaceRoot || moduleMessages.size === 0) {
		return {
			moduleFilesUpdated: 0,
			globalFilesUpdated: 0,
			unresolvedMessages: [],
			samgeTranslateAttempted: false,
			samgeTranslateSkippedForMissingConfig: false,
			warnings: []
		};
	}

	let moduleFilesUpdated = 0;
	let globalFilesUpdated = 0;
	const unresolvedMessages = new Set<string>();
	let samgeTranslateAttempted = false;
	let samgeTranslateSkippedForMissingConfig = false;
	const warnings: string[] = [];
	const globalNamespaceFile = resolveGlobalNamespaceFile(workspaceRoot);
	const translationMemory = parseTranslationMemory(
		globalNamespaceFile && fs.existsSync(globalNamespaceFile)
			? fs.readFileSync(globalNamespaceFile, 'utf-8')
			: undefined
	);

	for (const [moduleDir, messageSet] of moduleMessages) {
		const messages = Array.from(messageSet);
		if (messages.length === 0) {
			continue;
		}

		const moduleI18nDir = path.join(moduleDir, '_i18n');
		const moduleEnFile = path.join(moduleI18nDir, 'en.ts');
		const existingModuleContent = fs.existsSync(moduleEnFile)
			? fs.readFileSync(moduleEnFile, 'utf-8')
			: undefined;
		let mergeResult = mergeModuleTranslationContent(
			existingModuleContent,
			messages,
			translationMemory
		);

		if (mergeResult.unresolvedMessages.length > 0) {
			const directResult = await translateMessagesWithDirectProvider(
				mergeResult.unresolvedMessages,
				getDirectTranslationConfig()
			);

			if (directResult.translations.size > 0) {
				const mergedTranslationMemory = new Map(translationMemory);
				for (const [message, translatedValue] of directResult.translations) {
					mergedTranslationMemory.set(message, translatedValue);
				}

				mergeResult = mergeModuleTranslationContent(
					existingModuleContent,
					messages,
					mergedTranslationMemory
				);
			}
		}

		if (mergeResult.unresolvedMessages.length > 0) {
			const samgeResult = await tryTranslateMessagesWithSamge(mergeResult.unresolvedMessages);
			samgeTranslateAttempted = samgeTranslateAttempted || samgeResult.attempted;
			samgeTranslateSkippedForMissingConfig =
				samgeTranslateSkippedForMissingConfig || samgeResult.skippedForMissingConfig;

			if (samgeResult.translations.size > 0) {
				const mergedTranslationMemory = new Map(translationMemory);
				for (const [message, translatedValue] of samgeResult.translations) {
					mergedTranslationMemory.set(message, translatedValue);
				}

				mergeResult = mergeModuleTranslationContent(
					existingModuleContent,
					messages,
					mergedTranslationMemory
				);
			}
		}

		const nextModuleContent = mergeResult.content;
		for (const unresolvedMessage of mergeResult.unresolvedMessages) {
			unresolvedMessages.add(unresolvedMessage);
		}

		fs.mkdirSync(moduleI18nDir, { recursive: true });
		if (existingModuleContent !== nextModuleContent) {
			fs.writeFileSync(moduleEnFile, nextModuleContent, 'utf-8');
			moduleFilesUpdated++;
		}

		if (!globalNamespaceFile) {
			continue;
		}

		const importName = buildImportName(moduleDir, workspaceRoot);
		const importPath = toImportPath(globalNamespaceFile, moduleEnFile);
		const existingGlobalContent = fs.existsSync(globalNamespaceFile)
			? fs.readFileSync(globalNamespaceFile, 'utf-8')
			: undefined;
		const nextGlobalContent = upsertGlobalNamespaceContent(
			existingGlobalContent,
			importName,
			importPath
		);

		fs.mkdirSync(path.dirname(globalNamespaceFile), { recursive: true });
		if (existingGlobalContent !== nextGlobalContent) {
			fs.writeFileSync(globalNamespaceFile, nextGlobalContent, 'utf-8');
			globalFilesUpdated++;
		}
	}

	if (!globalNamespaceFile) {
		warnings.push('未找到 src/i18n 目录，已仅生成模块级 _i18n/en.ts。');
	}

	return {
		moduleFilesUpdated,
		globalFilesUpdated,
		unresolvedMessages: Array.from(unresolvedMessages),
		samgeTranslateAttempted,
		samgeTranslateSkippedForMissingConfig,
		warnings
	};
}

function getSamgeTranslateExtension(): vscode.Extension<any> | undefined {
	return vscode.extensions.getExtension('samge.vscode-samge-translate');
}

function getDirectTranslationConfig(): DirectTranslationConfig {
	const config = vscode.workspace.getConfiguration();
	const providerSetting = config.get<string>('chineseToGt.translation.provider')?.trim().toLowerCase() ?? 'auto';
	const ownAccessKeyId = config.get<string>('chineseToGt.translation.alibaba.accessKeyId')?.trim() ?? '';
	const ownAccessKeySecret = config.get<string>('chineseToGt.translation.alibaba.accessKeySecret')?.trim() ?? '';
	const samgeProviderName = config.get<string>('samge.translate.providerName')?.trim().toLowerCase() ?? '';
	const samgeAccessKeyId = config.get<string>('samge.translate.providerAppId')?.trim() ?? '';
	const samgeAccessKeySecret = config.get<string>('samge.translate.providerAppSecret')?.trim() ?? '';

	if (providerSetting === 'none') {
		return {
			provider: 'none',
			accessKeyId: '',
			accessKeySecret: ''
		};
	}

	if (providerSetting === 'alibaba') {
		return {
			provider: 'alibaba',
			accessKeyId: ownAccessKeyId || samgeAccessKeyId,
			accessKeySecret: ownAccessKeySecret || samgeAccessKeySecret
		};
	}

	if (ownAccessKeyId && ownAccessKeySecret) {
		return {
			provider: 'alibaba',
			accessKeyId: ownAccessKeyId,
			accessKeySecret: ownAccessKeySecret
		};
	}

	if (samgeProviderName === 'alibaba' && samgeAccessKeyId && samgeAccessKeySecret) {
		return {
			provider: 'alibaba',
			accessKeyId: samgeAccessKeyId,
			accessKeySecret: samgeAccessKeySecret
		};
	}

	return {
		provider: 'none',
		accessKeyId: '',
		accessKeySecret: ''
	};
}

function hasDirectTranslationProviderConfigured(): boolean {
	const config = getDirectTranslationConfig();
	return Boolean(
		config.provider !== 'none' &&
		config.accessKeyId.trim() &&
		config.accessKeySecret.trim()
	);
}

function getSamgeTranslateConfig(): SamgeTranslateConfig {
	const config = vscode.workspace.getConfiguration();

	return {
		providerName: config.get<string>('samge.translate.providerName')?.trim().toLowerCase() ?? 'baidu',
		providerAppId: config.get<string>('samge.translate.providerAppId')?.trim() ?? '',
		providerAppSecret: config.get<string>('samge.translate.providerAppSecret')?.trim() ?? ''
	};
}

function hasSamgeTranslateCredentials(): boolean {
	const { providerName, providerAppId, providerAppSecret } = getSamgeTranslateConfig();

	if (providerName === 'deepl') {
		return Boolean(providerAppId || providerAppSecret);
	}

	return Boolean(providerAppId && providerAppSecret);
}

function findSamgeCommandId(extension: vscode.Extension<any>, candidates: string[]): string | undefined {
	const commands = extension.packageJSON?.contributes?.commands;
	if (!Array.isArray(commands)) {
		return undefined;
	}

	const commandIds = new Set<string>();
	for (const item of commands) {
		if (typeof item?.command === 'string') {
			commandIds.add(item.command);
		}
	}

	return candidates.find((commandId) => commandIds.has(commandId));
}

function normalizeSamgeResult(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		return '';
	}

	return trimmed
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[^a-zA-Z0-9]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join('');
}

function isInvalidSamgeResult(value: string, sourceText: string): boolean {
	const trimmed = value.trim();
	if (!trimmed || trimmed === sourceText.trim()) {
		return true;
	}

	return /providerapp(id|secret)|appid|appsecret|【error】|error|failed|unsupported|配置|请检查/i.test(trimmed);
}

function isSamgeFatalMessage(value: string): boolean {
	const trimmed = value.trim();
	if (!trimmed) {
		return false;
	}

	if (/【error】|providerapp(id|secret)|appsecret|unsupported/i.test(trimmed)) {
		return true;
	}

	return /[\u4e00-\u9fa5]/.test(trimmed) && /(appid|appId|请检查|配置|不存在|无效|失败)/i.test(trimmed);
}

async function readTranslatedTextFromCommand(commandId: string, sourceText: string): Promise<SamgeCommandReadResult> {
	const previousEditor = vscode.window.activeTextEditor;
	const document = await vscode.workspace.openTextDocument({
		content: sourceText,
		language: 'plaintext'
	});
	const editor = await vscode.window.showTextDocument(document, {
		preview: true,
		preserveFocus: false
	});

	const fullRange = new vscode.Range(
		document.positionAt(0),
		document.positionAt(document.getText().length)
	);
	editor.selection = new vscode.Selection(fullRange.start, fullRange.end);

	try {
		const commandResult = await vscode.commands.executeCommand(commandId);
		if (typeof commandResult === 'string' && commandResult.trim()) {
			if (isSamgeFatalMessage(commandResult)) {
				return { fatalError: true };
			}

			if (!isInvalidSamgeResult(commandResult, sourceText)) {
				return { value: commandResult.trim() };
			}
		}

		for (let attempt = 0; attempt < 10; attempt++) {
			await new Promise((resolve) => setTimeout(resolve, 150));
			const currentText = document.getText().trim();
			if (isSamgeFatalMessage(currentText)) {
				return { fatalError: true };
			}

			if (currentText && !isInvalidSamgeResult(currentText, sourceText)) {
				return { value: currentText };
			}
		}
	} catch (error) {
		console.error(`调用 Samge Translate 命令失败: ${commandId}`, error);
	} finally {
		await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
		if (previousEditor) {
			await vscode.window.showTextDocument(previousEditor.document, previousEditor.viewColumn);
		}
	}

	return {};
}

async function tryTranslateMessagesWithSamge(messages: string[]): Promise<{
	translations: Map<string, string>;
	attempted: boolean;
	skippedForMissingConfig: boolean;
}> {
	const extension = getSamgeTranslateExtension();
	if (!extension) {
		return {
			translations: new Map<string, string>(),
			attempted: false,
			skippedForMissingConfig: false
		};
	}

	if (!hasSamgeTranslateCredentials()) {
		return {
			translations: new Map<string, string>(),
			attempted: false,
			skippedForMissingConfig: true
		};
	}

	await extension.activate();

	const zh2varPascalCaseCommandId = findSamgeCommandId(extension, [
		'samge.translate.zh2varPascalCase',
		'samge.translate.zh2var'
	]);
	const zh2enReplaceCommandId = findSamgeCommandId(extension, [
		'samge.translate.zh2enReplace',
		'samge.translate.zh2en'
	]);
	if (!zh2varPascalCaseCommandId && !zh2enReplaceCommandId) {
		return {
			translations: new Map<string, string>(),
			attempted: true,
			skippedForMissingConfig: false
		};
	}

	const translations = new Map<string, string>();
	let shouldStopTrying = false;

	for (const message of messages) {
		if (shouldStopTrying) {
			break;
		}

		const zh2varResult = zh2varPascalCaseCommandId
			? await readTranslatedTextFromCommand(zh2varPascalCaseCommandId, message)
			: {};
		if (zh2varResult.fatalError) {
			shouldStopTrying = true;
			break;
		}

		const normalizedZh2Var = zh2varResult.value ? normalizeSamgeResult(zh2varResult.value) : '';
		if (normalizedZh2Var) {
			translations.set(message, normalizedZh2Var);
			continue;
		}

		const zh2enResult = zh2enReplaceCommandId
			? await readTranslatedTextFromCommand(zh2enReplaceCommandId, message)
			: {};
		if (zh2enResult.fatalError) {
			shouldStopTrying = true;
			break;
		}

		const normalizedZh2En = zh2enResult.value ? normalizeSamgeResult(zh2enResult.value) : '';
		if (normalizedZh2En) {
			translations.set(message, normalizedZh2En);
		}
	}

	return {
		translations,
		attempted: true,
		skippedForMissingConfig: false
	};
}

async function maybeInstallSamgeTranslate() {
	try {
		await vscode.commands.executeCommand(
			'workbench.extensions.installExtension',
			'samge.vscode-samge-translate'
		);
		vscode.window.showInformationMessage('VSCode Samge Translate 安装完成后，请重新执行中文转换。');
	} catch (error) {
		vscode.window.showWarningMessage(`自动安装 VSCode Samge Translate 失败，请手动安装。${error}`);
	}
}

async function maybeHandleSamgeTranslateAssistance(syncResult: I18nSyncResult) {
	if (syncResult.unresolvedMessages.length === 0) {
		return;
	}

	const extension = getSamgeTranslateExtension();
	if (!extension) {
		return;
	}

	if (syncResult.samgeTranslateSkippedForMissingConfig) {
		if (hasShownSamgeConfigPrompt) {
			return;
		}

		hasShownSamgeConfigPrompt = true;
		vscode.window.showInformationMessage(
			'请检查/配置 appId，具体配置请参照 VSCode Samge Translate 插件的详细说明'
		);
	}
}

function showSingleFileResult(baseMessage: string, syncResult: I18nSyncResult) {
	let message = baseMessage;

	if (
		syncResult.unresolvedMessages.length > 0 &&
		!getSamgeTranslateExtension() &&
		!hasDirectTranslationProviderConfigured()
	) {
		message = `${baseMessage} 。建议安装“VSCode Samge Translate”插件，执行更完善的自动翻译。`;
	}

	if (syncResult.warnings.length > 0) {
		vscode.window.showWarningMessage(`${message} ${syncResult.warnings.join(' ')}`);
		return;
	}

	vscode.window.showInformationMessage(message);
}

function buildFolderSuccessMessage(convertedCount: number, syncResult: I18nSyncResult): string {
	let message = `执行成功！共转换了 ${convertedCount} 个文件。`;

	if (
		syncResult.unresolvedMessages.length > 0 &&
		!getSamgeTranslateExtension() &&
		!hasDirectTranslationProviderConfigured()
	) {
		message += ' 建议安装“VSCode Samge Translate”插件，执行更完善的自动翻译。';
	}

	if (syncResult.warnings.length > 0) {
		message += ` ${syncResult.warnings.join(' ')}`;
	}

	return message;
}

// 根据文件扩展名获取语言 ID
function getLanguageId(ext: string): string {
	switch (ext) {
		case '.tsx':
			return 'typescriptreact';
		case '.jsx':
			return 'javascriptreact';
		case '.ts':
			return 'typescript';
		case '.js':
			return 'javascript';
		default:
			return 'typescript';
	}
}

export function deactivate() {}
