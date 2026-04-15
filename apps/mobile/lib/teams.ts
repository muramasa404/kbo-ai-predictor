/** 팀명 → 로컬 로고 이미지 매핑 */
export const TEAM_LOGOS: Record<string, any> = {
  LG: require('../assets/logos/LG_TWINS_LOGO.png'),
  KT: require('../assets/logos/KT_LOGO.png'),
  SSG: require('../assets/logos/SSG_LOGO.png'),
  NC: require('../assets/logos/NC_LOGO.png'),
  KIA: require('../assets/logos/KIA_LOGO.png'),
  '삼성': require('../assets/logos/SAMSUNG_LOGO.png'),
  '한화': require('../assets/logos/HANWHA_LOGO.png'),
  '롯데': require('../assets/logos/LOTTE_LOGO.png'),
  '두산': require('../assets/logos/DOOSAN_LOGO.png'),
  '키움': require('../assets/logos/KIWOOM_LOGO.png'),
}

export const TEAM_COLORS: Record<string, string> = {
  LG: '#c30037',
  KT: '#000000',
  SSG: '#ce0e2d',
  NC: '#315288',
  KIA: '#ea0029',
  '삼성': '#074ca1',
  '한화': '#ff6600',
  '롯데': '#041e42',
  '두산': '#131230',
  '키움': '#570514',
}

export function getTeamLogo(name: string) {
  return TEAM_LOGOS[name] ?? TEAM_LOGOS['KIA']
}

export function getTeamColor(name: string) {
  return TEAM_COLORS[name] ?? '#333333'
}
