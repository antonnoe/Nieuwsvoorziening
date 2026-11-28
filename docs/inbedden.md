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

`https://nieuws.infofrankrijk.com/inbed/zijbalk` is ontworpen voor precies 173 px breed (160 tot 200 px werkt ook, geen horizontale scroll): kleine kop met "Bijgewerkt <tijd>" eronder, de 4 nieuwste berichten (beeld 16:9 bovenaan, kop, datum · categorie, chip "PEIL: <titel>" of "€ raakt uw portemonnee"), direct daarna "Lees meer nieuws →", daaronder compact "Wat verandert er voor u" (2 aankondigingen met datum en titel, "Reken het uit met <tool>", "Alles in PEIL →"). De pagina stuurt de hoogte als `{type:"nv-hoogte", hoogte}` en ook als `{nlfrNieuwsHeight: hoogte}`; het script accepteert alleen origin https://nieuws.infofrankrijk.com.

Nederlanders.fr, rechterkolom (kanaal zijbalk), met `style="width:173px"`:

```html
<iframe id="nlfr-nieuws" src="https://nieuws.infofrankrijk.com/inbed/zijbalk" title="Nieuws over Frankrijk" width="173" height="1100" style="border:0;width:173px;" loading="lazy"></iframe>
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

Overige plekken (zelfde 173 px, kanaal zijbalk):

```html
<iframe id="nlfr-nieuws" src="https://nieuws.infofrankrijk.com/inbed/zijbalk" title="Nieuws over Frankrijk" width="173" height="1100" style="border:0;" loading="lazy"></iframe>
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

Infofrankrijk (kanaal infofrankrijk, via `?kanaal=infofrankrijk`):

```html
<iframe id="nlfr-nieuws" src="https://nieuws.infofrankrijk.com/inbed/zijbalk?kanaal=infofrankrijk" title="Nieuws over Frankrijk" width="173" height="1100" style="border:0;" loading="lazy"></iframe>
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

Zonder script blijft de vaste hoogte van 640px staan.

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

`https://nieuws.infofrankrijk.com/inbed/zijbalk` is een smalle pagina (ontworpen voor 300 tot 360 px): bovenaan "Wat verandert er voor u" (de eerstvolgende 3 aankondigingen uit PEIL), daaronder de 6 nieuwste berichten met een chip "PEIL: <titel>" of "€ raakt uw portemonnee". De pagina stuurt de hoogte als `{type:"nv-hoogte", hoogte}` en ook als `{nlfrNieuwsHeight: hoogte}`; het script accepteert alleen origin https://nieuws.infofrankrijk.com.

Nederlanders.fr (kanaal zijbalk):

```html
<iframe id="nlfr-nieuws" src="https://nieuws.infofrankrijk.com/inbed/zijbalk" title="Nieuws over Frankrijk" width="100%" height="900" style="border:0;width:100%;" loading="lazy"></iframe>
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

Infofrankrijk (kanaal infofrankrijk, via `?kanaal=infofrankrijk`):

```html
<iframe id="nlfr-nieuws" src="https://nieuws.infofrankrijk.com/inbed/zijbalk?kanaal=infofrankrijk" title="Nieuws over Frankrijk" width="100%" height="900" style="border:0;width:100%;" loading="lazy"></iframe>
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

Zonder script blijft de vaste hoogte van 1100px staan. Dezelfde frame-ancestors als `/inbed`.
