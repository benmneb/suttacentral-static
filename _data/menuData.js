import Fetch from '@11ty/eleventy-fetch'

const CACHE_DURATION = '1w'
function baseUrl(path = '') {
  return `https://suttacentral.net/api/menu${path}?language=en`
}
async function fetchData(path, returnFirstItem = false) {
  const json = await Fetch(baseUrl(path), {
    duration: CACHE_DURATION,
    type: 'json',
  })
  return returnFirstItem ? json[0] : json
}
function fetchMenu(path) {
  return fetchData(path)
}
function fetchSubMenu(path) {
  return fetchData(path, true)
}

/*
 * Adds second level, ie `/long`
 */
async function addCollections(basket) {
  if (!basket.children) return basket

  const children = await Promise.all(
    basket.children.map((c) => fetchSubMenu(`/${c.uid}`))
  )

  return { ...basket, children }
}

/*
 * Adds third level, ie `/dn`
 */
async function addSubCollections(collection) {
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

/*
 * Adds fourth level, ie `/dn-silakkhandhavagga`
 */
async function addChapters(subCollection) {
  const children = await Promise.all(
    subCollection.children.map(async (c) => {
      if (!c?.children) return { ...c, children: [] }

      const subChildren = await Promise.all(
        c.children.map(async (group) => {
          if (!group.children.length) return { ...group, children: [] }

          const chapters = await Promise.all(
            group.children.map(async (chapter) => {
              const next = await fetchSubMenu(`/${chapter.uid}`)
              // if (chapter?.uid?.includes('dn'))
              //   console.log('chapter', chapter.uid)
              // if (chapter?.uid?.includes('dn'))
              // console.log('next', next.children.length)
              // console.log('next', next.uid)
              // if (!next.children) console.log(next.uid)

              if (!next.children.length) return { ...chapter, children: [] }

              return { ...chapter, children: next.children }
            })
          )

          return { ...group, children: chapters }
        })
      )

      return { ...c, children: subChildren }
    })
  )

  return { ...subCollection, children }
}

/*
 * Generated readable, structured, nested data for the the main navigation
 * by recursively calling SuttaCentral's `/menu/${uid}` API
 * and nesting the result in the `children` value.
 */
export default async function () {
  try {
    const sutta = await fetchMenu('/sutta')
    const vinaya = await fetchMenu('/vinaya')
    const abhidhamma = await fetchMenu('/abhidhamma')

    // const tripitika = [...sutta, ...vinaya, ...abhidhamma]
    const tripitika = [...sutta]

    const withCollections = await Promise.all(tripitika.map(addCollections))

    const withSubCollections = await Promise.all(
      withCollections.map(addSubCollections)
    )

    // withChapters, ie: /dn-silakkhandhavagga
    const withChapters = await Promise.all(withSubCollections.map(addChapters))

    // withTexts?, ie /dn1

    // return withSubCollections
    return withChapters
  } catch (e) {
    console.error('menuData error:', e)
    return []
  }
}
