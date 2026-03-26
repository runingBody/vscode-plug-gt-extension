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

type I18nSyncResult = {
	moduleFilesUpdated: number;
	globalFilesUpdated: number;
	warnings: string[];
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

			const syncResult = syncDocumentI18n(document.uri, report.messages, document.uri.fsPath);
			showSingleFileResult('File converted successfully!', syncResult);
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

			const syncResult = syncDocumentI18n(document.uri, report.messages, document.uri.fsPath);
			showSingleFileResult('Selection converted successfully!', syncResult);
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

						const syncResult = syncModuleMessageMap(moduleMessages, workspaceRoot);

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

function syncDocumentI18n(uri: vscode.Uri, messages: string[], targetPath: string): I18nSyncResult {
	const workspaceRoot = findWorkspaceRootFromUri(uri);
	if (!workspaceRoot || uri.scheme !== 'file') {
		return {
			moduleFilesUpdated: 0,
			globalFilesUpdated: 0,
			warnings: messages.length > 0 ? ['当前文件不在本地工作区，已跳过 i18n 文件生成。'] : []
		};
	}

	const moduleDir = resolveModuleRoot(targetPath, workspaceRoot);
	const messageMap = new Map<string, Set<string>>();
	messageMap.set(moduleDir, new Set(messages));
	return syncModuleMessageMap(messageMap, workspaceRoot);
}

function syncModuleMessageMap(
	moduleMessages: Map<string, Set<string>>,
	workspaceRoot: string | undefined
): I18nSyncResult {
	if (!workspaceRoot || moduleMessages.size === 0) {
		return { moduleFilesUpdated: 0, globalFilesUpdated: 0, warnings: [] };
	}

	let moduleFilesUpdated = 0;
	let globalFilesUpdated = 0;
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
		const nextModuleContent = mergeModuleTranslationContent(
			existingModuleContent,
			messages,
			translationMemory
		);

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
		warnings
	};
}

function showSingleFileResult(baseMessage: string, syncResult: I18nSyncResult) {
	const suffixParts: string[] = [];

	if (syncResult.moduleFilesUpdated > 0) {
		suffixParts.push(`模块 i18n 更新 ${syncResult.moduleFilesUpdated} 个`);
	}

	if (syncResult.globalFilesUpdated > 0) {
		suffixParts.push(`全局聚合更新 ${syncResult.globalFilesUpdated} 个`);
	}

	const message = suffixParts.length > 0
		? `${baseMessage} ${suffixParts.join(', ')}.`
		: baseMessage;

	if (syncResult.warnings.length > 0) {
		vscode.window.showWarningMessage(`${message} ${syncResult.warnings.join(' ')}`);
		return;
	}

	vscode.window.showInformationMessage(message);
}

function buildFolderSuccessMessage(convertedCount: number, syncResult: I18nSyncResult): string {
	const parts = [`转换完成！共转换了 ${convertedCount} 个文件。`];

	if (syncResult.moduleFilesUpdated > 0) {
		parts.push(`模块 i18n 更新 ${syncResult.moduleFilesUpdated} 个。`);
	}

	if (syncResult.globalFilesUpdated > 0) {
		parts.push(`全局聚合更新 ${syncResult.globalFilesUpdated} 个。`);
	}

	if (syncResult.warnings.length > 0) {
		parts.push(syncResult.warnings.join(' '));
	}

	return parts.join(' ');
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
