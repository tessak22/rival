export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p className="site-footer__line">
        Rival is an open-source competitive intelligence dashboard ·{" "}
        <a
          href="https://github.com/tessak22/rival"
          className="site-footer__link"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>{" "}
        · Powered by{" "}
        <a href="https://tabstack.ai" className="site-footer__link" target="_blank" rel="noopener noreferrer">
          Tabstack
        </a>
      </p>
    </footer>
  );
}
