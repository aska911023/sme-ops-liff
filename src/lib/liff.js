import liff from '@line/liff'

const LIFF_ID = import.meta.env.VITE_LIFF_ID || ''

export async function initLiff() {
  await liff.init({ liffId: LIFF_ID })

  if (!liff.isLoggedIn()) {
    liff.login()
    return null
  }

  const profile = await liff.getProfile()
  return {
    lineUserId: profile.userId,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl,
  }
}

export function closeLiff() {
  if (liff.isInClient()) {
    liff.closeWindow()
  }
}

export { liff }
