import { useState, useMemo } from 'react'

const C = {
  bg: '#0f0f0e', surface: '#191918', surface2: '#222220',
  border: 'rgba(255,255,255,0.07)', text: '#f0ede8',
  muted: 'rgba(240,237,232,0.45)', faint: 'rgba(240,237,232,0.15)',
  green: '#7cb87a',
}

const ENTRIES = [
  { type:'like',    text:"A very good quality of life — plenty of rooms, accommodation is very cheap, the city is spacious and very green.", person:"70–80, retired", years:"40+ years in WOB", tags:["nature"] },
  { type:'like',    text:"Sports are very well funded with reliable sponsorship. A lot of swimming opportunities with good water quality, and rich cycling routes throughout the city.", person:"30–40, VW employee", years:"lives in WOB", tags:["nature","vw"] },
  { type:'like',    text:"Forests and greenery in the northern parts of the city.", person:"30, VW employee", years:"commutes from Braunschweig", tags:["nature"] },
  { type:'like',    text:"The canal and Allersee are peaceful and nice to stroll along.", person:"middle-aged, commuter from Braunschweig", years:"15 years commuting", tags:["nature"] },
  { type:'like',    text:"Allersee — nice to sit there in the evening with friends, lots of people spending their evenings there. Bar Celona just opened there.", person:"young adult, city hall employee", years:"25 years, born here", tags:["nature","social"] },
  { type:'like',    text:"The Green Hill near the hospital — a natural green space with a beautiful view over the city and the VW factory.", person:"older, pensioner, former VW", years:"70 years, born here", tags:["nature"] },
  { type:'like',    text:"Large amount of green throughout the city — it feels very natural and not human-made. Dislikes artificial parks.", person:"pensioner, former VW employee", years:"70 years", tags:["nature"] },
  { type:'like',    text:"Greenery, affordability, housing, quality cycling routes and high quality of water.", person:"older, retired", years:"35 years", tags:["nature"] },
  { type:'like',    text:"Natural places nearby — ideal for spending time outdoors.", person:"young adult, software professional", years:"1 year", tags:["nature"] },
  { type:'like',    text:"The way the city is built — among forests. Her daily commute along the forest to the castle.", person:"middle-aged, Schloss Wolfsburg staff", years:"15 years", tags:["nature"] },
  { type:'like',    text:"A lot to do in free time — Phaeno, skate park, planetarium, art museum. Great public transport, buses every 15 minutes.", person:"27, Phaeno staff", years:"27 years, born nearby", tags:["culture","mobility"] },
  { type:'like',    text:"Friends, social environment and communication. It's a small and accessible city with a long history — VW, Fallersleben.", person:"older, VW worker", years:"30 years", tags:["social","vw"] },
  { type:'like',    text:"The library — I like to spend time here, coming here to read newspapers.", person:"middle-aged", years:"15 years", tags:["culture","social"] },
  { type:'like',    text:"A small and nice city — people feel more connected, able to recognise faces. Accepts the community is segregated, but didn't notice racism personally.", person:"middle-aged, refugee", years:"2 years", tags:["social"] },
  { type:'like',    text:"The multicultural profile of the city, Autostadt with daily summer concerts, Phaeno, the swimming hall.", person:"older, retired, former VW", years:"26 years", tags:["culture","vw"] },
  { type:'like',    text:"Robert Koch Platz, Autostadt and the Designer Outlet.", person:"young adult, student", years:"commuter", tags:["centre"] },
  { type:'dislike', text:"A lack of cultural life — theatre and stuff yes, but it's not the same as a real city. Nowhere to go after work, no ideas what to start with.", person:"70–80, retired", years:"40+ years", tags:["culture","social"] },
  { type:'dislike', text:"You always have to use a car to get somewhere — cars are a constraint to spending time outside. Big cities like Berlin or Hamburg are nearby so people go there instead.", person:"30–40, VW employee", years:"lives in WOB", tags:["mobility","social"] },
  { type:'dislike', text:"There is really nothing to do in the city. That's why many people are living in Braunschweig instead.", person:"30, VW employee", years:"lives in Braunschweig", tags:["social","culture"] },
  { type:'dislike', text:"There are big structures — Phaeno, library, museum — but nothing for actual socialisation for the residents.", person:"older, retired", years:"35 years", tags:["social","culture"] },
  { type:'dislike', text:"It's difficult to become involved in social life and find your place. Many communities are centred around VW, making it hard to join existing groups.", person:"young adult, software professional", years:"1 year", tags:["social","vw"] },
  { type:'dislike', text:"Compared to Barcelona, this is not a social city.", person:"middle-aged, BadeLand staff", years:"2 months", tags:["social"] },
  { type:'dislike', text:"The city is not easy to socialise in. Immigrants find it particularly difficult to mingle.", person:"older, DHL worker", years:"10 years", tags:["social"] },
  { type:'dislike', text:"The lack of social interaction in the city.", person:"middle-aged, Schloss WOB staff", years:"15 years", tags:["social"] },
  { type:'dislike', text:"Dependent almost entirely on VW. When VW closes there would be no workplaces — worried for the kids.", person:"young adult, Autostadt worker", years:"commuter", tags:["vw"] },
  { type:'dislike', text:"Very conservative society, a culture of judgement from older people, ugly buildings and an overly strong dependence on Volkswagen.", person:"27, Phaeno staff", years:"27 years", tags:["vw","culture"] },
  { type:'dislike', text:"Porschestraße — construction sites, no well-stocked supermarket apart from Aldi, no high-quality restaurants. Back in the day it was very different.", person:"pensioner, former VW", years:"70 years", tags:["centre"] },
  { type:'dislike', text:"Porschestraße — unattractive, too chaotic, empty shops, not enough green. Incorrect investment in too-big landmarks instead of what the city actually needs.", person:"older, retired, former VW", years:"26 years", tags:["centre"] },
  { type:'dislike', text:"The ZOB — the social environment there. As a child he had to change buses there regularly and found it uncomfortable.", person:"young adult, city hall employee", years:"25 years, born here", tags:["centre","mobility"] },
  { type:'dislike', text:"The main station — it's a big city and it's so sad there is no nice station. It should be renewed or expanded to fit the city's image.", person:"middle-aged", years:"15 years", tags:["mobility","centre"] },
  { type:'dislike', text:"It gets very hot in summer because of the amount of stone and concrete surfaces in the city centre.", person:"young adult, student", years:"", tags:["centre","nature"] },
  { type:'dislike', text:"Hard to be involved in local communities. There is a general lack of social activities.", person:"young adult, student", years:"", tags:["social"] },
  { type:'change',  text:"More cultural events, more commercial and social activities offered throughout the city.", person:"70–80, retired", years:"40+ years", tags:["culture","social"] },
  { type:'change',  text:"More walkable areas — the city is far too car-centric as it stands.", person:"30–40, VW employee", years:"lives in WOB", tags:["mobility"] },
  { type:'change',  text:"More green on the squares in the inner city, less concrete.", person:"young adult, city hall employee", years:"25 years, born here", tags:["nature","centre"] },
  { type:'change',  text:"A green entrance to the city at the bus station square — rather than what it is now.", person:"middle-aged, refugee", years:"2 years", tags:["centre","nature"] },
  { type:'change',  text:"Enhancing social and community platforms for better interaction — spaces where people can connect outside of VW circles.", person:"young adult, software professional", years:"1 year", tags:["social","vw"] },
  { type:'change',  text:"Empty shops due to the rise of online shopping — a contemporary and innovative strategy is needed to respond to this.", person:"27, Phaeno staff", years:"27 years", tags:["centre"] },
  { type:'change',  text:"She would like to bring the ocean into the city.", person:"middle-aged, Schloss WOB staff", years:"15 years", tags:["nature"] },
  { type:'change',  text:"Better and more accessible healthcare, especially medical specialists — the number of doctors is not enough.", person:"older, VW worker", years:"30 years", tags:["social"] },
  { type:'insight', text:"Said at first he doesn't like the city — but by the end of the interview realised he actually likes it more than he initially thought.", person:"young adult, city hall employee", years:"25 years, born here", tags:["social"] },
  { type:'insight', text:"After moving away for his studies he learned to deeply appreciate the city and wouldn't want to live anywhere else again.", person:"pensioner, former VW", years:"70 years", tags:["nature","vw"] },
  { type:'insight', text:"Visits the square near the ZOB and Autostadt for the sunshine — currently unemployed. The bus square is his main daily outdoor spot.", person:"middle-aged, refugee", years:"2 years", tags:["centre","social"] },
]

