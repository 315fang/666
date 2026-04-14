function firstNonEmptyValue(values = []) {
  return values.find((value) => value != null && String(value).trim() !== '')
}

export function buildUserManagementQuery(user = {}, fallbackKeyword = '', extraExactValues = []) {
  const lookup = firstNonEmptyValue([
    user.invite_code,
    user.my_invite_code,
    user.member_no,
    user.openid,
    user.id,
    user._legacy_id,
    user.user_id,
    ...extraExactValues
  ])

  if (lookup != null && String(lookup).trim() !== '') {
    return { lookup: String(lookup) }
  }

  const keyword = firstNonEmptyValue([
    fallbackKeyword,
    user.phone,
    user.nickname,
    user.nickName,
    user.name
  ])

  return keyword != null && String(keyword).trim() !== ''
    ? { keyword: String(keyword) }
    : {}
}
