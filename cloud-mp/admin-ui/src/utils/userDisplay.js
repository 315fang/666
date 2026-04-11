export function getUserNickname(user = {}, fallback = '-') {
  const nickname = user?.nickName || user?.nickname || ''
  return nickname || fallback
}

export function getUserAvatar(user = {}) {
  return user?.avatarUrl || user?.avatar_url || ''
}

export function normalizeUserDisplay(user = {}) {
  const nickname = getUserNickname(user, '')
  const avatar = getUserAvatar(user)
  return {
    ...user,
    nickName: nickname,
    nickname,
    avatarUrl: avatar,
    avatar_url: avatar
  }
}