const CLUSTERS = [
  { color:'#e07a6a', title:'Social Isolation & Missing Meeting Places', count:'14 / 21 interviews', summary:'The most dominant theme across all age groups and backgrounds. Wolfsburg functions well as a city of infrastructure — but not as a city of spontaneous encounter. Social communities are strongly VW-centred, systematically excluding newcomers, commuters and non-VW employees. Existing cultural venues are perceived as destinations for specific occasions, not as everyday gathering spots.', quotes:['Communities are centered around VW. This makes it difficult to join existing social communities.','There are big structures but nothing for actual socialization for the residents.','Compared to Barcelona, this is not a social city.'], designNote:'The design must create low-threshold, VW-independent gathering infrastructure — not further monuments.' },
  { color:'#7cb87a', title:'Nature as the Only Shared Identity', count:'15 / 21 interviews', summary:'Green spaces, forests and waterways are the only theme rated positively across all ages, occupations and lengths of residence. The Green Hill near the hospital and the Allersee are spontaneously named as favourite spots. Crucially, nature is valued as authentic — artificial parks are explicitly rejected. The Allersee in particular functions as an informal social node.', quotes:["Likes that it feels very natural and is not human made — dislikes artificial parks.",'Allersee — nice to sit there in the evening with friends, lots of people spending their evenings there.',"She'd like to bring the ocean into the city."], designNote:"Nature is the city's strongest asset. The design should bring nature into the urban fabric as a structural element, not as decoration." },
  { color:'#d4a96a', title:'Decline of the City Centre (Porschestraße & ZOB)', count:'11 / 21 interviews', summary:'Porschestraße divides opinion — some enjoy it as a stroll, many lament vacant shops and poor gastronomy quality. The ZOB is consistently criticised: no greenery, no welcoming atmosphere, named as the first negative impression of the city by multiple respondents.', quotes:['The city is slowly dying out and losing quality services.','A green entrance to the city rather than what it is now.','Empty shops — maybe some contemporary and innovative strategy could be done.'], designNote:'ZOB and Porschestraße are the most visible symptoms of urban decline. Interventions here would carry high symbolic and practical impact.' },
  { color:'#a87ad4', title:'VW Mono-Structure: Asset and Risk', count:'10 / 21 interviews', summary:'VW is described simultaneously as a guarantor of quality of life and a structural trap. Dependency creates anxiety — several respondents mention job cuts. Social networks are VW-bound and exclude those without a VW connection.', quotes:['Dependent almost entirely on VW.','When VW closes there would be no workplaces. Worried for the kids.','Communities are centred around VW.'], designNote:'The design can help build a city identity independent of VW — through spaces equally open to all city users.' },
  { color:'#7aabd4', title:'Mobility: A Car City Without a Walking City', count:'8 / 21 interviews', summary:'Car-dependency is criticised by younger respondents. The main railway station is consistently called too small, too dark and unrepresentative of a city of this size and wealth. Bus services receive isolated positive mentions.', quotes:["You always have to use a car to get somewhere — cars are a constraint to spending time outside.",'Bahnhof should be renewed or expanded to fit the city\'s image.','Design of the main train station, add more light.'], designNote:'Walkable connections and upgrading key nodes (ZOB, station) are prerequisites for vibrant public spaces.' },
  { color:'#888880', title:'Urban Flight: Competition from Neighbouring Cities', count:'7 / 21 interviews', summary:'Braunschweig, Hanover and Hamburg are regularly mentioned as alternatives for leisure, culture and shopping. Wolfsburg loses not due to lack of infrastructure, but due to missing atmosphere and variety of offer.', quotes:["There is nothing to do — that's why they are living in Braunschweig.",'People go to other cities like Hamburg, Hanover because of lack of culture.','Braunschweig is a larger, more historic city, more places to visit.'], designNote:"Wolfsburg doesn't need to become a metropolis — but it needs a reason to stay in the evening rather than drive away." },
]

