// Vercel serverless function: a small, locked-down proxy to TMDB.
// The browser never sees the TMDB key. Only the categories below can be requested.
//
// Env vars (set one in Vercel → Project → Settings → Environment Variables):
//   TMDB_TOKEN    = "API Read Access Token" (long token starting with eyJ...)   ← recommended
//   TMDB_API_KEY  = "API Key" (32 characters)

const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/';

// Each category = one or more TMDB "discover" queries. Results are merged.
const CATS = {
  kr_movie: [{ type: 'movie', params: { with_origin_country: 'KR', 'vote_count.gte': 150 }, pages: 8, cert: 'KR' }],
  kr_tv: [{ type: 'tv', params: { with_origin_country: 'KR', 'vote_count.gte': 40, without_genres: '10763,10764,10767,16' }, pages: 8 }],
  anim: [
    { type: 'movie', params: { with_genres: '16', 'vote_count.gte': 1500 }, pages: 6, cert: 'US' },
    { type: 'tv', params: { with_genres: '16', 'vote_count.gte': 400, without_genres: '10767' }, pages: 3 }
  ],
  world: [{ type: 'movie', params: { 'vote_count.gte': 6000 }, pages: 10, cert: 'US' }],
  kids: [
    { type: 'tv', params: { with_genres: '10762', 'vote_count.gte': 15 }, pages: 5 },
    { type: 'movie', params: { with_genres: '16,10751', 'vote_count.gte': 800 }, pages: 4, cert: 'US' }
  ]
};
CATS.mix = [...CATS.kr_movie, ...CATS.kr_tv, ...CATS.anim, ...CATS.world];

// "Kids" filter: highest allowed certification per country.
const KIDS_CERT = { KR: '12', US: 'PG' };

function auth() {
  const token = process.env.TMDB_TOKEN;
  const key = process.env.TMDB_API_KEY;
  if (token) return { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, q: {} };
  if (key) return { headers: { accept: 'application/json' }, q: { api_key: key } };
  return null;
}

function pickPages(max, n) {
  const all = Array.from({ length: max }, (_, i) => i + 1);
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all.slice(0, n);
}

async function discover(a, q, page, kids) {
  const params = new URLSearchParams({
    language: 'ko-KR', include_adult: 'false', sort_by: 'popularity.desc', page: String(page),
    ...Object.fromEntries(Object.entries(q.params).map(([k, v]) => [k, String(v)])),
    ...a.q
  });
  if (q.type === 'tv') params.set('include_null_first_air_dates', 'false');
  if (kids && q.cert) {
    params.set('certification_country', q.cert);
    params.set('certification.lte', KIDS_CERT[q.cert]);
  }
  const r = await fetch(`${BASE}/discover/${q.type}?${params}`, { headers: a.headers });
  if (r.status === 401) throw Object.assign(new Error('TMDB 키가 올바르지 않아요. Vercel 환경 변수를 확인해 주세요.'), { status: 500 });
  if (!r.ok) throw Object.assign(new Error(`TMDB 응답 오류 (${r.status})`), { status: 502 });
  const j = await r.json();
  return (j.results || []).map(x => ({ ...x, _type: q.type }));
}

function shape(x, kind) {
  const isTv = x._type === 'tv';
  const path = kind === 'backdrop' ? x.backdrop_path : x.poster_path;
  if (!path) return null;
  const title = (isTv ? x.name : x.title) || '';
  if (!title) return null;
  return {
    id: `${x._type}-${x.id}`,
    type: x._type,
    title,
    original: isTv ? x.original_name : x.original_title,
    year: ((isTv ? x.first_air_date : x.release_date) || '').slice(0, 4),
    image: IMG + (kind === 'backdrop' ? 'w1280' : 'w780') + path
  };
}

async function collect(a, cat, kind, kids) {
  const jobs = [];
  for (const q of CATS[cat]) {
    for (const p of pickPages(q.pages, 3)) jobs.push(discover(a, q, p, kids).catch(e => { if (e.status === 500) throw e; return []; }));
  }
  const pages = await Promise.all(jobs);
  const seen = new Set();
  const out = [];
  for (const x of pages.flat()) {
    const s = shape(x, kind);
    if (s && !seen.has(s.id)) { seen.add(s.id); out.push(s); }
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const a = auth();
  const { ping, cat = 'kr_movie', kind = 'poster', kids = '1' } = req.query || {};

  if (ping) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, configured: !!a });
  }
  if (!a) return res.status(500).json({ error: 'TMDB 키가 설정되지 않았어요. Vercel 환경 변수 TMDB_TOKEN 을 넣고 다시 배포해 주세요.' });
  if (!CATS[cat]) return res.status(400).json({ error: '알 수 없는 종류예요.' });
  const k = kind === 'backdrop' ? 'backdrop' : 'poster';

  try {
    let items = await collect(a, cat, k, kids === '1');
    let relaxed = false;
    // Certification data is patchy for some titles; widen the pool if the kids filter left too few.
    if (kids === '1' && items.length < 20) {
      const more = await collect(a, cat, k, false);
      const ids = new Set(items.map(i => i.id));
      items = items.concat(more.filter(i => !ids.has(i.id)));
      relaxed = true;
    }
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    return res.status(200).json({ items, relaxed });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || '포스터를 불러오지 못했어요.' });
  }
}
