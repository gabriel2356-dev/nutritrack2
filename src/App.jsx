import { useEffect, useRef, useState } from "react"
import { supabase } from "./lib/supabase"
import { Html5Qrcode } from "html5-qrcode"

export default function App() {
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
  const [scanOffen, setScanOffen] = useState(false)
  const [scanFehler, setScanFehler] = useState("")
  const [scanInfo, setScanInfo] = useState("")
  const scannerRef = useRef(null)
  const scannerIdRef = useRef(null)

  useEffect(() => { laden() }, [])

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
    const { data, error } = await supabase
      .from("vorrat")
      .select("*")
      .order("ablaufdatum", { ascending: true })
    if (error) setFehler(error.message)
    else setVorrat(data || [])
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
    if (!name || !menge) return
    const payload = {
      name,
      menge,
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
    }

    const { error } = await supabase.from("vorrat").insert([payload])
    if (error) alert("Fehler: " + error.message)
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
      laden()
    }
  }

  async function loeschen(id) {
    await supabase.from("vorrat").delete().eq("id", id)
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

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", padding: "0 20px", fontFamily: "sans-serif" }}>
      <h1>NutriTrack — Vorrat</h1>
      {fehler && <div style={{ background: "#ffe5e5", padding: 12, borderRadius: 8, marginBottom: 16, color: "red" }}>Fehler: {fehler}</div>}
      <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 8 }}>
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

        <button onClick={hinzufuegen} style={{ padding: 10, borderRadius: 6, background: "#22c55e", color: "white", border: "none", cursor: "pointer", fontWeight: "bold" }}>Hinzufügen</button>
      </div>
      {vorrat.length === 0 && !fehler && <p style={{ color: "#aaa" }}>Noch keine Lebensmittel im Vorrat.</p>}
      {vorrat.map(item => (
        <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", marginBottom: 8, borderRadius: 8, border: "1px solid #ddd", background: istBaldAbgelaufen(item.ablaufdatum) ? "#ffe5e5" : "#f9f9f9" }}>
          <div>
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
          </div>
          <button onClick={() => loeschen(item.id)} style={{ color: "red", border: "none", background: "none", cursor: "pointer", fontSize: 16 }}>Löschen</button>
        </div>
      ))}

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