const TENSIONS = [
  { title:'Nature everywhere — sociability nowhere', body:"Wolfsburg is among Germany's greenest cities, and this is universally loved. Yet this quality does not translate into social encounter. Parks and forests are used for solitary recreation, not as places of meeting. The one exception is the Allersee in the evening — which works precisely because it is informal and free. The central design question: how can nature become a social space without losing its authenticity?" },
  { title:'Latent affection vs. articulated rejection', body:"Several respondents begin interviews with sharp criticism and revise this as the conversation develops. One respondent initially called the city unattractive — and concluded by the end he liked it more than he thought. This suggests a dormant civic attachment that better places and offerings could activate. The design should awaken this sleeping identification, not invent a new one." },
  { title:'Monuments vs. everyday life', body:"Wolfsburg has a disproportionate number of architectural landmarks for its size, but too few cafés, markets and squares for daily life. Investment logic follows prestige and external image rather than residents' daily needs. The city impresses but does not invite." },
  { title:'VW as enabler and exclusion machine', body:"VW funds sport, culture and urban development — without it, Wolfsburg would be a very different city. Yet VW also structures social life so strongly that those without a VW connection feel systematically excluded. This duality cannot be resolved, but the design can create spaces that deliberately operate outside this logic." },
]

const TAG_CFG = {
  nature:   { label:'Nature',       color:'#7cb87a', bg:'rgba(124,184,122,0.1)' },
  social:   { label:'Social Life',  color:'#e07a6a', bg:'rgba(224,122,106,0.1)' },
  culture:  { label:'Culture',      color:'#d4a96a', bg:'rgba(212,169,106,0.1)' },
  mobility: { label:'Mobility',     color:'#7aabd4', bg:'rgba(122,171,212,0.1)' },
  vw:       { label:'VW',           color:'#a87ad4', bg:'rgba(168,122,212,0.1)' },
  centre:   { label:'City Centre',  color:'#c8a078', bg:'rgba(200,160,120,0.12)' },
}

