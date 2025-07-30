import Fetch from '@11ty/eleventy-fetch'

const CACHE_DURATION = '1w'
const baseUrl = (path = '') =>
  `https://suttacentral.net/api/menu${path}?language=en`
async function fetchData(path, returnFirstItem = false) {
  const json = await Fetch(baseUrl(path), {
    duration: CACHE_DURATION,
    type: 'json',
  })
  return returnFirstItem ? json[0] : json
}
const fetchMenu = (path) => fetchData(path)
const fetchSubMenu = (path) => fetchData(path, true)

async function addCollections(basket) {
  if (!basket.children) return basket

  const children = await Promise.all(
    basket.children.map((c) => fetchSubMenu(`/${c.uid}`))
  )

  return { ...basket, children }
}

async function addSubcollections(collection) {
  const children = await Promise.all(
    collection.children.map(async (c) => {
      if (!c?.children) return { ...c, children: [] }

      const subChildren = await Promise.all(
        c.children.map(async (group) => {
          const next = await fetchSubMenu(`/${group.uid}`)
          return { ...group, children: next.children }
        })
      )

      return { ...c, children: subChildren }
    })
  )
  return { ...collection, children }
}

export default async function () {
  try {
    const sutta = await fetchMenu('/sutta')
    const vinaya = await fetchMenu('/vinaya')
    const abhidhamma = await fetchMenu('/abhidhamma')

    const tripitika = [...sutta, ...vinaya, ...abhidhamma]

    const withCollections = await Promise.all(tripitika.map(addCollections))

    const withSubcollections = await Promise.all(
      withCollections.map(addSubcollections)
    )

    return withSubcollections
  } catch (e) {
    console.error('menuData error:', e)
    return []
  }
}
