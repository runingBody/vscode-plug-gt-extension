import { strict as assert } from 'assert';
import {
	buildImportName,
	mergeModuleTranslationContent,
	parseTranslationMemory,
	toImportPath,
	upsertGlobalNamespaceContent
} from './i18n-helper';

const translationMemory = parseTranslationMemory('const en = {\n\t"创建人": "Founder",\n\t"处理中": "Processing",\n};\n\nexport default en;\n');
const globalTranslationMemory = parseTranslationMemory(
	"import { addPrefixToKeys } from '../util';\nconst namespace = 'global.';\nconst zh = {\n\t\"操作\": \" Action\",\n\t\"查询条件不能为空\": \"The query condition cannot be empty\",\n\t\"导出中\": \"Exporting\",\n\t\"订单编号\": \"Order Number\",\n\t\"订单日期\": \"Order Date \",\n\t\"请输入名称或代码\": \" Please enter a name or code \",\n\t\"供应商名称/代码\": \" Supplier name/code \",\n\t\"寄出单号\": \" outgoing ticket number \",\n\t\"寄回单号\": \" Postal Order No. \",\n\t\"来源\": \" source from\",\n\t\"筛选\": \" filter \",\n\t\"往来单号\": \"Transaction number\",\n\t\"只能导出状态为待寄出的记录\": \" Only records with a status of Pending Shipment can be exported. \",\n\t\"质保函列表\": \"List of Quality Assurance Letters\",\n\t\"质保函状态\": \"Warranty letter status\",\n};\nconst result = addPrefixToKeys(zh, namespace);\nexport default result;\n"
);

const merged = mergeModuleTranslationContent(undefined, ['资源名称', '处理中'], translationMemory);
assert.equal(
	merged.content,
	'const en = {\n\t"处理中": "Processing",\n\t"资源名称": "ResourceName",\n};\n\nexport default en;\n'
);
assert.deepEqual(merged.unresolvedMessages, []);

const mergedExisting = mergeModuleTranslationContent(
	'const en = {\n\t"资源名称": "Resource Name",\n};\n\nexport default en;\n',
	['资源名称', '处理中'],
	translationMemory
);
assert.equal(
	mergedExisting.content,
	'const en = {\n\t"处理中": "Processing",\n\t"资源名称": "Resource Name",\n};\n\nexport default en;\n'
);
assert.deepEqual(mergedExisting.unresolvedMessages, []);

const mergedSample = mergeModuleTranslationContent(
	undefined,
	['操作', '订单编号', '订单日期', '返', '供应商名称/代码', '寄', '寄出单号', '寄回单号', '来源', '往来单号', '业务方', '原因: ', '质保函状态'],
	globalTranslationMemory
);
assert.equal(
	mergedSample.content,
	'const en = {\n\t"操作": "Action",\n\t"订单编号": "OrderNumber",\n\t"订单日期": "OrderDate",\n\t"返": "Return",\n\t"供应商名称/代码": "SupplierNameOrCode",\n\t"寄": "Send",\n\t"寄出单号": "OutboundTrackingNumber",\n\t"寄回单号": "ReturnTrackingNumber",\n\t"来源": "Source",\n\t"往来单号": "TransactionNumber",\n\t"业务方": "Purchaser",\n\t"原因: ": "Reason",\n\t"质保函状态": "WarrantyLetterStatus",\n};\n\nexport default en;\n'
);
assert.deepEqual(mergedSample.unresolvedMessages, []);

const mergedGlobalDriven = mergeModuleTranslationContent(
	'const en = {\n\t"搜索": "Search",\n};\n\nexport default en;\n',
	['查询条件不能为空', '导出中', '请输入名称或代码', '筛选', '搜索', '只能导出状态为待寄出的记录', '质保函列表'],
	globalTranslationMemory
);
assert.equal(
	mergedGlobalDriven.content,
	'const en = {\n\t"查询条件不能为空": "TheQueryConditionCannotBeEmpty",\n\t"导出中": "Exporting",\n\t"请输入名称或代码": "PleaseEnterANameOrCode",\n\t"筛选": "Filter",\n\t"搜索": "Search",\n\t"只能导出状态为待寄出的记录": "OnlyRecordsWithAStatusOfPendingShipmentCanBeExported",\n\t"质保函列表": "ListOfQualityAssuranceLetters",\n};\n\nexport default en;\n'
);
assert.deepEqual(mergedGlobalDriven.unresolvedMessages, []);

const mergedUnknown = mergeModuleTranslationContent(
	undefined,
	['完全未知业务词'],
	new Map()
);
assert.equal(
	mergedUnknown.content,
	'const en = {\n\t"完全未知业务词": "",\n};\n\nexport default en;\n'
);
assert.deepEqual(mergedUnknown.unresolvedMessages, ['完全未知业务词']);

const mergedRetryEmpty = mergeModuleTranslationContent(
	'const en = {\n\t"订单编号": "",\n\t"搜索": "Search",\n};\n\nexport default en;\n',
	['订单编号', '搜索'],
	globalTranslationMemory
);
assert.equal(
	mergedRetryEmpty.content,
	'const en = {\n\t"订单编号": "OrderNumber",\n\t"搜索": "Search",\n};\n\nexport default en;\n'
);
assert.deepEqual(mergedRetryEmpty.unresolvedMessages, []);

assert.equal(
	buildImportName('/workspace/src/pages/demo/module-a', '/workspace'),
	'src_pages_demo_module_a_en'
);

assert.equal(
	toImportPath(
		'/workspace/src/i18n/namespace/global/en.ts',
		'/workspace/src/pages/demo/module-a/_i18n/en.ts'
	),
	'../../../pages/demo/module-a/_i18n/en'
);

const globalCreated = upsertGlobalNamespaceContent(
	undefined,
	'src_pages_demo_module_a_en',
	'../../../pages/demo/module-a/_i18n/en'
);
assert.equal(
	globalCreated,
	"import src_pages_demo_module_a_en from '../../../pages/demo/module-a/_i18n/en';\n\nconst en = {\n\t...src_pages_demo_module_a_en,\n};\n\nexport default en;\n"
);

const globalUpdated = upsertGlobalNamespaceContent(
	"const en = {\n\tbase: 'base',\n};\n\nexport default en;\n",
	'src_pages_demo_module_a_en',
	'../../../pages/demo/module-a/_i18n/en'
);
assert.equal(
	globalUpdated,
	"import src_pages_demo_module_a_en from '../../../pages/demo/module-a/_i18n/en';\nconst en = {\n\t...src_pages_demo_module_a_en,\n\tbase: 'base',\n};\n\nexport default en;\n"
);

const globalUpdatedWithImports = upsertGlobalNamespaceContent(
	"import { addPrefixToKeys } from '../util';\nimport base from './base';\n\nconst zh = {\n\tbase,\n};\n\nexport default zh;\n",
	'src_pages_demo_module_a_en',
	'../../../pages/demo/module-a/_i18n/en'
);
assert.equal(
	globalUpdatedWithImports,
	"import src_pages_demo_module_a_en from '../../../pages/demo/module-a/_i18n/en';\nimport { addPrefixToKeys } from '../util';\nimport base from './base';\n\nconst zh = {\n\t...src_pages_demo_module_a_en,\n\tbase,\n};\n\nexport default zh;\n"
);

console.log('i18n helper tests passed');
