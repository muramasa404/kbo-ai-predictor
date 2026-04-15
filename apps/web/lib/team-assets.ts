/** 팀명 → 로컬 로고 파일 매핑 (/public/logos/) */
export const TEAM_LOGOS: Record<string, string> = {
  LG: '/logos/LG_TWINS_LOGO.png',
  KT: '/logos/KT_LOGO.png',
  SSG: '/logos/SSG_LOGO.png',
  NC: '/logos/NC_LOGO.png',
  KIA: '/logos/KIA_LOGO.png',
  '삼성': '/logos/SAMSUNG_LOGO.png',
  '한화': '/logos/HANWHA_LOGO.png',
  '롯데': '/logos/LOTTE_LOGO.png',
  '두산': '/logos/DOOSAN_LOGO.png',
  '키움': '/logos/KIWOOM_LOGO.png',
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

export function getTeamLogo(name: string): string {
  return TEAM_LOGOS[name] ?? '/logos/KIA_LOGO.png'
}

export function getTeamColor(name: string): string {
  return TEAM_COLORS[name] ?? '#333333'
}
