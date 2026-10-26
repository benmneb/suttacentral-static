import masterData from './_masterData.js'

const collator = new Intl.Collator('en')

const SHARED_PREFIX =
  /^(Basket of|Collections of|Monastic Law of the|Systematic Treatises of the) /

const PARENT_PREFIX = /^((The )?Group of Linked Discourses|The Book of the) /i
const PARENT_ONLY_PREFIXES = [
  [/^sn/, /^Linked Discourses /i],
  [/-ap$/, /^Chapter Beginning /i],
]

const squash = text => text.toLowerCase().replace(/[\s-]/g, '')

/*
 * Whether this node, or anything under it, has a text to find.
 */
function hasTexts(node) {
  return !!node.translations?.length || !!node.children?.some(hasTexts)
}

/*
 * Keeps only the branches, down to the last one before the texts (the "chapters"),
 * with the same stopping rule as `chapterData.js`, and drops any without a text in them.
 * Names drop a prefix the tree already makes plain, eg "Basket of", and for a shorter one, ie "Ones" for
 * "The Book of the Ones", keep the whole name as `fullName`. `lang` is the root language
 * where it's first set or changes, unless the name already says it. `reference` is how a book is cited,
 * ie DN, Dhp or SN 12.
 */
function buildTree(nodes, parentLang, parentUid, basket, depth = 0) {
  return nodes.flatMap(node => {
    // SC's /menu API returns some empty nodes with a null uid
    if (!node.uid || node.node_type === 'leaf' || !hasTexts(node)) return []

    const isLastBranch =
      !node.children?.some(c => c.node_type === 'branch') ||
      node.uid.endsWith('-pm')

    const fullName = (node.translated_name || node.root_name || node.uid)
      .trim()
      .replace(SHARED_PREFIX, '')
    let name = fullName.replace(PARENT_PREFIX, '')
    for (const [parent, prefix] of PARENT_ONLY_PREFIXES) {
      if (parent.test(parentUid ?? '')) name = name.replace(prefix, '')
    }
    if (name !== fullName) name = name[0].toUpperCase() + name.slice(1)
    const lang = node.root_lang_name || parentLang

    const numbered = node.uid.match(/^(dn|mn|sn|an)(\d+)$/i)
    // A book's acronym as its reference, but not the Vinaya's (ie Lzh Mg Bu Vb), a group's (ie Minor Lzh), or one that isn't the uid in: takes
    const acronym = node.acronym?.trim()
    const isBook =
      acronym &&
      depth >= 2 &&
      basket !== 'vinaya' &&
      !/^(Minor|Other) /.test(acronym) &&
      squash(acronym) === squash(node.uid)
    return [
      {
        uid: node.uid,
        name,
        fullName: name !== fullName ? fullName : undefined,
        lang: lang !== parentLang && !name.includes(lang) ? lang : undefined,
        reference: numbered
          ? `${numbered[1].toUpperCase()} ${numbered[2]}`
          : isBook
            ? acronym
            : undefined,
        children: isLastBranch
          ? []
          : buildTree(
              node.children || [],
              lang,
              node.uid,
              basket ?? node.uid,
              depth + 1
            ),
      },
    ]
  })
}

/*
 * Collects every author and language that has a text, without copying any of the texts.
 */
function collectTranslations(nodes, authors, languages) {
  for (const node of nodes) {
    for (const t of node.translations || []) {
      if (t.author_uid && !authors.has(t.author_uid)) {
        const name = t.author?.replace(/&nbsp;|&#160;|\u00A0/g, ' ').trim()
        authors.set(t.author_uid, { name: name || t.author_uid, isRoot: true })
      }
      // Should anyone have both, they're a translator
      if (t.author_uid && !t.is_root) authors.get(t.author_uid).isRoot = false
      if (t.lang && !languages.has(t.lang)) {
        languages.set(t.lang, t.lang_name || t.lang)
      }
    }
    if (node.children) collectTranslations(node.children, authors, languages)
  }
}

/*
 * The options for the filters on the /search page, matching the `data-pagefind-filter`
 * values on each text page in `text.liquid`.
 *
 * @returns
 * {
 *  tree: [{ uid: 'sutta', name: 'Discourses', children: [{ uid: 'dn', name: 'Long Discourses Collection', lang: 'Pāli', ... }] }, ...],
 *  authorGroups: [
 *    { name: 'Translators', authors: [{ uid: 'sujato', name: 'Bhikkhu Sujato' }, ...] },
 *    { name: 'Root editions', authors: [{ uid: 'ms', name: 'Mahāsaṅgīti Tipiṭaka Buddhavasse 2500' }, ...] },
 *  ],
 *  languages: [{ uid: 'en', name: 'English' }, { uid: 'pli', name: 'Pāli' }, ...],
 * }
 */
export default async function () {
  const menu = await masterData()

  const authors = new Map()
  const languages = new Map()
  collectTranslations(menu, authors, languages)

  // English then Pāli first, as they're most of the texts
  function langOrder(uid) {
    const i = ['en', 'pli'].indexOf(uid)
    return i === -1 ? 2 : i
  }

  return {
    tree: buildTree(menu),
    authorGroups: [
      { name: 'Translators', isRoot: false },
      { name: 'Root editions', isRoot: true },
    ].map(({ name, isRoot }) => ({
      name,
      authors: [...authors]
        .filter(([, author]) => author.isRoot === isRoot)
        .map(([uid, author]) => ({ uid, name: author.name }))
        .sort((a, b) => collator.compare(a.name, b.name)),
    })),
    languages: [...languages]
      .map(([uid, name]) => ({ uid, name }))
      .sort(
        (a, b) =>
          langOrder(a.uid) - langOrder(b.uid) ||
          collator.compare(a.name, b.name)
      ),
  }
}
