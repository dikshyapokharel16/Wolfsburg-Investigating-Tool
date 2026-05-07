import { useState, useCallback } from 'react'

export const TOPICS = [
  { id: 'neighbourhood', label: 'Neighbourhood', color: '#818cf8',
    keywords: ['neighbourhood','neighborhood','district','quarter','residential','suburb','street','area',
      'immobilien','wohnung','miete','haus','kauf','kaufen','wohnungssuche','mieten','vermieter',
      'stadtteil','viertel','quartier','wohngebiet','nachbarschaft','wohnviertel','kiez',
      'detmerode','stadtmitte','westhagen','fallersleben','vorsfelde','sandkamp','klieversberg',
      'laagberg','hohenstein','schillerteich','rabenberg','steimker','kreuzheide','nordsteimke'] },
  { id: 'social', label: 'Social Life', color: '#f472b6',
    keywords: ['community','social','nightlife','pub','bar','cafe','café','party','festival',
      'meet people','friends','locals','lonely','isolated','boring','lively','together','expat',
      'gemeinschaft','nachtleben','kneipe','treffen','freunde','leute','einsam','langweilig',
      'zusammen','kennenlernen','ausländer','integration','veranstaltung','freizeit'] },
  { id: 'culture', label: 'Culture', color: '#fb923c',
    keywords: ['culture','museum','theatre','theater','concert','art','gallery','cinema','exhibition',
      'phaeno','phäno','autostadt','kunstmuseum',
      'kultur','theater','konzert','kunst','galerie','kino','ausstellung','kulturell'] },
  { id: 'cycling', label: 'Cycling', color: '#34d399',
    keywords: ['cycling','bike','bicycle','cycle path','cycle lane','cyclist',
      'fahrrad','radfahren','radweg','radfahrer','fahrradweg','e-bike','ebike'] },
  { id: 'walkability', label: 'Walkability', color: '#60a5fa',
    keywords: ['walking','walkable','pedestrian','on foot','sidewalk','pavement','stroll',
      'fußgänger','zu fuß','gehweg','spazieren','fußweg','fußläufig','fußgängerzone'] },
  { id: 'work', label: 'Work', color: '#fbbf24',
    keywords: ['working in wolfsburg','work here','job here','moved here for work','volkswagen',
      'vw plant','vw factory','commute','layoff','strike','employment',
      'arbeit','arbeiten','job','volkswagen','fabrik','arbeitsplatz','pendeln','gehalt',
      'entlassung','streik','bewerben','bewerbung','ausbildung','studium'] },
  { id: 'problem', label: 'Problem', color: '#f87171',
    keywords: ['problem','issue','crime','unsafe','dirty','noise','noisy','traffic',
      'too expensive','lacking','broken','complaint','flood','accident','protest',
      'kriminalität','unsicher','dreckig','lärm','stau','teuer','fehlt','kaputt','mangel',
      'ärger','beschwerde','kaputt','schlimm','gefährlich','überfall'] },
]

const POSITIVE = [
  'great','love','amazing','beautiful','excellent','wonderful','best','fantastic','perfect',
  'happy','enjoy','nice','awesome','recommend','friendly','vibrant','gem','underrated','cozy',
  'toll','schön','wunderschön','wunderbar','beste','fantastisch','perfekt','glücklich',
  'genießen','nett','empfehlen','freundlich','großartig','super','klasse',
]
const NEGATIVE = [
  'bad','terrible','crime','expensive','poor','worst','hate','awful','horrible',
  'disappointing','boring','empty','dull','unsafe','dirty','noisy','dead','soulless','nothing to do',
  'schlecht','schrecklich','kriminalität','teuer','schlimmste','furchtbar','enttäuschend',
  'langweilig','leer','öde','gefährlich','unsicher','dreckig','laut','kaputt',
]

function scoreSentiment(text) {
  if (!text) return 'neutral'
  const lower = text.toLowerCase()
  const pos = POSITIVE.filter(w => lower.includes(w)).length
  const neg = NEGATIVE.filter(w => lower.includes(w)).length
  if (pos > neg) return 'positive'
  if (neg > pos) return 'negative'
  return 'neutral'
}

function detectTopics(text) {
  if (!text) return []
  const lower = text.toLowerCase()
  return TOPICS.filter(t => t.keywords.some(kw => lower.includes(kw))).map(t => t.id)
}

