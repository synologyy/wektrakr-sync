import ConnectWizard from "@/components/ConnectWizard";

const TMDB = "https://media.themoviedb.org/t/p/w440_and_h660_face";

type Poster = { h: string; border: string; bg: string };
type Col = { mt: number; anim: string; posters: Poster[] };

const POSTER_COLS: Col[] = [
  {
    mt: 0,
    anim: "floaty 13s ease-in-out infinite",
    posters: [
      { h: "5udDsOLWcXDt3hUTD7FpJLGDBmW", border: "rgba(255,255,255,.1)", bg: "linear-gradient(160deg,#1a1d2a,#12151f)" },
      { h: "5QrwqFLCYVCI5emBzJkm2VhAfPR", border: "rgba(255,223,0,.14)", bg: "linear-gradient(160deg,#221f14,#12151f)" },
    ],
  },
  {
    mt: 60,
    anim: "floaty 11s ease-in-out infinite 1.2s",
    posters: [
      { h: "mJiLDE6gu1u6ZPgLR22vmkP64u2", border: "rgba(237,34,36,.16)", bg: "linear-gradient(160deg,#241417,#12151f)" },
      { h: "iBRQNmchPH8z90LZaK0U3eJL886", border: "rgba(255,255,255,.1)", bg: "linear-gradient(160deg,#171a26,#12151f)" },
    ],
  },
  {
    mt: 24,
    anim: "floaty 14s ease-in-out infinite .6s",
    posters: [
      { h: "x1QRMN8Mgci1Z121zFp3PwcEIwW", border: "rgba(255,223,0,.12)", bg: "linear-gradient(160deg,#201d12,#12151f)" },
      { h: "8aaV365bjSxPMZdT18RybAYGqSp", border: "rgba(255,255,255,.08)", bg: "linear-gradient(160deg,#191c28,#12151f)" },
    ],
  },
  {
    mt: 76,
    anim: "floaty 12s ease-in-out infinite 2s",
    posters: [
      { h: "pAxeLxVzeCTqJhvYPPdNDhMsHcI", border: "rgba(255,255,255,.1)", bg: "linear-gradient(160deg,#12151f,#1c1f2c)" },
      { h: "geDHSnQYosn79jmuhzXBfX8Db6a", border: "rgba(237,34,36,.12)", bg: "linear-gradient(160deg,#211318,#12151f)" },
    ],
  },
  {
    mt: 40,
    anim: "floaty 15s ease-in-out infinite 1.6s",
    posters: [
      { h: "x1QRMN8Mgci1Z121zFp3PwcEIwW", border: "rgba(255,223,0,.14)", bg: "linear-gradient(160deg,#1f1c11,#12151f)" },
      { h: "5udDsOLWcXDt3hUTD7FpJLGDBmW", border: "rgba(255,255,255,.09)", bg: "linear-gradient(160deg,#161925,#12151f)" },
    ],
  },
  {
    mt: 12,
    anim: "floaty 13s ease-in-out infinite .3s",
    posters: [
      { h: "geDHSnQYosn79jmuhzXBfX8Db6a", border: "rgba(255,255,255,.1)", bg: "linear-gradient(160deg,#1a1d2a,#12151f)" },
      { h: "mJiLDE6gu1u6ZPgLR22vmkP64u2", border: "rgba(237,34,36,.14)", bg: "linear-gradient(160deg,#231419,#12151f)" },
    ],
  },
];

type Letter = { cls: "y" | "l"; ch: string; ml?: string; delay: string; shine?: string };

const LOGO: Letter[] = [
  { cls: "y", ch: "w", delay: "0s", shine: ".9s" },
  { cls: "y", ch: "e", ml: "-0.09em", delay: ".08s", shine: "1.05s" },
  { cls: "l", ch: "t", ml: "-0.02em", delay: ".16s" },
  { cls: "l", ch: "r", delay: ".24s" },
  { cls: "l", ch: "a", delay: ".32s" },
  { cls: "l", ch: "k", delay: ".40s" },
  { cls: "l", ch: "r", delay: ".48s" },
];

