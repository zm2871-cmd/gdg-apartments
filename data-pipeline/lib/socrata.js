const BASE_URL = "https://data.cityofnewyork.us/resource";
const PAGE_SIZE = 1000;
const MAX_RETRIES = 3;
const TIMEOUT_MS = 30_000;

export async function querySocrata(datasetId, { select, where, order }) {
  // without a stable order, rows can shift between pages and get skipped or duplicated
  if (!order)
    throw new Error(`Socrata ${datasetId}: order is required for paging`);
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      $limit: PAGE_SIZE,
      $offset: offset,
      $order: order,
    });
    if (select) params.set("$select", select);
    if (where) params.set("$where", where);
    const page = await fetchPage(datasetId, params); // throws -> partial rows are never returned
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function fetchPage(datasetId, params) {
  const label = `${datasetId} ?${decodeURIComponent(String(params).replaceAll("+", " "))}`; // the token lives in a header, so it can't leak into this
  const token = process.env.SOCRATA_APP_TOKEN;
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(`${BASE_URL}/${datasetId}.json?${params}`, {
        headers: token ? { "X-App-Token": token } : {},
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      // timeout or network failure
      if (attempt < MAX_RETRIES) {
        await backoff(attempt);
        continue;
      }
      throw new Error(`Socrata ${label}: ${err.message}`);
    }
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      await backoff(attempt);
      continue;
    }
    const body = await res.text().catch(() => "");
    throw new Error(
      `Socrata ${label}: HTTP ${res.status} ${body.slice(0, 300)}`,
    );
  }
}

const backoff = (attempt) =>
  new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
