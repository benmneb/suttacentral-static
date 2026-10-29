/**
 * Every page's structured data, meta and Open Graph tags are valid, not just there.
 *
 * JSON-LD is checked against the schema.org vocabulary, pinned to a version so
 * a new release can't fail a build. It's fetched once into `.cache`.
 */

import Fetch from '@11ty/eleventy-fetch'
import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'
import sharp from 'sharp'
import {
  jsonLdShapes,
  listSome,
  metaProblems,
  scanSite,
  SITE_DIR,
} from './lib/site.js'

const SCHEMA_ORG_VERSION = '30.1'

// What a JSON number or boolean can stand for, besides text
const NUMBER_RANGES = [
  'Number',
  'Integer',
  'Float',
  'Text',
  'QuantitativeValue',
  'Distance',
]
const BOOLEAN_RANGES = ['Boolean', 'Text']

/** The schema.org vocabulary's classes and properties */
async function schemaOrg() {
  const { '@graph': graph } = await Fetch(
    `https://schema.org/version/${SCHEMA_ORG_VERSION}/schemaorg-current-https.jsonld`,
    { duration: '*', type: 'json' }
  )
  const name = node => node['@id'].replace(/^schema:/, '')
  const names = value => [value ?? []].flat().map(name)
  const classes = new Map()
  const properties = new Map()
  const dataTypes = new Set()
  for (const node of graph) {
    const types = [node['@type']].flat()
    const term = {
      supersededBy: names(node['schema:supersededBy'])[0],
    }
    if (types.includes('rdf:Property')) {
      properties.set(name(node), {
        ...term,
        domain: names(node['schema:domainIncludes']),
        range: names(node['schema:rangeIncludes']),
      })
    } else if (types.includes('rdfs:Class')) {
      classes.set(name(node), {
        ...term,
        parents: names(node['rdfs:subClassOf']),
      })
      if (types.includes('schema:DataType')) dataTypes.add(name(node))
    }
  }

  const ancestorsOf = new Map()
  const ancestors = type => {
    if (!ancestorsOf.has(type)) {
      const all = new Set([type])
      for (const parent of classes.get(type)?.parents ?? []) {
        for (const ancestor of ancestors(parent)) all.add(ancestor)
      }
      ancestorsOf.set(type, all)
    }
    return ancestorsOf.get(type)
  }
  const isDataType = type =>
    [...ancestors(type)].some(ancestor => dataTypes.has(ancestor))

  return { classes, properties, ancestors, isDataType }
}

/**
 * What's wrong with a JSON-LD shape (see `jsonLdShapes`) by schema.org
 * @param {string} shape - ie `WebPage.isPartOf:WebSite`
 * @param {Awaited<ReturnType<typeof schemaOrg>>} schema
 */
function shapeProblems(shape, { classes, properties, ancestors, isDataType }) {
  const [, type, property, valueType] = shape.match(/^(.*?)\.(.*):(.*)$/)
  const typeProblem = name => {
    if (!classes.has(name)) return `${name} isn't a schema.org type`
    const { supersededBy } = classes.get(name)
    return supersededBy && `${name} is superseded by ${supersededBy}`
  }
  const types = type.split('|')
  if (!types.every(name => classes.has(name))) {
    return types.map(typeProblem).filter(Boolean)
  }
  const problems = types.map(typeProblem)
  const term = properties.get(property)
  if (!term) {
    problems.push(`${property} isn't a schema.org property`)
    return problems.filter(Boolean)
  }
  if (term.supersededBy) {
    problems.push(`${property} is superseded by ${term.supersededBy}`)
  }
  const domains = new Set(types.flatMap(name => [...ancestors(name)]))
  if (!term.domain.some(domain => domains.has(domain))) {
    problems.push(`${property} isn't a property of ${type}`)
  }
  const inRange = types => term.range.some(range => types.includes(range))
  const fits = {
    string: () => true,
    number: () => inRange(NUMBER_RANGES),
    boolean: () => inRange(BOOLEAN_RANGES),
    node: () => term.range.some(range => range === 'URL' || !isDataType(range)),
  }
  const alternatives = valueType.split('|')
  if (fits[valueType]) {
    if (!fits[valueType]()) {
      problems.push(`${property} takes ${term.range.join(', ')}`)
    }
  } else {
    problems.push(...alternatives.map(typeProblem))
    const known = alternatives.filter(alt => classes.has(alt))
    if (known.length && !known.some(alt => inRange([...ancestors(alt)]))) {
      problems.push(
        `${property} takes ${term.range.join(', ')}, not ${valueType}`
      )
    }
  }
  return problems.filter(Boolean)
}

