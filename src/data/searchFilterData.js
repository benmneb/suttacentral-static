import masterData from './_masterData.js'

const collator = new Intl.Collator('en')

const SHARED_PREFIX =
  /^(Basket of|Collections of|Monastic Law of the|Systematic Treatises of the) /

/*
 * Whether this node, or anything under it, has a text to find.
 */
function hasTexts(node) {
  return !!node.translations?.length || !!node.children?.some(hasTexts)
}

/*
 * Keeps only the branches, down to the last one before the texts (the "chapters"),
 * with the same stopping rule as `chapterData.js`, and drops any without a text in them.
 * Names drop a prefix the tree already makes plain, eg "Basket of".
 */
function buildTree(nodes) {
  return nodes.flatMap(node => {
    // SC's /menu API returns some empty nodes with a null uid
    if (!node.uid || node.node_type === 'leaf' || !hasTexts(node)) return []

    const isLastBranch =
      !node.children?.some(c => c.node_type === 'branch') ||
      node.uid.endsWith('-pm')

    return [
      {
        uid: node.uid,
        name: (node.translated_name || node.root_name || node.uid)
          .trim()
          .replace(SHARED_PREFIX, ''),
        children: isLastBranch ? [] : buildTree(node.children || []),
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
 *  tree: [{ uid: 'sutta', name: 'Discourses', children: [...] }, ...],
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
