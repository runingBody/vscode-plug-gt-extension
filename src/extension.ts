import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { convertChineseToGt } from './converter';

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
			const convertedText = convertChineseToGt(fullText, document.languageId);

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

			vscode.window.showInformationMessage('File converted successfully!');
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
			const convertedText = convertChineseToGt(selectedText, document.languageId);

			if (convertedText === selectedText) {
				vscode.window.showInformationMessage('No convertible Chinese text found in selection.');
				return;
			}

			await editor.edit((editBuilder) => {
				editBuilder.replace(selection, convertedText);
			});

			vscode.window.showInformationMessage('Selection converted successfully!');
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
								const convertedContent = convertChineseToGt(fileContent, languageId);
								
								// 如果内容有变化，写入文件
								if (fileContent !== convertedContent) {
									fs.writeFileSync(filePath, convertedContent, 'utf-8');
									convertedCount++;
								}
							} catch (error) {
								console.error(`转换文件失败: ${filePath}`, error);
								errorCount++;
							}
						}

						// 显示完成消息
						if (errorCount === 0) {
							vscode.window.showInformationMessage(
								`转换完成！共转换了 ${convertedCount} 个文件。`
							);
						} else {
							vscode.window.showWarningMessage(
								`转换完成！成功: ${convertedCount} 个，失败: ${errorCount} 个。`
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
						entry.name === 'out') {
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