const TYPE_CFG = {
  like:    { icon:'♥', label:'What people love about Wolfsburg', color:'#7cb87a', bg:'rgba(124,184,122,0.1)' },
  dislike: { icon:'✕', label:'What people find frustrating',     color:'#e07a6a', bg:'rgba(224,122,106,0.1)' },
  change:  { icon:'→', label:'What people wish would change',    color:'#d4a96a', bg:'rgba(212,169,106,0.1)' },
  insight: { icon:'◎', label:'Notable observations',             color:'#7aabd4', bg:'rgba(122,171,212,0.1)' },
}

const FILTERS = [
  { id:'all',      label:'All' },
  { id:'nature',   label:'Nature' },
  { id:'social',   label:'Social Life' },
  { id:'culture',  label:'Culture' },
  { id:'mobility', label:'Mobility' },
  { id:'vw',       label:'VW' },
  { id:'centre',   label:'City Centre' },
]

function Tag({ id }) {
  const cfg = TAG_CFG[id]
  if (!cfg) return null
  return (
    <span style={{ fontSize:10, fontWeight:500, letterSpacing:'0.05em', padding:'2px 7px', borderRadius:4, textTransform:'uppercase', background:cfg.bg, color:cfg.color }}>
      {cfg.label}
    </span>
  )
}

function EntryCard({ type, text, person, years, tags }) {
  const tc = TYPE_CFG[type]
  const personLine = [person, years].filter(Boolean).join(' · ')
  return (
    <div
      style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:'16px 18px', transition:'border-color 0.15s, background 0.15s', cursor:'default' }}
      onMouseEnter={e => { e.currentTarget.style.background = C.surface2; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)' }}
      onMouseLeave={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.borderColor = C.border }}
    >
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:10 }}>
        <p style={{ fontSize:15, lineHeight:1.55, fontStyle:'italic', color:C.text, flex:1, margin:0 }}>
          "{text}"
        </p>
        <div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, flexShrink:0, background:tc.bg, color:tc.color }}>
          {tc.icon}
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginTop:10 }}>
        <span style={{ fontSize:11, color:C.muted, fontWeight:300 }}>{personLine}</span>
        <div style={{ display:'flex', gap:5, marginLeft:'auto', flexWrap:'wrap', justifyContent:'flex-end' }}>
          {tags.map(t => <Tag key={t} id={t} />)}
        </div>
      </div>
    </div>
  )
}

