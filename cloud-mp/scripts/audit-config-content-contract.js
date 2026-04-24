const fs = require('fs');
const path = require('path');
const { getAuditArtifactPaths } = require('./lib/audit-output');

const projectRoot = path.join(__dirname, '..');
const { outputDir: docsDir, jsonPath, mdPath } = getAuditArtifactPaths(projectRoot, 'CONFIG_CONTENT_CONTRACT_AUDIT');

const configContract = require(path.join(projectRoot, 'cloudfunctions', 'config', 'config-contract.js'));
const adminConfigContract = require(path.join(projectRoot, 'cloudfunctions', 'admin-api', 'src', 'config-contract.js'));

const configContractCases = [
  {
    name: 'mini program config logistics options',
    fn: 'normalizeMiniProgramConfig',
    input: { logistics_config: { shipping_company_options: ['顺丰速运', '', '顺丰速运', '申通快递'] } },
    expected: ['顺丰速运', '申通快递'],
    pick: (result) => result.logistics_config.shipping_company_options
  },
  {
    name: 'popup ad canonical field',
    fn: 'normalizePopupAdConfig',
    input: { enabled: 1, file_id: 'cloud://img', url: 'https://fallback' },
    expected: 'cloud://img',
    pick: (result) => result.file_id
  },
  {
    name: 'home content brand zone defaults',
    fn: 'flattenHomeConfigs',
    args: [{}, {}],
    expected: {
      enabled: false,
      title: '品牌专区',
      welcomeTitle: 'Welcome',
      cards: 0,
      certifications: 0
    },
    pick: (result) => ({
      enabled: result.brand_zone_enabled,
      title: result.brand_zone_title,
      welcomeTitle: result.brand_zone_welcome_title,
      cards: Array.isArray(result.brand_endorsements) ? result.brand_endorsements.length : -1,
      certifications: Array.isArray(result.brand_certifications) ? result.brand_certifications.length : -1
    })
  },
  {
    name: 'home content brand zone legacy compatibility',
    fn: 'flattenHomeConfigs',
    args: [{}, {
      brand_story_body: '品牌介绍正文',
      brand_endorsements: [
        {
          name: '实验检测',
          description: '过程可追溯',
          file_id: 'cloud://brand-card',
          link_type: 'page',
          link_value: '/pages/activity/activity'
        }
      ],
      brand_certifications: ['企业认证']
    }],
    expected: {
      enabled: true,
      card: {
        title: '最新活动',
        subtitle: '过程可追溯',
        image: 'cloud://brand-card',
        file_id: 'cloud://brand-card',
        slot_index: 0,
        category_key: 'latest_activity',
        link_type: 'page',
        link_value: '/pages/index/brand-news-list?category_key=latest_activity'
      },
      certification: {
        title: '企业认证',
        subtitle: '',
        image: '',
        file_id: ''
      }
    },
    pick: (result) => ({
      enabled: result.brand_zone_enabled,
      card: Array.isArray(result.brand_endorsements) ? result.brand_endorsements[0] : null,
      certification: Array.isArray(result.brand_certifications) ? result.brand_certifications[0] : null
    })
  }
];

const adminContractCases = [
  {
    name: 'home section canonical field',
    fn: 'normalizeHomeSectionRecord',
    input: { id: 1, board_key: 'home.hero', board_name: '首页 Hero', board_type: 'hero' },
    expected: 'home.hero',
    pick: (result) => result.section_key
  }
];

const sourceChecks = [
  {
    file: 'cloudfunctions/config/index.js',
    patterns: ['normalizeMiniProgramConfig', 'normalizeHomeContentPayload', 'normalizeSplashConfig']
  },
  {
    file: 'cloudfunctions/admin-api/src/app.js',
    patterns: ['configContract.normalizeMiniProgramConfig', 'configContract.normalizePopupAdConfig', "patchCollectionRow('content_boards'"]
  },
  {
    file: 'cloudfunctions/config/config-contract.js',
    patterns: ['brand_zone_enabled', 'brand_zone_cover_file_id', 'flattenHomeConfigs']
  }
];

function runContractCases(moduleRef, moduleLabel, tests) {
  return tests.map((test) => {
    if (typeof moduleRef[test.fn] !== 'function') {
      return { module: moduleLabel, name: test.name, ok: false, detail: `missing function ${test.fn}` };
    }
    const args = Array.isArray(test.args) ? test.args : [test.input];
    const actualRaw = moduleRef[test.fn](...args);
    const actual = typeof test.pick === 'function' ? test.pick(actualRaw) : actualRaw;
    const ok = JSON.stringify(actual) === JSON.stringify(test.expected);
    return {
      module: moduleLabel,
      name: test.name,
      ok,
      detail: `${test.fn} => ${JSON.stringify(actual)}`
    };
  });
}

function runSourceChecks() {
  return sourceChecks.flatMap((item) => {
    const filePath = path.join(projectRoot, item.file);
    const text = fs.readFileSync(filePath, 'utf8');
    return item.patterns.map((pattern) => ({
      module: 'source',
      name: `${item.file} contains ${pattern}`,
      ok: text.includes(pattern),
      detail: item.file
    }));
  });
}

function main() {
  const findings = [
    ...runContractCases(configContract, 'config', configContractCases),
    ...runContractCases(adminConfigContract, 'admin-api', adminContractCases),
    ...runSourceChecks()
  ];
  const ok = findings.every((item) => item.ok);
  const report = {
    generatedAt: new Date().toISOString(),
    ok,
    total: findings.length,
    failed: findings.filter((item) => !item.ok).length,
    findings
  };
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  const lines = [
    '# Config Content Contract Audit',
    '',
    `生成时间：${report.generatedAt}`,
    `结果：${report.ok ? 'PASS' : 'FAIL'}`,
    '',
    '| 模块 | 检查项 | 结果 | 说明 |',
    '| --- | --- | --- | --- |',
    ...report.findings.map((item) => `| ${item.module} | ${item.name} | ${item.ok ? 'PASS' : 'FAIL'} | ${item.detail.replace(/\|/g, '\\|')} |`)
  ];
  fs.writeFileSync(mdPath, lines.join('\n') + '\n');
  console.log(JSON.stringify({ ok: report.ok, total: report.total, failed: report.failed, jsonPath, mdPath }, null, 2));
  if (!ok) process.exit(1);
}

main();