export default function Home() {
  return (
    <div className="wrap">
      <header className="top">
        <a className="brand" href="/">
          <span className="mark">
            <span className="we">we</span>
            <span className="tr">trakr</span>
          </span>
          <em>Relay</em>
        </a>
        <nav>
          <a href="#connect">Connect</a>
          <a href="#faq">FAQ</a>
        </nav>
      </header>

      <div className="posters" aria-hidden="true">
        <div className="posters-inner">
          {POSTER_COLS.map((col, i) => (
            <div
              className="posters-col"
              key={i}
              style={{ marginTop: col.mt, animation: col.anim }}
            >
              {col.posters.map((p, j) => (
                <div
                  className="poster"
                  key={j}
                  style={{ border: `1px solid ${p.border}`, background: p.bg }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${TMDB}/${p.h}.jpg`} alt="" loading="lazy" />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="posters-scrim" />
      </div>

      <section className="hero">
        <div className="glow" aria-hidden="true" />

        <div className="logo" aria-hidden="true">
          {LOGO.map((l, i) => (
            <span
              key={i}
              className={l.cls}
              style={{
                marginLeft: l.ml,
                animation: `letterIn .7s cubic-bezier(.2,1.4,.4,1) ${l.delay} both${
                  l.shine
                    ? `, weShine calc(4s / var(--lg-speed,1)) ease-in-out infinite ${l.shine}`
                    : ""
                }`,
              }}
            >
              {l.ch}
            </span>
          ))}
          <span
            className="beta"
            style={{ animation: "letterIn .7s cubic-bezier(.2,1.4,.4,1) .6s both" }}
          >
            Beta
          </span>
          <span className="logo-beam">
            <span className="dot" />
          </span>
        </div>

        <p className="eyebrow">Unofficial · mirrors Trakt → WeTrakr</p>

        <h1>
          Your watch history, delivered <span className="to">to WeTrakr</span>.
        </h1>

        <p className="lede">
          Relay watches your Trakt or Nuvio history and mirrors every finished
          movie and episode to WeTrakr — nothing to install, no Trakt connection
          slot used.
        </p>

        <div className="cta-row">
          <a className="cta" href="#connect">
            Connect your accounts
          </a>
        </div>

        <div className="relay" aria-hidden="true">
          <div className="relay-track">
            <span className="pill trakt">TRAKT · NUVIO</span>
            <div className="beam">
              <span className="t" />
              <span className="t" style={{ animationDelay: "1.4s", opacity: 0.75 }} />
              <span className="t" style={{ animationDelay: "2.8s", opacity: 0.5 }} />
            </div>
            <span className="pill wetrakr">WETRAKR</span>
          </div>
          <div className="relay-events">
            <span className="chip">
              scrobble · <b>Dune: Part Two (2024)</b> · 100%
            </span>
            <span className="chip" style={{ animationDelay: ".15s" }}>
              playing · <b>Severance S02E07</b> · 63%
            </span>
            <span className="chip" style={{ animationDelay: ".3s" }}>
              scrobble · <b>The Bear S03E01</b> · 100%
            </span>
          </div>
        </div>
      </section>

      <section id="connect">
        <ConnectWizard />
      </section>

      <section className="facts">
        <div className="fact">
          <h3>No passwords, one token</h3>
          <p>
            Relay stores exactly one thing: the WeTrakr scrobble token you
            approve — the same pairing the official Kodi add-on uses. Delete it
            anytime.
          </p>
        </div>
        <div className="fact">
          <h3>No Trakt slot used</h3>
          <p>
            Relay reads your public profile instead of OAuth, so your one free
            community-app slot stays free for your player app.
          </p>
        </div>
        <div className="fact">
          <h3>Every player, one place</h3>
          <p>
            Plex, Nuvio, Fusion and everything else that scrobbles to Trakt lands
            in one history — Relay mirrors it into WeTrakr.
          </p>
        </div>
      </section>

      <section className="faq" id="faq">
        <h2>Questions you should ask</h2>
        <details>
          <summary>Why does my Trakt profile have to be public?</summary>
          <p>
            Relay deliberately avoids Trakt OAuth so it never holds a Trakt token
            for you and never occupies your one free connection slot. The
            trade-off: it can only read what Trakt exposes publicly.
          </p>
        </details>
        <details>
          <summary>What exactly gets stored?</summary>
          <p>
            Your Trakt username (public anyway), your WeTrakr scrobble token, and
            sync bookkeeping. No email, no password, no analytics. Deleting your
            connection removes all of it.
          </p>
        </details>
        <details>
          <summary>Is this official?</summary>
          <p>
            No. Relay speaks the same endpoints as the official WeTrakr Kodi
            add-on, which are open source but unofficial. If WeTrakr changes them,
            Relay may break until it&rsquo;s updated.
          </p>
        </details>
        <details>
          <summary>How fast do watches show up?</summary>
          <p>
            History syncs every five minutes; the optional live status polls once
            a minute while something is playing. Use WeTrakr&rsquo;s own import
            for your back catalog.
          </p>
        </details>
      </section>

      <footer>
        <span>
          Not affiliated with Trakt or WeTrakr. Built by the community, for the
          community. Poster artwork powered by{" "}
          <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
            TMDB
          </a>
          .
        </span>
        <span className="foot-mark">
          <span className="ring" /> WeTrakr Relay
        </span>
      </footer>
    </div>
  );
}