function ClusterCard({ color, title, count, summary, quotes, designNote }) {
  return (
    <div
      style={{ background:C.surface, border:`1px solid ${C.border}`, borderLeft:`3px solid ${color}`, borderRadius:10, padding:'20px 22px', transition:'background 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.background = C.surface2}
      onMouseLeave={e => e.currentTarget.style.background = C.surface}
    >
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:12 }}>
        <h3 style={{ fontSize:18, fontWeight:400, letterSpacing:'-0.01em', lineHeight:1.3, color:C.text, margin:0 }}>{title}</h3>
        <span style={{ fontSize:11, fontWeight:500, padding:'3px 10px', borderRadius:20, whiteSpace:'nowrap', flexShrink:0, marginTop:3, background:color+'22', color }}>{count}</span>
      </div>
      <p style={{ fontSize:13, color:C.muted, lineHeight:1.7, marginBottom:14, fontWeight:300 }}>{summary}</p>
      <div style={{ display:'flex', flexDirection:'column', gap:7, marginBottom:14 }}>
        {quotes.map((q, i) => (
          <div key={i} style={{ fontSize:13, fontStyle:'italic', color:C.text, opacity:0.7, paddingLeft:12, borderLeft:`2px solid ${C.border}`, lineHeight:1.5 }}>
            "{q}"
          </div>
        ))}
      </div>
      <div style={{ paddingTop:12, borderTop:`1px solid ${C.border}` }}>
        <p style={{ fontSize:12, color:C.muted, fontWeight:300, lineHeight:1.5, margin:0 }}>
          <strong style={{ fontWeight:500 }}>Design relevance:</strong> {designNote}
        </p>
      </div>
    </div>
  )
}

