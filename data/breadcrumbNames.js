import masterData from './_masterData.js'
import { breadcrumbNames } from '../tools/breadcrumbNames.js'

/*
 * What each uid in a breadcrumb is called, as `uid -> name`, ie mn-mulapannasa -> "Mūlapaṇṇāsa".
 * See `tools/breadcrumbNames.js`.
 */
export default async function () {
  return breadcrumbNames(await masterData())
}
