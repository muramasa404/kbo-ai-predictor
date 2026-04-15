import { prisma } from './client'

async function main(): Promise<void> {
  const season2026 = await prisma.season.upsert({
    where: { year: 2026 },
    create: {
      year: 2026,
      leagueType: 'KBO',
      startDate: new Date('2026-03-01T00:00:00+09:00'),
      endDate: new Date('2026-11-30T00:00:00+09:00'),
    },
    update: {
      startDate: new Date('2026-03-01T00:00:00+09:00'),
      endDate: new Date('2026-11-30T00:00:00+09:00'),
    },
  })

  const teams = [
    { code: 'LG', nameKo: 'LG', nameEn: 'LG Twins', foundedYear: 1982 },
    { code: 'HH', nameKo: '한화', nameEn: 'Hanwha Eagles', foundedYear: 1986 },
    { code: 'SSG', nameKo: 'SSG', nameEn: 'SSG Landers', foundedYear: 2000 },
    { code: 'SS', nameKo: '삼성', nameEn: 'Samsung Lions', foundedYear: 1982 },
    { code: 'NC', nameKo: 'NC', nameEn: 'NC Dinos', foundedYear: 2011 },
    { code: 'KT', nameKo: 'KT', nameEn: 'KT Wiz', foundedYear: 2013 },
    { code: 'LT', nameKo: '롯데', nameEn: 'Lotte Giants', foundedYear: 1982 },
    { code: 'KIA', nameKo: 'KIA', nameEn: 'KIA Tigers', foundedYear: 2001 },
    { code: 'OB', nameKo: '두산', nameEn: 'Doosan Bears', foundedYear: 1982 },
    { code: 'KW', nameKo: '키움', nameEn: 'Kiwoom Heroes', foundedYear: 2008 },
  ] as const

  for (const team of teams) {
    await prisma.team.upsert({
      where: { code: team.code },
      create: team,
      update: {
        nameKo: team.nameKo,
        nameEn: team.nameEn,
        foundedYear: team.foundedYear,
      },
    })
  }

  console.log(`Seed complete for season ${season2026.year}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
