import WelkomClient from "./WelkomClient";

export default function Welkom() {
  return (
    <>
      <h1>Welkom bij de redactie</h1>
      <WelkomClient />
      <noscript><p className="melding fout">Voor deze link is JavaScript nodig. Zet dat aan in uw browser en open de link opnieuw.</p></noscript>
    </>
  );
}
