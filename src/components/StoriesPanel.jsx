import { useEffect, useState } from 'react'
import { useStories, TOPICS } from '../hooks/useStories'

const TOPIC_MAP = Object.fromEntries(TOPICS.map(t => [t.id, t]))

function TopicTag({ id }) {
  const t = TOPIC_MAP[id]
  if (!t) return null
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider"
      style={{ backgroundColor: t.color + '22', color: t.color }}
    >
      {t.label}
    </span>
  )
}

// A post with real body text — shown as a first-person quote
function VoiceCard({ title, voice, url, source, score, comments, topics }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="block p-4 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
    >
      <p className="text-sm text-white/80 leading-relaxed italic mb-3">"{voice}"</p>
      <p className="text-[11px] text-white/40 font-medium mb-2 not-italic line-clamp-1">{title}</p>
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-white/25">{source}</span>
        {score != null && <span className="text-[10px] text-white/25">↑ {score}</span>}
        {comments != null && <span className="text-[10px] text-white/25">💬 {comments}</span>}
        <div className="flex gap-1 ml-auto">
          {topics.slice(0, 3).map(id => <TopicTag key={id} id={id} />)}
        </div>
      </div>
    </a>
  )
}

// A post without body text — compact headline row
function MentionCard({ title, url, source, date, score, topics }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-start gap-3 py-2.5 border-b border-white/5 last:border-0 hover:bg-white/[0.03] px-1 rounded transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/70 leading-snug line-clamp-2">{title}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-white/25">{source}</span>
          <span className="text-[10px] text-white/20">·</span>
          <span className="text-[10px] text-white/25">{date}</span>
          {score != null && <><span className="text-[10px] text-white/20">·</span><span className="text-[10px] text-white/25">↑ {score}</span></>}
        </div>
      </div>
      <div className="flex flex-col gap-1 flex-shrink-0">
        {topics.slice(0, 2).map(id => <TopicTag key={id} id={id} />)}
      </div>
    </a>
  )
}

function Section({ emoji, heading, subheading, posts, emptyText }) {
  const [expanded, setExpanded] = useState(false)
  if (posts.length === 0) return null

  const voices = posts.filter(p => p.hasStory)
  const mentions = posts.filter(p => !p.hasStory)
  const visibleMentions = expanded ? mentions : mentions.slice(0, 4)

  return (
    <section className="mb-8">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-base">{emoji}</span>
        <div>
          <h3 className="text-white font-bold text-sm">{heading}</h3>
          <p className="text-[11px] text-white/30">{subheading}</p>
        </div>
        <span className="ml-auto text-[10px] text-white/20">{posts.length} posts</span>
      </div>

      {voices.length > 0 && (
        <div className="space-y-2 mb-3">
          {voices.map((p, i) => <VoiceCard key={p.id ?? i} {...p} />)}
        </div>
      )}

      {mentions.length > 0 && (
        <div className="bg-white/[0.02] rounded-xl px-3 py-1">
          {visibleMentions.map((p, i) => <MentionCard key={p.id ?? i} {...p} />)}
          {mentions.length > 4 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="w-full text-center text-[10px] text-white/25 hover:text-white/50 py-2 transition-colors"
            >
              {expanded ? 'Show less' : `+ ${mentions.length - 4} more`}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

const TOPIC_SECTIONS = [
  { id: 'all', label: 'All' },
  ...TOPICS.map(t => ({ id: t.id, label: t.label })),
]

export default function StoriesPanel({ onClose }) {
  const { posts, loading, loaded, errors, fetchStories } = useStories()
  const [topicFilter, setTopicFilter] = useState('all')

  useEffect(() => {
    if (!loaded) fetchStories()
  }, [])

  const filtered = topicFilter === 'all'
    ? posts
    : posts.filter(p => p.topics.includes(topicFilter))

  const loves     = filtered.filter(p => p.sentiment === 'positive')
  const struggles = filtered.filter(p => p.sentiment === 'negative')
  const talking   = filtered.filter(p => p.sentiment === 'neutral')

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[#0f172a] overflow-hidden">

      {/* Header */}
      <div className="flex items-start justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-[#818cf8]" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#818cf8]">City Pulse</span>
          </div>
          <h2 className="text-white text-lg font-bold leading-tight">Stories from Wolfsburg</h2>
          <p className="text-xs text-white/30 mt-0.5">Real voices from Reddit &amp; news — what residents say about living here</p>
        </div>
        <button onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors text-xl leading-none mt-0.5"
        >×</button>
      </div>

      {/* Topic filter */}
      {loaded && posts.length > 0 && (
        <div className="flex gap-1.5 px-6 py-3 border-b border-white/5 overflow-x-auto flex-shrink-0">
          {TOPIC_SECTIONS.map(t => {
            const count = t.id === 'all' ? posts.length : posts.filter(p => p.topics.includes(t.id)).length
            if (count === 0 && t.id !== 'all') return null
            const topic = TOPICS.find(tp => tp.id === t.id)
            const active = topicFilter === t.id
            return (
              <button key={t.id} onClick={() => setTopicFilter(t.id)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider transition-colors whitespace-nowrap ${
                  active ? 'text-white' : 'text-white/30 hover:text-white/60'
                }`}
                style={active && topic ? { backgroundColor: topic.color + '33', color: topic.color } :
                       active ? { backgroundColor: 'rgba(255,255,255,0.15)' } : {}}
              >
                {t.label} {count > 0 && <span className="opacity-60">({count})</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">

        {loading && (
          <div className="flex items-center justify-center h-48 text-white/30 text-sm gap-2">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Gathering stories…
          </div>
        )}

        {!loading && errors.length > 0 && errors.map((e, i) => (
          <p key={i} className="text-xs text-rose-400/60 mb-2">{e}</p>
        ))}

        {!loading && loaded && filtered.length === 0 && (
          <p className="text-white/25 text-sm text-center mt-20">No stories found for this topic.</p>
        )}

        {!loading && loaded && filtered.length > 0 && (
          <>
            <Section
              emoji="❤️"
              heading="What people love about Wolfsburg"
              subheading="Things residents appreciate, recommend, or feel good about"
              posts={loves}
            />
            <Section
              emoji="😤"
              heading="What people struggle with"
              subheading="Frustrations, complaints, and problems residents face"
              posts={struggles}
            />
            <Section
              emoji="💬"
              heading="What people talk about"
              subheading="Discussions, questions, and observations about city life"
              posts={talking}
            />
          </>
        )}
      </div>
    </div>
  )
}
