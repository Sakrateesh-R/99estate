/**
 * No search row, for every public route that is not a results page.
 *
 * A parallel route needs a `default` for the paths its slot does not match,
 * or a hard navigation to one of them 404s. Returning null is the point of
 * this file rather than a side effect of it: this is what stops the city and
 * place lists being read on /terms, a listing page, or anywhere else the
 * search box does not appear.
 */
export default function NoSearchRow() {
  return null;
}
