import './App.css'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

export default function App() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [menge, setMenge] = useState('')
  const [einheit, setEinheit] = useState('g')
  const [ablaufdatum, setAblaufdatum] = useState('')

  function tageBisAblauf(datum) {
    if (!datum) return null
    // Supabase "date" kommt typischerweise als "YYYY-MM-DD"
    const ziel = new Date(`${datum}T00:00:00`)
    const jetzt = new Date()
    const startHeute = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate())
    const diffMs = ziel.getTime() - startHeute.getTime()
    return Math.floor(diffMs / (1000 * 60 * 60 * 24))
  }

  async function ladeVorrat() {
    setError('')
    setLoading(true)

    const { data, error } = await supabase
      .from('vorrat')
      .select('*')
      .order('ablaufdatum', { ascending: true, nullsLast: true })

    if (error) {
      setItems([])
      setError(error.message)
      setLoading(false)
      return
    }

    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    ladeVorrat()
  }, [])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')

    const n = name.trim()
    if (!n) {
      setError('Bitte gib einen Namen ein.')
      return
    }

    const m =
      menge === '' ? null : Number.isFinite(Number(menge)) ? Number(menge) : NaN
    if (menge !== '' && Number.isNaN(m)) {
      setError('Die Menge muss eine Zahl sein.')
      return
    }

    const payload = {
      name: n,
      menge: m,
      einheit,
      ablaufdatum: ablaufdatum || null,
    }

    const { error } = await supabase.from('vorrat').insert(payload)
    if (error) {
      setError(error.message)
      return
    }

    setName('')
    setMenge('')
    setEinheit('g')
    setAblaufdatum('')
    await ladeVorrat()
  }

  async function loesche(id) {
    setError('')
    const { error } = await supabase.from('vorrat').delete().eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    setItems((prev) => prev.filter((x) => x.id !== id))
  }

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>NutriTrack</h1>
          <p className="sub">Dein Vorrat, nach Ablaufdatum sortiert.</p>
        </div>
        <button className="ghost" onClick={ladeVorrat} disabled={loading}>
          Aktualisieren
        </button>
      </header>

      <main className="grid">
        <section className="card">
          <div className="cardHead">
            <h2>Neues Lebensmittel</h2>
            <p className="muted">Name, Menge, Einheit und Ablaufdatum.</p>
          </div>

          <form className="form" onSubmit={onSubmit}>
            <label className="field">
              <span>Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Joghurt"
                autoComplete="off"
              />
            </label>

            <div className="row">
              <label className="field">
                <span>Menge</span>
                <input
                  value={menge}
                  onChange={(e) => setMenge(e.target.value)}
                  inputMode="decimal"
                  placeholder="z.B. 500"
                />
              </label>

              <label className="field">
                <span>Einheit</span>
                <select value={einheit} onChange={(e) => setEinheit(e.target.value)}>
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="stk">stk</option>
                </select>
              </label>
            </div>

            <label className="field">
              <span>Ablaufdatum</span>
              <input
                type="date"
                value={ablaufdatum}
                onChange={(e) => setAblaufdatum(e.target.value)}
              />
            </label>

            <button className="primary" type="submit" disabled={loading}>
              Hinzufügen
            </button>
          </form>

          {error ? <div className="error">{error}</div> : null}
        </section>

        <section className="card">
          <div className="cardHead">
            <h2>Vorrat</h2>
            <p className="muted">
              Rot markiert = läuft in weniger als 3 Tagen ab.
            </p>
          </div>

          {loading ? (
            <div className="empty">Lade…</div>
          ) : items.length === 0 ? (
            <div className="empty">Noch keine Einträge.</div>
          ) : (
            <ul className="list">
              {items.map((item) => {
                const d = tageBisAblauf(item.ablaufdatum)
                const baldRot = d !== null && d >= 0 && d < 3
                return (
                  <li
                    key={item.id}
                    className={['rowItem', baldRot ? 'danger' : ''].join(' ')}
                  >
                    <div className="left">
                      <div className="titleLine">
                        <span className="title">{item.name}</span>
                      </div>
                      <div className="meta">
                        <span>
                          {item.menge ?? '—'} {item.einheit ?? ''}
                        </span>
                        <span className="dot">•</span>
                        <span>Ablauf: {item.ablaufdatum ?? '—'}</span>
                      </div>
                    </div>

                    <button className="dangerBtn" onClick={() => loesche(item.id)}>
                      Löschen
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
