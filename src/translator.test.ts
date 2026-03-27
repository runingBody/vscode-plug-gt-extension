import { strict as assert } from 'assert';
import {
	buildCanonicalizedQueryString,
	buildStringToSign,
	generateSignature,
	percentEncode
} from './translator';

assert.equal(percentEncode('导出BOM'), '%E5%AF%BC%E5%87%BABOM');
assert.equal(percentEncode("a+b*c"), 'a%2Bb%2Ac');

const canonicalizedQueryString = buildCanonicalizedQueryString({
	Action: 'TranslateGeneral',
	Format: 'JSON',
	FormatType: 'text',
	SourceLanguage: 'zh',
	SourceText: '导出BOM',
	TargetLanguage: 'en',
	Version: '2018-10-12'
});

assert.equal(
	canonicalizedQueryString,
	'Action=TranslateGeneral&Format=JSON&FormatType=text&SourceLanguage=zh&SourceText=%E5%AF%BC%E5%87%BABOM&TargetLanguage=en&Version=2018-10-12'
);

const stringToSign = buildStringToSign('GET', canonicalizedQueryString);
assert.equal(
	stringToSign,
	'GET&%2F&Action%3DTranslateGeneral%26Format%3DJSON%26FormatType%3Dtext%26SourceLanguage%3Dzh%26SourceText%3D%25E5%25AF%25BC%25E5%2587%25BABOM%26TargetLanguage%3Den%26Version%3D2018-10-12'
);

const signature = generateSignature('test-secret', stringToSign);
assert.equal(signature, 'Dbmirbs1IRrzQ7L56Lsu0R00iDA=');

console.log('translator tests passed');