describe('Structured data checks', async () => {
  const schema = await schemaOrg()

  it('lists every property of every typed node', () => {
    const shapes = jsonLdShapes({
      '@type': 'WebPage',
      name: 'A',
      isPartOf: { '@type': 'WebSite', '@id': 'https://a.b/#website' },
      author: [{ '@id': 'https://a.b/c' }, { '@type': ['Person'], name: 'B' }],
    })

    assert.deepEqual(
      [...shapes],
      [
        'WebPage.name:string',
        'WebPage.isPartOf:WebSite',
        'WebPage.author:node',
        'WebPage.author:Person',
        'Person.name:string',
      ]
    )
  })

  it('finds made-up types and misplaced properties', () => {
    const problems = shape => shapeProblems(shape, schema)

    assert.deepEqual(problems('WebPage.isPartOf:WebSite'), [])
    assert.deepEqual(problems('ImageObject.width:number'), [])
    assert.deepEqual(problems('WebPage|Book.isbn:string'), [])
    assert.deepEqual(problems('ListItem.item:node'), [])
    assert.deepEqual(problems('Madeup.name:string'), [
      "Madeup isn't a schema.org type",
    ])
    assert.deepEqual(problems('WebPage.madeUp:string'), [
      "madeUp isn't a schema.org property",
    ])
    assert.deepEqual(problems('Person.isPartOf:WebSite'), [
      "isPartOf isn't a property of Person",
    ])
    assert.deepEqual(problems('WebPage.isPartOf:Person'), [
      'isPartOf takes CreativeWork, URL, not Person',
    ])
    assert.deepEqual(problems('Person.birthDate:number'), [
      'birthDate takes Date',
    ])
  })

  it('finds bad language, meta and Open Graph tags', () => {
    const html = `<!doctype html><html lang=en><head>
      <meta name=viewport content="width=device-width">
      <meta name=description content="A">
      <link rel=canonical href="https://suttacentral.express/m%C4%81">
      <meta property="og:title" content="A">
      <meta property="og:url" content="https://suttacentral.express/mā">
      <meta property="og:type" content="website">
      <meta property="og:image" content="/images/og.jpg">
      <meta property="book:author" content="B">
      <meta name=twitter:card content=summary_large_image>
      </head><body><p lang=pli>`

    assert.deepEqual(metaProblems(html, '/mā/'), [
      'lang: pli',
      'book:author on an og:type website',
      'og:image: /images/og.jpg',
    ])
    assert.deepEqual(metaProblems('<html><head></head>', '/404.html'), [
      'no <html lang>',
      '0 viewport meta tags',
      '0 description meta tags',
    ])
  })
})

describe('Every page’s structured data', async () => {
  const [{ pages, jsonLdShapes: shapes, ogImages }, schema] = await Promise.all(
    [scanSite(), schemaOrg()]
  )

  it('uses schema.org types, with properties where they belong', () => {
    const bad = [
      ...new Set(
        [...shapes].flatMap(([shape, url]) =>
          shapeProblems(shape, schema).map(problem => `${problem} (${url})`)
        )
      ),
    ]
    assert.equal(
      bad.length,
      0,
      `JSON-LD that isn't valid schema.org:\n${listSome(bad)}`
    )
  })

  it('has valid language, meta and Open Graph tags', () => {
    const bad = [...pages.values()]
      .filter(page => page.metaProblems.length > 0)
      .map(page => `${page.url}: ${page.metaProblems.join('; ')}`)
    assert.equal(bad.length, 0, `Pages with bad tags:\n${listSome(bad)}`)
  })

  it('has Open Graph images of the size and type its tags say', async () => {
    const bad = []
    for (const [tags, url] of ogImages) {
      const [src, width, height, type] = tags.split(' ')
      // A relative one is a meta tag problem, reported above
      if (!URL.canParse(src)) continue
      const file = path.join(SITE_DIR, new URL(src).pathname)
      const actual = await sharp(file)
        .metadata()
        .then(meta => `${meta.width} ${meta.height} image/${meta.format}`)
        .catch(() => 'missing')
      if (actual !== `${width} ${height} ${type}`) {
        bad.push(`${src} is ${actual}, not ${width} ${height} ${type} (${url})`)
      }
    }
    assert.equal(bad.length, 0, `Wrong Open Graph images:\n${listSome(bad)}`)
  })
})