// Extract the most story-like sentence from body text
function extractVoice(selftext) {
  if (!selftext || selftext.length < 40) return null
  const sentences = selftext
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 40 && s.length < 280)
    // Prefer sentences that sound personal
    .sort((a, b) => {
      const personal = /\b(i |we |my |our |i've|i'm|we've|we're|ich |wir |mein|unser)\b/i
      return (personal.test(b) ? 1 : 0) - (personal.test(a) ? 1 : 0)
    })
  return sentences[0] || selftext.slice(0, 220)
}

function isRelevant(post) {
  return post.topics.length > 0
}

const REDDIT_QUERIES = [
  // Top posts of the year from the dedicated community
  'https://www.reddit.com/r/Wolfsburg.json?sort=top&t=year&limit=50&raw_json=1',
  // People asking about living / moving here
  'https://www.reddit.com/search.json?q=wolfsburg+%28moving+OR+living+OR+expat+OR+relocate+OR+umziehen+OR+wohnen%29&sort=top&t=year&limit=25&raw_json=1',
  // Daily life discussions
  'https://www.reddit.com/search.json?q=wolfsburg+%28life+OR+leben+OR+kultur+OR+fahrrad+OR+nachbarschaft+OR+lonely+OR+einsam%29&sort=relevance&t=year&limit=25&raw_json=1',
]

function parseGdeltDate(s) {
  if (!s || s.length < 8) return ''
  return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
}

export function useStories() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [errors, setErrors] = useState([])

  const fetchStories = useCallback(async () => {
    setLoading(true)
    setErrors([])
    const errs = []
    const all = []

    // Reddit
    const redditResults = await Promise.allSettled(
      REDDIT_QUERIES.map(url =>
        fetch(url, { headers: { Accept: 'application/json' } }).then(r => r.json())
      )
    )
    for (const r of redditResults) {
      if (r.status !== 'fulfilled') continue
      for (const { data: p } of (r.value?.data?.children ?? [])) {
        const fullText = p.title + ' ' + (p.selftext || '')
        const topics = detectTopics(fullText)
        const voice = extractVoice(p.selftext)
        all.push({
          id: 'r_' + p.id,
          title: p.title,
          voice,
          hasStory: !!voice,
          url: `https://reddit.com${p.permalink}`,
          source: p.subreddit_name_prefixed,
          score: p.score,
          comments: p.num_comments,
          date: new Date(p.created_utc * 1000).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric',
          }),
          sentiment: scoreSentiment(fullText),
          topics,
          _type: 'reddit',
        })
      }
    }
    if (redditResults.every(r => r.status === 'rejected')) errs.push('Reddit: could not fetch')

    // News (GDELT) — topic-specific queries
    const gdeltResults = await Promise.allSettled([
      fetch('https://api.gdeltproject.org/api/v2/doc/doc?query=wolfsburg%20(wohnen%20OR%20fahrrad%20OR%20kultur%20OR%20sozial%20OR%20nachbarschaft%20OR%20problem)&mode=artlist&maxrecords=25&format=json&timespan=180d').then(r => r.json()),
      fetch('https://api.gdeltproject.org/api/v2/doc/doc?query=wolfsburg%20(living%20OR%20cycling%20OR%20culture%20OR%20community%20OR%20crime%20OR%20walkable%20OR%20neighbourhood)&mode=artlist&maxrecords=25&format=json&timespan=180d').then(r => r.json()),
    ])
    for (const r of gdeltResults) {
      if (r.status !== 'fulfilled') continue
      for (const [i, a] of (r.value?.articles ?? []).entries()) {
        const text = a.title || ''
        const topics = detectTopics(text)
        all.push({
          id: 'g_' + i + '_' + (a.url || '').slice(-10),
          title: text || 'Untitled',
          voice: null,
          hasStory: false,
          url: a.url,
          source: a.domain || 'news',
          score: null,
          comments: null,
          date: parseGdeltDate(a.seendate),
          sentiment: scoreSentiment(text),
          topics,
          _type: 'news',
        })
      }
    }
    if (gdeltResults.every(r => r.status === 'rejected')) errs.push('News: could not fetch')

    // Deduplicate, keep relevant only, sort: stories-with-body first then by score
    const seen = new Set()
    const unique = all.filter(p => {
      if (seen.has(p.id)) return false
      seen.add(p.id)
      return isRelevant(p)
    })
    unique.sort((a, b) => {
      if (a.hasStory !== b.hasStory) return a.hasStory ? -1 : 1
      return (b.score ?? 0) - (a.score ?? 0)
    })

    setPosts(unique)
    setErrors(errs)
    setLoading(false)
    setLoaded(true)
  }, [])

  return { posts, loading, loaded, errors, fetchStories }
}
