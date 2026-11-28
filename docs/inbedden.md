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
