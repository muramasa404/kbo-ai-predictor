const TEAM_ALIASES: Record<string, string> = {
  // KIA
  기아: 'KIA', Kia: 'KIA', kia: 'KIA', 'KIA 타이거즈': 'KIA',
  // KT
  케이티: 'KT', kt: 'KT', 'kt wiz': 'KT', 'KT 위즈': 'KT',
  // NC
  엔씨: 'NC', nc: 'NC', 'NC 다이노스': 'NC',
  // LG
  엘지: 'LG', lg: 'LG', 'LG 트윈스': 'LG',
  // SSG
  에스에스지: 'SSG', ssg: 'SSG', SK: 'SSG', sk: 'SSG', 'SSG 랜더스': 'SSG',
  // 삼성
  Samsung: '삼성', samsung: '삼성', SS: '삼성', '삼성 라이온즈': '삼성',
  // 한화
  Hanwha: '한화', hanwha: '한화', HH: '한화', '한화 이글스': '한화',
  // 롯데
  Lotte: '롯데', lotte: '롯데', LT: '롯데', '롯데 자이언츠': '롯데',
  // 두산
  Doosan: '두산', doosan: '두산', OB: '두산', '두산 베어스': '두산',
  // 키움
  Kiwoom: '키움', kiwoom: '키움', KW: '키움', 넥센: '키움', '키움 히어로즈': '키움',
}

export function normalizeTeamName(name: string): string {
  return TEAM_ALIASES[name] ?? name.trim()
}
