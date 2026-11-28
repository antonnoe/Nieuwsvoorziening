# Inbedden op Nederlanders.fr (NING)

De pagina `https://nieuws.infofrankrijk.com/inbed` is bedoeld voor een iframe. Tabs: `?tab=nieuws` (standaard), `?tab=overheid`, `?tab=nlfr`.
De pagina stuurt zijn hoogte met `postMessage({type:"nv-hoogte", hoogte})`; het script hieronder zet de hoogte van de iframe en accepteert alleen berichten van https://nieuws.infofrankrijk.com. Zonder script blijft de vaste hoogte van 640px staan.

Plak dit in het codevak van de pagina (een regel per element):

```html
<iframe id="nv-inbed" src="https://nieuws.infofrankrijk.com/inbed" title="Nieuws uit Frankrijk" width="100%" height="640" style="border:0;width:100%;" loading="lazy"></iframe>
<script>
window.addEventListener("message", function (e) {
  if (e.origin !== "https://nieuws.infofrankrijk.com") return;
  if (!e.data || e.data.type !== "nv-hoogte") return;
  var h = Number(e.data.hoogte);
  if (!(h > 100 && h < 5000)) return;
  document.getElementById("nv-inbed").style.height = Math.ceil(h) + "px";
});
</script>
```

Aandachtspunten
- Alleen de volgende sites mogen de pagina in een iframe tonen (Content-Security-Policy `frame-ancestors`): www.nederlanders.fr, nederlanders.fr, *.ning.com, infofrankrijk.com, *.infofrankrijk.com en infopoche.fr. Elke andere site krijgt een leeg vak.
- Het tabblad "NL'ers in FR" leest tijdelijk uit nlfr-menu (`/api/actueel`, tegels infofrankrijk en verenigingen) tot die bronnen naar deze motor zijn verhuisd.
- Links openen in een nieuw tabblad; de tabs blijven binnen de iframe.

## Zijbalk (vervangt nlfr-menu /sidebar-nieuws)

`https://nieuws.infofrankrijk.com/inbed/zijbalk` is ontworpen voor precies 173 px breed (160 tot 200 px werkt ook, geen horizontale scroll): kleine kop met "Bijgewerkt <tijd>" eronder, standaard de 10 nieuwste berichten (beeld 16:9 bovenaan, kop, datum · categorie, chip "PEIL: <titel>" of "€ raakt uw portemonnee"), direct daarna "Lees meer nieuws →", daaronder compact "Wat verandert er voor u" (standaard 4 aankondigingen met datum en titel, "Reken het uit met <tool>", "Alles in PEIL →").

Instelbaar in de URL: `?aantal=` (berichten, 1 tot 20, standaard 10), `?peil=` (aankondigingen, 0 tot 8, standaard 4; 0 laat het blok weg), `?kanaal=infofrankrijk` (kanaal voor Infofrankrijk). Voorbeeld: `/inbed/zijbalk?aantal=6&peil=2`. Bij minder berichten past de starthoogte hieronder ook (een te ruime hoogte geeft alleen witruimte onderaan, geen scrollbalk).

De pagina zelf scrolt nooit (`html` en `body` hebben `overflow: hidden`, ook geen verticale scrollbalk). De pagina stuurt zijn hoogte als `{type:"nv-hoogte", hoogte}` en ook als `{nlfrNieuwsHeight: hoogte}`: gemeten aan de body (niet aan `scrollHeight` van het document, want die is nooit kleiner dan de iframe zelf, waardoor de iframe niet kon krimpen), opnieuw na het laden van elk beeld (ook lazy) en bij elke wijziging van de body. Het script accepteert alleen origin https://nieuws.infofrankrijk.com.

Waarom de scrollbalk er eerst was: de oude plakcode gaf 1100 px als starthoogte, en de inhoud van 4 berichten plus PEIL paste daar in; bij de nieuwe lengte (10 berichten) was dat te weinig en toonde de iframe een eigen scrollbalk (breed, op NING). Hypothese: het hoogte-script draait op NING niet, of de berichten komen niet aan (het codevak laat scripts soms niet door). Daarom staat de iframe nu ook zonder script goed: een ruime vaste hoogte van 3100 px (gemeten 28-11-2026 op 173 px met 10 berichten met lange koppen en 4 aankondigingen: 2783 px, plus 10% marge, afgerond) en `scrolling="no"`. Met script krimpt of groeit de iframe naar de echte hoogte; zonder script staat er onderaan hooguit wat witruimte. Controle op NING: staat er toch een scrollbalk, dan komt het script niet aan en is de hoogte te laag; verhoog dan de `height`.

Nederlanders.fr, rechterkolom (kanaal zijbalk), een regel per element:

```html
<iframe id="nlfr-nieuws" src="https://nieuws.infofrankrijk.com/inbed/zijbalk" title="Nieuws over Frankrijk" width="173" height="3100" scrolling="no" style="border:0;width:173px;overflow:hidden;" loading="lazy"></iframe>
<script>
window.addEventListener("message", function (e) {
  if (e.origin !== "https://nieuws.infofrankrijk.com") return;
  var d = e.data || {};
  var h = Number(d.type === "nv-hoogte" ? d.hoogte : d.nlfrNieuwsHeight);
  if (!(h > 100 && h < 5000)) return;
  document.getElementById("nlfr-nieuws").style.height = Math.ceil(h) + "px";
});
</script>
```

Infofrankrijk (kanaal infofrankrijk):

```html
<iframe id="nlfr-nieuws" src="https://nieuws.infofrankrijk.com/inbed/zijbalk?kanaal=infofrankrijk" title="Nieuws over Frankrijk" width="173" height="3100" scrolling="no" style="border:0;width:173px;overflow:hidden;" loading="lazy"></iframe>
<script>
window.addEventListener("message", function (e) {
  if (e.origin !== "https://nieuws.infofrankrijk.com") return;
  var d = e.data || {};
  var h = Number(d.type === "nv-hoogte" ? d.hoogte : d.nlfrNieuwsHeight);
  if (!(h > 100 && h < 5000)) return;
  document.getElementById("nlfr-nieuws").style.height = Math.ceil(h) + "px";
});
</script>
```

Dezelfde frame-ancestors als `/inbed`.
