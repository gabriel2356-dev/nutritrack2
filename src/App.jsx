import { useEffect, useRef, useState } from "react"
import { supabase } from "./lib/supabase"
import { Html5Qrcode } from "html5-qrcode"

export default function App() {
  const [seite, setSeite] = useState("vorrat") // "vorrat" | "profil"
  const [vorrat, setVorrat] = useState([])
  const [name, setName] = useState("")
  const [menge, setMenge] = useState("")
  const [einheit, setEinheit] = useState("g")
  const [ablaufdatum, setAblaufdatum] = useState("")

  const [kalorien100g, setKalorien100g] = useState("")
  const [protein100g, setProtein100g] = useState("")
  const [kohlenhydrate100g, setKohlenhydrate100g] = useState("")
  const [zucker100g, setZucker100g] = useState("")
  const [fett100g, setFett100g] = useState("")
  const [gesaettigteFettsaeuren100g, setGesaettigteFettsaeuren100g] = useState("")
  const [ballaststoffe100g, setBallaststoffe100g] = useState("")
  const [salz100g, setSalz100g] = useState("")

  const [fehler, setFehler] = useState(null)
  const [info, setInfo] = useState("")
  const [scanOffen, setScanOffen] = useState(false)
  const [scanFehler, setScanFehler] = useState("")
  const [scanInfo, setScanInfo] = useState("")
  const scannerRef = useRef(null)
  const scannerIdRef = useRef(null)

  const [profilId, setProfilId] = useState(null)
  const [profilLoading, setProfilLoading] = useState(true)
  const [profilSaving, setProfilSaving] = useState(false)
  const [profil, setProfil] = useState({
    name: "",
    gewicht: "",
    groesse: "",
    alter: "",
    ziel: "Muskelaufbau",
    trainingstage: "3",
    dislikes: "",
    tdee_kcal: null,
    ziel_protein_g: null,
  })

  useEffect(() => {
    laden()
    ladeProfil()
  }, [])

  useEffect(() => {
    if (!scanOffen) return

    let cancelled = false

    async function start() {
      setScanFehler("")
      setScanInfo("Kamera wird gestartet…")

      const readerId = "barcode-reader"
      scannerIdRef.current = readerId
      const scanner = new Html5Qrcode(readerId)
      scannerRef.current = scanner

      try {
        // Standardmäßig Rückkamera verwenden (Mobile)
        // (facingMode: "environment" statt "user")
        let cameraConfig = { facingMode: "environment" }

        // Falls Browser/Device facingMode nicht unterstützt,
        // versuchen wir als Fallback eine passende Kamera-ID zu wählen.
        try {
          const devices = await Html5Qrcode.getCameras()
          if (devices && devices.length > 0) {
            const back = devices.find((d) => /back|rear|environment/i.test(d.label))
            if (back?.id) cameraConfig = { deviceId: { exact: back.id } }
          }
        } catch {}

        await scanner.start(
          cameraConfig,
          { fps: 10, qrbox: { width: 260, height: 160 }, aspectRatio: 1.777 },
          async (decodedText) => {
            if (cancelled) return
            setScanInfo(`Barcode erkannt: ${decodedText}`)
            await onBarcodeFound(decodedText)
          },
          () => {},
        )

        setScanInfo("Barcode vor die Kamera halten…")
      } catch (e) {
        setScanFehler(`Scanner-Fehler: ${e?.message || String(e)}`)
        setScanInfo("")
      }
    }

    start()

    return () => {
      cancelled = true
    }
  }, [scanOffen])

  async function laden() {
    setFehler(null)
    const { data, error } = await supabase
      .from("vorrat")
      .select("*")
      .order("ablaufdatum", { ascending: true })
    if (error) setFehler(error.message)
    else setVorrat(data || [])
  }

  async function ladeProfil() {
    setProfilLoading(true)
    setFehler(null)
    try {
      // Ohne Auth nehmen wir das erste Profil (Single-User-Setup)
      const { data, error } = await supabase
        .from("users_profile")
        .select("*")
        .limit(1)
        .maybeSingle()

      if (error) {
        setFehler("Profil konnte nicht geladen werden: " + error.message)
        setProfilLoading(false)
        return
      }

      if (!data) {
        setProfilId(null)
        setProfilLoading(false)
        return
      }

      setProfilId(data.id ?? null)
      setProfil((p) => ({
        ...p,
        name: data.name ?? "",
        gewicht: data.gewicht_kg ?? "",
        groesse: data.groesse_cm ?? "",
        alter: data.alter_jahre ?? "",
        ziel: data.ziel ?? "Muskelaufbau",
        trainingstage: data.trainingstage ?? "3",
        dislikes: Array.isArray(data.ausschluss_zutaten)
          ? data.ausschluss_zutaten.join(", ")
          : JSON.parse(data.ausschluss_zutaten || "[]").join(", "),
        tdee_kcal: data.tdee_kcal ?? null,
        ziel_protein_g: data.ziel_protein_g ?? null,
      }))
      setProfilLoading(false)
    } catch (e) {
      setFehler("Profil konnte nicht geladen werden: " + (e?.message || String(e)))
      setProfilLoading(false)
    }
  }

  async function stopScanner() {
    const scanner = scannerRef.current
    scannerRef.current = null
    if (!scanner) return
    try {
      await scanner.stop()
    } catch {}
    try {
      await scanner.clear()
    } catch {}
  }

  function fillNumber(setter, value) {
    if (value === undefined || value === null || value === "") return
    const n = toNumber(value)
    if (n === null) return
    setter(String(n))
  }

  function parseQuantityToMengeEinheit(quantity) {
    // Beispiele OFF: "450 g", "0.5 L", "330ml", "6x250ml"
    const q = String(quantity || "").trim()
    if (!q) return null

    // 6x250ml -> wir nehmen hier 250ml als "Menge" (einfacher)
    const multi = q.match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\b/i)
    const simple = q.match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\b/i)
    const m = multi || simple
    if (!m) return null

    const value = toNumber(m[2] ?? m[1])
    const unitRaw = (m[3] ?? m[2] ?? "").toLowerCase()
    if (value === null) return null

    if (unitRaw === "kg") return { menge: String(value * 1000), einheit: "g" }
    if (unitRaw === "l") return { menge: String(value * 1000), einheit: "ml" }
    if (unitRaw === "g") return { menge: String(value), einheit: "g" }
    if (unitRaw === "ml") return { menge: String(value), einheit: "ml" }
    return null
  }

  async function onBarcodeFound(barcode) {
    // Mehrfach-Scans vermeiden
    await stopScanner()

    try {
      setScanInfo("Produktdaten werden geladen…")
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`)
      const json = await res.json()

      if (!json || json.status !== 1) {
        setScanFehler("Produkt nicht gefunden (Open Food Facts).")
        setScanInfo("")
        return
      }

      const p = json.product || {}
      const n = p.nutriments || {}

      if (p.product_name) setName(p.product_name)

      // Menge/Einheit, falls vorhanden (fix für "Hinzufügen passiert nichts", wenn Menge leer bleibt)
      const q = p.quantity || (p.product_quantity && p.product_quantity_unit ? `${p.product_quantity} ${p.product_quantity_unit}` : "")
      const parsed = parseQuantityToMengeEinheit(q)
      if (parsed?.menge) setMenge(parsed.menge)
      if (parsed?.einheit) setEinheit(parsed.einheit)

      // kcal/100g: bevorzugt energy-kcal_100g, sonst kcal aus kJ umrechnen
      const kcal = n["energy-kcal_100g"] ?? n["energy-kcal_value"] ?? n["energy-kcal"]
      const kj = n["energy_100g"] ?? n["energy_value"] ?? n["energy"]
      if (kcal !== undefined) fillNumber(setKalorien100g, kcal)
      else if (kj !== undefined) {
        const kjN = toNumber(kj)
        if (kjN !== null) setKalorien100g(String(Math.round(kjN / 4.184)))
      }

      fillNumber(setProtein100g, n.proteins_100g)
      fillNumber(setKohlenhydrate100g, n.carbohydrates_100g)
      fillNumber(setZucker100g, n.sugars_100g)
      fillNumber(setFett100g, n.fat_100g)
      fillNumber(setGesaettigteFettsaeuren100g, n["saturated-fat_100g"])
      fillNumber(setBallaststoffe100g, n.fiber_100g)
      // OFF hat meist "salt_100g" in g
      fillNumber(setSalz100g, n.salt_100g)

      setScanInfo("Felder wurden befüllt.")
      setScanOffen(false)
    } catch (e) {
      setScanFehler(`API-Fehler: ${e?.message || String(e)}`)
      setScanInfo("")
    }
  }

  async function hinzufuegen() {
    setFehler(null)
    setInfo("")
    const n = String(name || "").trim()
    const m = toNumber(menge)
    if (!n) {
      setFehler("Bitte gib einen Namen ein.")
      return
    }
    if (m === null || m <= 0) {
      setFehler("Bitte gib eine gültige Menge ein (z.B. 450).")
      return
    }
    const payload = {
      name: n,
      menge: m,
      einheit,
      ablaufdatum,
      kalorien_100g: toNumber(kalorien100g),
      protein_100g: toNumber(protein100g),
      kohlenhydrate_100g: toNumber(kohlenhydrate100g),
      zucker_100g: toNumber(zucker100g),
      fett_100g: toNumber(fett100g),
      gesaettigte_fettsaeuren_100g: toNumber(gesaettigteFettsaeuren100g),
      ballaststoffe_100g: toNumber(ballaststoffe100g),
      salz_100g: toNumber(salz100g),
      gegessen_am: null,
    }

    const { error } = await supabase.from("vorrat").insert([payload])
    if (error) setFehler("Fehler: " + error.message)
    else {
      setName("")
      setMenge("")
      setAblaufdatum("")
      setKalorien100g("")
      setProtein100g("")
      setKohlenhydrate100g("")
      setZucker100g("")
      setFett100g("")
      setGesaettigteFettsaeuren100g("")
      setBallaststoffe100g("")
      setSalz100g("")
      setInfo("Gespeichert.")
      laden()
    }
  }

  async function loeschen(id) {
    setFehler(null)
    await supabase.from("vorrat").delete().eq("id", id)
    laden()
  }

  function todayIso() {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  }

  async function markiereHeuteGegessen(item) {
    setFehler(null)
    setInfo("")
    const iso = todayIso()
    const { error } = await supabase
      .from("vorrat")
      .update({ gegessen_am: iso })
      .eq("id", item.id)

    if (error) {
      setFehler("Fehler beim Markieren: " + error.message)
      return
    }
    setInfo("Für heute eingetragen.")
    laden()
  }

  function istBaldAbgelaufen(datum) {
    if (!datum) return false
    const ziel = new Date(`${datum}T00:00:00`)
    const jetzt = new Date()
    const startHeute = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate())
    const diffTage = (ziel - startHeute) / (1000 * 60 * 60 * 24)
    return diffTage < 3
  }

  function toNumber(x) {
    const n = typeof x === "number" ? x : Number(String(x ?? "").replace(",", "."))
    return Number.isFinite(n) ? n : null
  }

  function pickNumber(obj, keys) {
    for (const k of keys) {
      const v = toNumber(obj?.[k])
      if (v !== null) return v
    }
    return null
  }

  function berechneGesamtwert({ pro100, menge }) {
    if (pro100 === null || menge === null) return null
    return Math.round((pro100 / 100) * menge)
  }

  function naehrwerteGesamt(item) {
    const m = toNumber(item.menge)
    if (m === null) return {}
    if (item.einheit !== "g" && item.einheit !== "ml") return {}

    const kcal100 = pickNumber(item, ["kalorien_100g", "kcal_100g", "kcal_pro_100g", "calories_100g"])
    const protein100 = pickNumber(item, ["protein_100g", "eiweiss_100g", "eiweiß_100g"])
    const carbs100 = pickNumber(item, ["kohlenhydrate_100g", "kh_100g", "carbs_100g"])
    const fett100 = pickNumber(item, ["fett_100g", "fat_100g"])

    const kcal = berechneGesamtwert({ pro100: kcal100, menge: m })
    const protein = berechneGesamtwert({ pro100: protein100, menge: m })
    const carbs = berechneGesamtwert({ pro100: carbs100, menge: m })
    const fett = berechneGesamtwert({ pro100: fett100, menge: m })

    return { kcal, protein, carbs, fett }
  }

  function naehrwerteZeile(item) {
    const m = toNumber(item.menge)
    if (m === null) return []
    if (item.einheit !== "g" && item.einheit !== "ml") return []

    // Unterstützt mehrere mögliche Spaltennamen (Deutsch/Englisch)
    const kcal100 = pickNumber(item, ["kalorien_100g", "kcal_100g", "kcal_pro_100g", "calories_100g"])
    const protein100 = pickNumber(item, ["protein_100g", "eiweiss_100g", "eiweiß_100g"])
    const carbs100 = pickNumber(item, ["kohlenhydrate_100g", "kh_100g", "carbs_100g"])
    const zucker100 = pickNumber(item, ["zucker_100g", "sugar_100g"])
    const fett100 = pickNumber(item, ["fett_100g", "fat_100g"])
    const gesFett100 = pickNumber(item, ["gesaettigte_fettsaeuren_100g", "gesättigte_fettsäuren_100g", "sat_fat_100g", "saturated_fat_100g"])
    const ballast100 = pickNumber(item, ["ballaststoffe_100g", "fiber_100g", "fibre_100g"])
    const salz100 = pickNumber(item, ["salz_100g", "salt_100g"])

    const parts = []

    // Kompakt (wie gewünscht): kcal, Protein, KH, Fett
    const kcal = berechneGesamtwert({ pro100: kcal100, menge: m })
    if (kcal !== null) parts.push(`${kcal} kcal`)

    const protein = berechneGesamtwert({ pro100: protein100, menge: m })
    if (protein !== null) parts.push(`${protein}g Protein`)

    const carbs = berechneGesamtwert({ pro100: carbs100, menge: m })
    if (carbs !== null) parts.push(`${carbs}g KH`)

    const fett = berechneGesamtwert({ pro100: fett100, menge: m })
    if (fett !== null) parts.push(`${fett}g Fett`)

    // Optional: weitere Nährwerte, falls vorhanden
    const zucker = berechneGesamtwert({ pro100: zucker100, menge: m })
    if (zucker !== null) parts.push(`${zucker}g Zucker`)

    const gesFett = berechneGesamtwert({ pro100: gesFett100, menge: m })
    if (gesFett !== null) parts.push(`${gesFett}g ges. Fettsäuren`)

    const ballast = berechneGesamtwert({ pro100: ballast100, menge: m })
    if (ballast !== null) parts.push(`${ballast}g Ballaststoffe`)

    const salz = berechneGesamtwert({ pro100: salz100, menge: m })
    if (salz !== null) parts.push(`${salz}g Salz`)

    return parts
  }

  function clamp01(x) {
    if (!Number.isFinite(x)) return 0
    return Math.max(0, Math.min(1, x))
  }

  function Progress({ label, value, goal, unit }) {
    const safeGoal = Number.isFinite(goal) && goal > 0 ? goal : null
    const pct = safeGoal ? clamp01(value / goal) : 0
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
          <strong>{label}</strong>
          {safeGoal ? (
            <span>{Math.round(value)} / {Math.round(goal)} {unit}</span>
          ) : (
            <span>{Math.round(value)} {unit}</span>
          )}
        </div>
        <div style={{ height: 10, background: "#eee", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.round(pct * 100)}%`, background: "#22c55e" }} />
        </div>
      </div>
    )
  }

  function berechneTDEE(p) {
    // Mifflin-St-Jeor (ohne Geschlecht-Feld in den Anforderungen)
    // Wir verwenden hier eine neutrale Variante ohne +5/-161.
    const w = toNumber(p.gewicht)
    const h = toNumber(p.groesse)
    const a = toNumber(p.alter)
    const t = toNumber(p.trainingstage)
    if (w === null || h === null || a === null || t === null) return null

    const bmr = 10 * w + 6.25 * h - 5 * a
    const days = Math.max(1, Math.min(7, Math.round(t)))
    const factorByDays = {
      1: 1.375,
      2: 1.45,
      3: 1.55,
      4: 1.6,
      5: 1.7,
      6: 1.725,
      7: 1.725,
    }
    const factor = factorByDays[days] || 1.55
    return Math.round(bmr * factor)
  }

  function proteinZielGramm(p) {
    const w = toNumber(p.gewicht)
    if (w === null) return null
    const z = String(p.ziel || "")
    const mult =
      z === "Fettabbau" ? 1.8 :
      z === "Muskelerhalt" ? 1.6 :
      2.0 // Muskelaufbau
    return Math.round(w * mult)
  }

  function parseAusschlussZutaten(text) {
    return JSON.stringify(
      String(text || "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    )
  }

  async function speichereProfil() {
    setFehler(null)
    setInfo("")
    setProfilSaving(true)

    try {
      const computedTdee = berechneTDEE(profil)
      const computedProtein = proteinZielGramm(profil)

      const payload = {
        name: String(profil.name || "").trim() || null,
        gewicht_kg: toNumber(profil.gewicht),
        groesse_cm: toNumber(profil.groesse),
        alter_jahre: toNumber(profil.alter),
        ziel: profil.ziel,
        trainingstage: toNumber(profil.trainingstage),
        ausschluss_zutaten: parseAusschlussZutaten(profil.dislikes),
        tdee_kcal: computedTdee,
        ziel_protein_g: computedProtein,
      }

      // Wir versuchen zuerst "update", falls wir eine id haben.
      if (profilId !== null && profilId !== undefined) {
        const { error } = await supabase
          .from("users_profile")
          .update(payload)
          .eq("id", profilId)

        if (error) {
          setFehler("Profil konnte nicht gespeichert werden: " + error.message)
          setProfilSaving(false)
          return
        }
      } else {
        const { data, error } = await supabase
          .from("users_profile")
          .insert([payload])
          .select("*")
          .limit(1)
          .maybeSingle()

        if (error) {
          setFehler("Profil konnte nicht gespeichert werden: " + error.message)
          setProfilSaving(false)
          return
        }
        setProfilId(data?.id ?? null)
      }

      setProfil((p) => ({
        ...p,
        tdee_kcal: computedTdee,
        ziel_protein_g: computedProtein,
      }))
      setInfo("Profil gespeichert.")
      setProfilSaving(false)
    } catch (e) {
      setFehler("Profil konnte nicht gespeichert werden: " + (e?.message || String(e)))
      setProfilSaving(false)
    }
  }

  const heute = todayIso()
  const gegessenHeute = vorrat.filter((x) => String(x.gegessen_am || "") === heute)
  const totalsHeute = gegessenHeute.reduce(
    (acc, item) => {
      const t = naehrwerteGesamt(item)
      if (t.kcal !== null && t.kcal !== undefined) acc.kcal += t.kcal
      if (t.protein !== null && t.protein !== undefined) acc.protein += t.protein
      if (t.carbs !== null && t.carbs !== undefined) acc.carbs += t.carbs
      if (t.fett !== null && t.fett !== undefined) acc.fett += t.fett
      return acc
    },
    { kcal: 0, protein: 0, carbs: 0, fett: 0 },
  )

  const computedTdee = berechneTDEE(profil)
  const computedProteinGoal = proteinZielGramm(profil)
  const tdee = toNumber(profil.tdee_kcal) ?? computedTdee
  const proteinGoal = toNumber(profil.ziel_protein_g) ?? computedProteinGoal

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", padding: "0 20px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <h1 style={{ margin: 0 }}>NutriTrack</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setSeite("vorrat")} style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", background: seite === "vorrat" ? "#111827" : "white", color: seite === "vorrat" ? "white" : "black", cursor: "pointer" }}>
            Vorrat
          </button>
          <button onClick={() => setSeite("profil")} style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", background: seite === "profil" ? "#111827" : "white", color: seite === "profil" ? "white" : "black", cursor: "pointer" }}>
            Profil
          </button>
        </div>
      </div>

      {/* Tagesübersicht */}
      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginBottom: 16, background: "#fafafa" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <strong>Tagesübersicht (heute)</strong>
          <span style={{ fontSize: 12, color: "#666" }}>{heute}</span>
        </div>
        <Progress label="Kalorien" value={totalsHeute.kcal} goal={tdee ?? 2800} unit="kcal" />
        <Progress label="Protein" value={totalsHeute.protein} goal={proteinGoal ?? 180} unit="g" />
        <Progress label="Kohlenhydrate" value={totalsHeute.carbs} goal={null} unit="g" />
        <Progress label="Fett" value={totalsHeute.fett} goal={null} unit="g" />
        <div style={{ fontSize: 12, color: "#666" }}>
          Berechnung basiert auf Einträgen, die du als „heute gegessen“ markierst.
        </div>
      </div>

      {fehler && <div style={{ background: "#ffe5e5", padding: 12, borderRadius: 8, marginBottom: 12, color: "red" }}>Fehler: {fehler}</div>}
      {info && <div style={{ background: "#eaffea", padding: 12, borderRadius: 8, marginBottom: 12, color: "#14532d" }}>{info}</div>}

      {seite === "vorrat" ? (
        <>
          <h2 style={{ margin: "10px 0" }}>Vorrat</h2>

          <div style={{ marginBottom: 18, display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => setScanOffen(true)} style={{ padding: 10, borderRadius: 6, background: "#2563eb", color: "white", border: "none", cursor: "pointer", fontWeight: "bold" }}>
              Barcode scannen
            </button>
            <input placeholder="Name (z.B. Hähnchen)" value={name} onChange={e => setName(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />
            <input placeholder="Menge (z.B. 500)" value={menge} onChange={e => setMenge(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />
            <select value={einheit} onChange={e => setEinheit(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }}>
              <option value="g">g</option>
              <option value="ml">ml</option>
              <option value="stk">stk</option>
            </select>
            <input type="date" value={ablaufdatum} onChange={e => setAblaufdatum(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input placeholder="Kalorien / 100g (kcal)" value={kalorien100g} onChange={e => setKalorien100g(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />
              <input placeholder="Protein / 100g (g)" value={protein100g} onChange={e => setProtein100g(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />
              <input placeholder="Kohlenhydrate / 100g (g)" value={kohlenhydrate100g} onChange={e => setKohlenhydrate100g(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />
              <input placeholder="Zucker / 100g (g)" value={zucker100g} onChange={e => setZucker100g(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />
              <input placeholder="Fett / 100g (g)" value={fett100g} onChange={e => setFett100g(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />
              <input placeholder="Ges. Fettsäuren / 100g (g)" value={gesaettigteFettsaeuren100g} onChange={e => setGesaettigteFettsaeuren100g(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />
              <input placeholder="Ballaststoffe / 100g (g)" value={ballaststoffe100g} onChange={e => setBallaststoffe100g(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />
              <input placeholder="Salz / 100g (g)" value={salz100g} onChange={e => setSalz100g(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />
            </div>

            <button onClick={hinzufuegen} style={{ padding: 10, borderRadius: 6, background: "#22c55e", color: "white", border: "none", cursor: "pointer", fontWeight: "bold" }}>
              Hinzufügen
            </button>
          </div>

          {vorrat.length === 0 && !fehler && <p style={{ color: "#aaa" }}>Noch keine Lebensmittel im Vorrat.</p>}
          {vorrat.map(item => (
            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, padding: "10px 14px", marginBottom: 8, borderRadius: 8, border: "1px solid #ddd", background: istBaldAbgelaufen(item.ablaufdatum) ? "#ffe5e5" : "#f9f9f9" }}>
              <div style={{ flex: 1 }}>
                <strong>{item.name}</strong> — {item.menge} {item.einheit}
                {item.ablaufdatum && <span style={{ marginLeft: 8, fontSize: 12, color: "#888" }}>läuft ab: {item.ablaufdatum}</span>}
                {(() => {
                  const parts = naehrwerteZeile(item)
                  if (parts.length === 0) return null
                  return (
                    <div style={{ marginTop: 4, fontSize: 13, color: "#333" }}>
                      {parts.join(" · ")}
                    </div>
                  )
                })()}
                {String(item.gegessen_am || "") === heute ? (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#14532d" }}>
                    Heute gegessen
                  </div>
                ) : null}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                <button onClick={() => markiereHeuteGegessen(item)} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 12 }}>
                  Heute gegessen
                </button>
                <button onClick={() => loeschen(item.id)} style={{ color: "red", border: "none", background: "none", cursor: "pointer", fontSize: 16 }}>
                  Löschen
                </button>
              </div>
            </div>
          ))}
        </>
      ) : (
        <>
          <h2 style={{ margin: "10px 0" }}>Profil</h2>
          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, background: "#fafafa" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {profilLoading ? (
                <div style={{ fontSize: 13, color: "#666" }}>Profil wird geladen…</div>
              ) : null}
              <input placeholder="Name" value={profil.name} onChange={(e) => setProfil((p) => ({ ...p, name: e.target.value }))} style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />
              <input placeholder="Gewicht (kg)" value={profil.gewicht} onChange={(e) => setProfil((p) => ({ ...p, gewicht: e.target.value }))} style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />
              <input placeholder="Größe (cm)" value={profil.groesse} onChange={(e) => setProfil((p) => ({ ...p, groesse: e.target.value }))} style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />
              <input placeholder="Alter" value={profil.alter} onChange={(e) => setProfil((p) => ({ ...p, alter: e.target.value }))} style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }} />

              <select value={profil.ziel} onChange={(e) => setProfil((p) => ({ ...p, ziel: e.target.value }))} style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }}>
                <option>Muskelaufbau</option>
                <option>Fettabbau</option>
                <option>Muskelerhalt</option>
              </select>

              <select value={profil.trainingstage} onChange={(e) => setProfil((p) => ({ ...p, trainingstage: e.target.value }))} style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd" }}>
                {Array.from({ length: 7 }, (_, i) => String(i + 1)).map((v) => (
                  <option key={v} value={v}>{v} Trainingstage pro Woche</option>
                ))}
              </select>

              <textarea
                placeholder="Lebensmittel die ich nicht mag"
                value={profil.dislikes}
                onChange={(e) => setProfil((p) => ({ ...p, dislikes: e.target.value }))}
                rows={3}
                style={{ padding: 8, borderRadius: 6, border: "1px solid #ddd", resize: "vertical" }}
              />

              <button
                onClick={speichereProfil}
                disabled={profilSaving}
                style={{ padding: 10, borderRadius: 6, background: "#111827", color: "white", border: "none", cursor: "pointer", fontWeight: "bold" }}
              >
                {profilSaving ? "Speichern…" : "Profil speichern"}
              </button>

              <div style={{ marginTop: 6, fontSize: 13 }}>
                <strong>TDEE (geschätzt): </strong>
                {tdee ? `${tdee} kcal/Tag` : "Bitte Gewicht, Größe, Alter und Trainingstage ausfüllen."}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
                Wird beim Speichern automatisch berechnet und im Profil abgelegt.
              </div>
            </div>
          </div>
        </>
      )}

      {scanOffen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ width: "min(520px, 100%)", background: "white", borderRadius: 12, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <strong>Barcode scannen</strong>
              <button
                onClick={async () => {
                  await stopScanner()
                  setScanOffen(false)
                }}
                style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16 }}
              >
                Schließen
              </button>
            </div>

            <div id="barcode-reader" style={{ width: "100%", borderRadius: 10, overflow: "hidden" }} />

            {scanInfo ? <div style={{ marginTop: 10, fontSize: 13, color: "#333" }}>{scanInfo}</div> : null}
            {scanFehler ? <div style={{ marginTop: 10, fontSize: 13, color: "red" }}>{scanFehler}</div> : null}
            <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
              Tipp: Nutze HTTPS oder localhost, sonst blockiert der Browser die Kamera.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}