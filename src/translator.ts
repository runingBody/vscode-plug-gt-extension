import * as crypto from 'crypto';
import * as https from 'https';

export type DirectTranslationProvider = 'none' | 'alibaba';

export type DirectTranslationConfig = {
	provider: DirectTranslationProvider;
	accessKeyId: string;
	accessKeySecret: string;
};

export type DirectTranslationResult = {
	translations: Map<string, string>;
	attempted: boolean;
	missingConfig: boolean;
};

const ALIBABA_ENDPOINT = 'https://mt.cn-hangzhou.aliyuncs.com/';
const ALIBABA_API_VERSION = '2018-10-12';

export function percentEncode(value: string): string {
	return encodeURIComponent(value)
		.replace(/\!/g, '%21')
		.replace(/\'/g, '%27')
		.replace(/\(/g, '%28')
		.replace(/\)/g, '%29')
		.replace(/\*/g, '%2A');
}

export function buildCanonicalizedQueryString(params: Record<string, string>): string {
	return Object.keys(params)
		.sort()
		.map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
		.join('&');
}

export function buildStringToSign(method: 'GET' | 'POST', canonicalizedQueryString: string): string {
	return `${method}&${percentEncode('/')}&${percentEncode(canonicalizedQueryString)}`;
}

export function generateSignature(accessKeySecret: string, stringToSign: string): string {
	return crypto
		.createHmac('sha1', `${accessKeySecret}&`)
		.update(stringToSign, 'utf8')
		.digest('base64');
}

function toIso8601(date: Date): string {
	return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function hasAlibabaCredentials(config: DirectTranslationConfig): boolean {
	return Boolean(config.accessKeyId.trim() && config.accessKeySecret.trim());
}

function parseAlibabaTranslateGeneralResponse(payload: any): string | undefined {
	const root = payload?.TranslateGeneralResponse ?? payload;
	const code = root?.Code;
	const message = root?.Message;

	if (code !== undefined && String(code) !== '200') {
		throw new Error(typeof message === 'string' && message.trim() ? message.trim() : `Alibaba translate failed: ${code}`);
	}

	const translated = root?.Data?.Translated;
	return typeof translated === 'string' && translated.trim() ? translated.trim() : undefined;
}

function requestJson(url: string): Promise<any> {
	return new Promise((resolve, reject) => {
		const request = https.get(
			url,
			{
				headers: {
					Accept: 'application/json'
				}
			},
			(response) => {
				const chunks: Buffer[] = [];
				response.on('data', (chunk) => {
					chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
				});
				response.on('end', () => {
					const body = Buffer.concat(chunks).toString('utf8');
					const statusCode = response.statusCode ?? 0;

					if (!body.trim()) {
						if (statusCode >= 200 && statusCode < 300) {
							resolve(undefined);
							return;
						}

						reject(new Error(`Alibaba translate request failed with status ${statusCode}`));
						return;
					}

					try {
						const parsed = JSON.parse(body);
						if (statusCode >= 200 && statusCode < 300) {
							resolve(parsed);
							return;
						}

						const message = parsed?.Message ?? parsed?.TranslateGeneralResponse?.Message;
						reject(new Error(typeof message === 'string' ? message : `Alibaba translate request failed with status ${statusCode}`));
					} catch (error) {
						reject(error);
					}
				});
			}
		);

		request.on('error', reject);
		request.end();
	});
}

async function translateWithAlibaba(
	message: string,
	config: DirectTranslationConfig
): Promise<string | undefined> {
	const commonParams: Record<string, string> = {
		AccessKeyId: config.accessKeyId,
		Action: 'TranslateGeneral',
		Format: 'JSON',
		FormatType: 'text',
		Scene: 'general',
		SignatureMethod: 'HMAC-SHA1',
		SignatureNonce: crypto.randomUUID(),
		SignatureVersion: '1.0',
		SourceLanguage: 'zh',
		SourceText: message,
		TargetLanguage: 'en',
		Timestamp: toIso8601(new Date()),
		Version: ALIBABA_API_VERSION
	};

	const canonicalizedQueryString = buildCanonicalizedQueryString(commonParams);
	const stringToSign = buildStringToSign('GET', canonicalizedQueryString);
	const signature = generateSignature(config.accessKeySecret, stringToSign);
	const finalQueryString = `${canonicalizedQueryString}&Signature=${percentEncode(signature)}`;
	const payload = await requestJson(`${ALIBABA_ENDPOINT}?${finalQueryString}`);

	return parseAlibabaTranslateGeneralResponse(payload);
}

export async function translateMessagesWithDirectProvider(
	messages: string[],
	config: DirectTranslationConfig
): Promise<DirectTranslationResult> {
	if (config.provider === 'none') {
		return {
			translations: new Map<string, string>(),
			attempted: false,
			missingConfig: false
		};
	}

	if (config.provider === 'alibaba' && !hasAlibabaCredentials(config)) {
		return {
			translations: new Map<string, string>(),
			attempted: false,
			missingConfig: true
		};
	}

	const translations = new Map<string, string>();

	for (const message of messages) {
		try {
			const translated = await translateWithAlibaba(message, config);
			if (translated) {
				translations.set(message, translated);
			}
		} catch (error) {
			console.error(`内置翻译调用失败: ${message}`, error);
			break;
		}
	}

	return {
		translations,
		attempted: true,
		missingConfig: false
	};
}
