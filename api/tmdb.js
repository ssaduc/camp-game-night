// Vercel serverless function: a small, locked-down proxy to TMDB.
// The browser never sees the TMDB key. Only the categories below can be requested.
//
// Env vars (set one in Vercel → Project → Settings → Environment Variables):
//   TMDB_TOKEN    = "API Read Access Token" (long token starting with eyJ...)   ← recommended
//   TMDB_API_KEY  = "API Key" (32 characters)
//
// Ordering ("famous first"):
//   1) Movies on the KR_BOX list below are ranked by total Korean audience (higher in the list = more famous).
//   2) Everything else (dramas, titles not on the list) is ranked by TMDB vote count.
//   The browser then takes the most famous titles it has not shown recently.

const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/';

// Korean all-time box office, most watched first (KOBIS-based rankings; the top ~35 are the 10-million club).
// Lower entries are grouped approximately. Titles are matched against TMDB Korean titles, ignoring spaces and punctuation.
const KR_BOX = [
  '명량', '극한직업', '신과함께-죄와 벌', '국제시장', '어벤져스: 엔드게임', '겨울왕국 2', '베테랑', '아바타', '서울의 봄', '도둑들',
  '7번방의 선물', '암살', '범죄도시 2', '알라딘', '광해, 왕이 된 남자', '왕의 남자', '신과함께-인과 연', '택시운전사', '태극기 휘날리며', '부산행',
  '해운대', '변호인', '괴물', '파묘', '범죄도시 4', '어벤져스: 인피니티 워', '실미도', '아바타: 물의 길', '범죄도시 3', '기생충',
  '어벤져스: 에이지 오브 울트론', '인터스텔라', '겨울왕국', '왕과 사는 남자', '보헤미안 랩소디', '검사외전', '엑시트', '아이언맨 3', '인사이드 아웃 2', '관상',
  '해적: 바다로 간 산적', '캡틴 아메리카: 시빌 워', '수상한 그녀', '디 워', '과속스캔들', '백두산', '탑건: 매버릭', '국가대표', '웰컴 투 동막골', '공조',
  '트랜스포머 3', '히말라야', '밀정', '미션 임파서블: 고스트 프로토콜', '스파이더맨: 노 웨이 홈', '베테랑2', '한산: 용의 출현', '엘리멘탈', '1987', '터널',
  '인천상륙작전', '마스터', '쥬라기 월드', '군함도', '최종병기 활', '친구', '타짜', '써니', '모가디슈', '노량: 죽음의 바다',
  '어벤져스', '스즈메의 문단속', '헌트', '밀수', '콘크리트 유토피아', '범죄도시', '아저씨', '미녀는 괴로워', '추격자', '설국열차',
  '은밀하게 위대하게', '늑대소년', '전우치', '공동경비구역 JSA', '쉬리', '더 퍼스트 슬램덩크', '인사이드 아웃', '하얼빈', '라이온 킹', '주토피아',
  '건축학개론', '너의 이름은.', '코코', '라라랜드', '위대한 쇼맨', '레 미제라블', '해리 포터와 마법사의 돌', '타이타닉', '트랜스포머: 패자의 역습', '쿵푸팬더'
];
const norm = s => (s || '').toLowerCase().replace(/[\s:.,!?'"·\-–—()&]/g, '');
const BOX_RANK = new Map(KR_BOX.map((t, i) => [norm(t), i]));

// Each category = one or more TMDB "discover" queries, sorted by vote count so the pool is made of well-known titles.
const CATS = {
  kr_movie: [{ type: 'movie', params: { with_origin_country: 'KR', 'vote_count.gte': 30 }, pages: 12, cert: 'KR' }],
  kr_tv: [{ type: 'tv', params: { with_origin_country: 'KR', 'vote_count.gte': 20, without_genres: '10763,10764,10767,16' }, pages: 10 }],
  anim: [
    { type: 'movie', params: { with_genres: '16', 'vote_count.gte': 300 }, pages: 8, cert: 'US' },
    { type: 'tv', params: { with_genres: '16', 'vote_count.gte': 200, without_genres: '10767' }, pages: 4 }
  ],
  world: [{ type: 'movie', params: { 'vote_count.gte': 2000 }, pages: 10, cert: 'US' }],
  kids: [
    { type: 'tv', params: { with_genres: '10762', 'vote_count.gte': 5 }, pages: 6 },
    { type: 'movie', params: { with_genres: '16,10751', 'vote_count.gte': 300 }, pages: 6, cert: 'US' }
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

async function discover(a, q, page, kids) {
  const params = new URLSearchParams({
    language: 'ko-KR', include_adult: 'false', sort_by: 'vote_count.desc', page: String(page),
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
  const rank = isTv ? undefined : BOX_RANK.get(norm(title));
  // Box-office list always outranks vote counts (TMDB vote counts stay well under 1,000,000).
  const fame = rank !== undefined ? 1e6 - rank * 100 : (x.vote_count || 0);
  return {
    id: `${x._type}-${x.id}`,
    type: x._type,
    title,
    original: isTv ? x.original_name : x.original_title,
    year: ((isTv ? x.first_air_date : x.release_date) || '').slice(0, 4),
    image: IMG + (kind === 'backdrop' ? 'w1280' : 'w780') + path,
    fame,
    boxRank: rank !== undefined ? rank + 1 : null
  };
}

async function collect(a, cat, kind, kids) {
  const jobs = [];
  for (const q of CATS[cat]) {
    for (let p = 1; p <= q.pages; p++) jobs.push(discover(a, q, p, kids).catch(e => { if (e.status === 500) throw e; return []; }));
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
    if (kids === '1' && items.length < 60) {
      const more = await collect(a, cat, k, false);
      const ids = new Set(items.map(i => i.id));
      items = items.concat(more.filter(i => !ids.has(i.id)));
      relaxed = true;
    }
    items.sort((x, y) => y.fame - x.fame);
    // The pool is the same for everyone, so let Vercel's CDN keep it for a day.
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ items, relaxed });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || '포스터를 불러오지 못했어요.' });
  }
}
