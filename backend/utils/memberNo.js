const { secureRandomFromCharset } = require('./secureRandom');

const MEMBER_NO_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const MEMBER_NO_REGEX = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;

function normalizeMemberNo(memberNo = '') {
  return String(memberNo || '').trim().toUpperCase();
}

function buildRandomMemberNo(randomLength = 8) {
  return secureRandomFromCharset(MEMBER_NO_CHARSET, randomLength);
}

function isValidMemberNo(memberNo = '') {
  return MEMBER_NO_REGEX.test(normalizeMemberNo(memberNo));
}

async function generateMemberNo(UserModel, options = {}) {
  const {
    maxAttempts = 20,
    randomLength = 8
  } = options;

  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = buildRandomMemberNo(randomLength);
    // eslint-disable-next-line no-await-in-loop
    const existing = await UserModel.findOne({ where: { member_no: candidate }, attributes: ['id'] });
    if (!existing) return candidate;
  }

  throw new Error('会员编号生成失败，请重试');
}

module.exports = {
  MEMBER_NO_REGEX,
  normalizeMemberNo,
  buildRandomMemberNo,
  isValidMemberNo,
  generateMemberNo
};
