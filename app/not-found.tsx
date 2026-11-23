import Kop from "./_componenten/Kop";

export default function NietGevonden() {
  return (
    <>
      <Kop klein />
      <main id="inhoud" className="wrap">
        <div className="leeg" role="status">
          <p>Deze pagina bestaat niet. <a href="/">Terug naar het laatste nieuws</a>.</p>
        </div>
      </main>
    </>
  );
}
