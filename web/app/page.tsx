import ConnectWizard from "@/components/ConnectWizard";

export default function Home() {
  return (
    <div className="wrap">
      <header className="top">
        <a className="brand" href="/">
          WeTrakr <em>Relay</em>
        </a>
        <nav>
          <a href="#connect">Connect</a>
          <a href="#faq">FAQ</a>
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">Unofficial · mirrors Trakt → WeTrakr</p>
        <h1>
          Your watch history, delivered <span className="to-wetrakr">to WeTrakr</span>.
        </h1>
        <p className="lede">
          Relay watches your public Trakt profile and mirrors every finished
          movie and episode to your WeTrakr account — including a live
          &ldquo;now playing&rdquo; status if you want it. Nothing to install,
          and it doesn&rsquo;t use up a Trakt connection slot.
        </p>
        <div className="cta-row">
          <a className="btn primary" href="#connect">
            Connect your accounts
          </a>
        </div>

        <div className="relay" aria-hidden="true">
          <div className="relay-track">
            <span className="node trakt">TRAKT</span>
            <div className="beam">
              <span className="pulse" />
              <span className="pulse" />
              <span className="pulse" />
            </div>
            <span className="node wetrakr">WETRAKR</span>
          </div>
          <div className="relay-events">
            <span className="chip">
              scrobble · <b>Dune: Part Two (2024)</b> · 100%
            </span>
            <span className="chip">
              playing · <b>Severance S02E07</b> · 63%
            </span>
            <span className="chip">
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
            Relay never sees your Trakt or WeTrakr password. It stores exactly
            one thing: the WeTrakr scrobble token you approve on
            wetrakr.com — the same device pairing the official Kodi add-on
            uses. Delete it anytime from your manage page.
          </p>
        </div>
        <div className="fact">
          <h3>No Trakt slot used</h3>
          <p>
            Free Trakt accounts only get one community app connection. Relay
            reads your public profile instead of connecting via OAuth, so that
            slot stays free for your player app.
          </p>
        </div>
        <div className="fact">
          <h3>Every player, one place</h3>
          <p>
            Plex, Nuvio, Fusion and anything else that scrobbles to Trakt all
            land in one public history — and Relay mirrors that history into
            WeTrakr, even for players that can&rsquo;t talk to WeTrakr directly.
          </p>
        </div>
      </section>

      <section className="faq" id="faq">
        <h2>Questions you should ask</h2>
        <details>
          <summary>Why does my Trakt profile have to be public?</summary>
          <p>
            Relay deliberately avoids Trakt OAuth so it never holds a Trakt
            token for you and never occupies your one free connection slot.
            The trade-off: it can only read what Trakt exposes publicly.
          </p>
        </details>
        <details>
          <summary>What exactly gets stored?</summary>
          <p>
            Your Trakt username (public anyway), your WeTrakr scrobble token,
            and sync bookkeeping (last synced timestamp, recent history IDs).
            No email, no password, no analytics. Deleting your connection
            removes all of it.
          </p>
        </details>
        <details>
          <summary>Is this official?</summary>
          <p>
            No. WeTrakr&rsquo;s public API is still in development; Relay
            speaks the same endpoints as the official WeTrakr Kodi add-on,
            which are open source but unofficial. If WeTrakr changes them,
            Relay may break until it&rsquo;s updated. Trakt is accessed only
            through its documented public API.
          </p>
        </details>
        <details>
          <summary>How fast do watches show up?</summary>
          <p>
            History syncs every five minutes. The optional live status polls
            once a minute while something is playing. Original watch
            timestamps can&rsquo;t be preserved — the scrobble endpoint
            doesn&rsquo;t accept them — so use WeTrakr&rsquo;s own Trakt
            import for your back catalog and let Relay handle everything new.
          </p>
        </details>
      </section>

      <footer>
        <span>
          Not affiliated with Trakt or WeTrakr. Built by the community, for
          the community.
        </span>
      </footer>
    </div>
  );
}