export default function StoriesPanel({ onClose }) {
  const [activeNav, setActiveNav] = useState('voices')
  const [filter, setFilter]       = useState('all')
  const [search, setSearch]       = useState('')

  const visible = useMemo(() => {
    const term = search.toLowerCase().trim()
    return ENTRIES.filter(e => {
      const mf = filter === 'all' || e.tags.includes(filter)
      const ms = !term || e.text.toLowerCase().includes(term) || e.person.toLowerCase().includes(term)
      return mf && ms
    })
  }, [filter, search])

  const grouped = useMemo(() => {
    const g = { like:[], dislike:[], change:[], insight:[] }
    visible.forEach(e => g[e.type].push(e))
    return g
  }, [visible])

  return (
    <div className="absolute inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background:C.bg, color:C.text, fontSize:14 }}
    >
      {/* Header */}
      <div style={{ padding:'28px 28px 0', borderBottom:`1px solid ${C.border}`, background:C.surface, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:11, fontWeight:500, letterSpacing:'0.12em', textTransform:'uppercase', color:C.green, marginBottom:10 }}>
              <div style={{ width:7, height:7, background:C.green, borderRadius:'50%' }} />
              City Pulse · Wolfsburg
            </div>
            <h1 style={{ fontSize:28, fontWeight:400, color:C.text, lineHeight:1.2, letterSpacing:'-0.02em', margin:0 }}>
              Voices from the City
            </h1>
            <p style={{ fontSize:13, color:C.muted, marginTop:4, fontWeight:300 }}>
              What residents, commuters and visitors say about living here
            </p>
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8 }}>
            <div style={{ textAlign:'right', fontSize:11, color:C.muted, lineHeight:1.8 }}>
              <strong style={{ color:C.text, fontWeight:500 }}>21</strong> interviews<br />
              <strong style={{ color:C.text, fontWeight:500 }}>10</strong> student teams<br />
              Bauhaus-Universität Weimar
            </div>
            <button onClick={onClose}
              style={{ width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', background:'rgba(255,255,255,0.1)', border:'none', color:'rgba(240,237,232,0.6)', fontSize:20, cursor:'pointer', lineHeight:1, transition:'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            >×</button>
          </div>
        </div>

        {/* Nav tabs */}
        <div style={{ display:'flex', gap:0 }}>
          {[['voices','Voices'],['clusters','Theme Clusters']].map(([id, label]) => (
            <button key={id} onClick={() => setActiveNav(id)}
              style={{ padding:'10px 18px', fontSize:13, fontWeight:500, color:activeNav===id ? C.text : C.muted, cursor:'pointer', border:'none', background:'none', borderBottom:activeNav===id ? `2px solid ${C.text}` : '2px solid transparent', whiteSpace:'nowrap', transition:'color 0.15s, border-color 0.15s', letterSpacing:'0.02em' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-tabs (Voices only) */}
      {activeNav === 'voices' && (
        <div style={{ display:'flex', gap:0, padding:'0 28px', background:C.bg, borderBottom:`1px solid ${C.border}`, overflowX:'auto', flexShrink:0, scrollbarWidth:'none' }}>
          {FILTERS.map(f => {
            const count = f.id === 'all' ? ENTRIES.length : ENTRIES.filter(e => e.tags.includes(f.id)).length
            const active = filter === f.id
            return (
              <button key={f.id} onClick={() => setFilter(f.id)}
                style={{ padding:'9px 14px', fontSize:11, fontWeight:500, letterSpacing:'0.05em', textTransform:'uppercase', color:active ? C.text : C.muted, cursor:'pointer', border:'none', background:'none', borderBottom:active ? `2px solid rgba(240,237,232,0.4)` : '2px solid transparent', whiteSpace:'nowrap', transition:'color 0.15s' }}
              >
                {f.label} <span style={{ fontSize:10, color:active ? C.muted : C.faint }}>{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Search (Voices only) */}
      {activeNav === 'voices' && (
        <div style={{ padding:'16px 28px 0', flexShrink:0, background:C.bg }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:'7px 12px', maxWidth:320 }}>
            <span style={{ color:C.faint, fontSize:13 }}>⌕</span>
            <input
              type="text"
              placeholder="Search quotes…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ background:'none', border:'none', outline:'none', color:C.text, fontSize:13, width:'100%' }}
            />
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{ flex:1, overflowY:'auto' }}>

        {/* Voices */}
        {activeNav === 'voices' && (
          <div style={{ padding:'24px 28px', display:'flex', flexDirection:'column', gap:0 }}>
            {visible.length === 0 && (
              <div style={{ textAlign:'center', padding:'48px 24px', color:C.muted, fontSize:13 }}>No entries found</div>
            )}
            {['like','dislike','change','insight'].map(type => {
              const group = grouped[type]
              if (!group.length) return null
              const cfg = TYPE_CFG[type]
              return (
                <div key={type}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 0 16px' }}>
                    <span style={{ fontSize:18, color:cfg.color }}>{cfg.icon}</span>
                    <span style={{ fontSize:18, fontWeight:400, letterSpacing:'-0.01em' }}>{cfg.label}</span>
                    <span style={{ fontSize:12, color:C.muted, marginLeft:'auto', fontWeight:300 }}>{group.length} quotes</span>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {group.map((e, i) => <EntryCard key={i} {...e} />)}
                  </div>
                  <div style={{ height:1, background:C.border, margin:'24px 0 8px' }} />
                </div>
              )
            })}
          </div>
        )}

        {/* Clusters */}
        {activeNav === 'clusters' && (
          <div style={{ padding:'24px 28px', display:'flex', flexDirection:'column', gap:16 }}>
            {CLUSTERS.map((c, i) => <ClusterCard key={i} {...c} />)}

            <div style={{ paddingTop:8 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0 16px' }}>
                <span style={{ fontSize:18 }}>~</span>
                <span style={{ fontSize:18, fontWeight:400 }}>Key Tensions</span>
              </div>
              {TENSIONS.map((t, i) => (
                <div key={i} style={{ background:C.surface, border:`1px solid ${C.border}`, borderLeft:'3px solid rgba(212,169,106,0.5)', borderRadius:10, padding:'18px 20px', marginBottom:12 }}>
                  <p style={{ fontSize:14, fontWeight:500, marginBottom:8, color:C.text }}>{t.title}</p>
                  <p style={{ fontSize:13, color:C.muted, lineHeight:1.7, fontWeight:300, margin:0 }}>{t.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
