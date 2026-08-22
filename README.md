# Trad'Art Private Community — Site d'admission (Version 1 seul fichier)

« Les Graphiques, c'est un Art. »

## Sa ki nouvo nan vèsyon sa a

- **Yon sèl fichye `index.html`** — tout kat "paj" yo (Présentation, Admission, Paiement,
  Confirmation) se yon sèl sit kounye a. Lè ou peze yon bouton, li chanje vue a san
  rechajman paj — pa gen `application.html`, `payment.html`, `success.html` ankò.
- **Bileng Français / Kreyòl** — bouton "Kreyòl" / "Français" anlè paj la tradui tout tèks
  la an dirèk, san rechajman.
- **Tèm Sombre / Clair** — bouton anlè paj la switch ant de tèm yo.
- **Nouvo pri** — Plan Monthly $75/mwa, Plan Lifetime $250.
- Pa gen animasyon (fade-in, ticker, scroll-reveal) — sit la statik e imedya, jan yo te
  mande a.

## Kijan sa fonksyone

Tout kat "vues" yo (`view-presentation`, `view-admission`, `view-payment`,
`view-confirmation`) se seksyon ki deja nan menm fichye HTML la. JavaScript la kache/montre
youn a lafwa lè ou peze yon bouton — pa gen rechajman navigatè.

Endikatè pwogresyon an (01-04) anlè paj la mache tou kòm navigasyon: yon etap ou fin
konplete vin klikab pou ou ka retounen.

## Deplwaye sou GitHub Pages

Menm demach senp la:

1. Kreye yon depo GitHub (piblik pou Pages gratis).
2. Mete `index.html` a rasin depo a.
3. Settings → Pages → branch `main`, dosye `/ (root)`.
4. Lyen an ap gen fòm `https://<non-itilizatè>.github.io/<depo>/`.

Paske tout bagay (CSS, JS, logo) anbake nan yon sèl fichye, deplwaman an pi senp toujou —
pa gen lòt fichye pou telechaje.

## Modifye pri yo

Chèche `data-plan="monthly"` ak `data-plan="lifetime"` nan fichye a. Chak gen yon
`data-amount="75"` (oswa `"250"`) ki itilize pou rezime a, ansanm ak tèks `$75` /
`$250` ki afiche — chanje toulède pou yo matche.

## Ajoute/modifye tradiksyon

Chak eleman tèks gen de atribi: `data-fr="..."` ak `data-ht="..."`. Script la li youn
oswa lòt selon lang ki aktif la. Pou chanje yon tradiksyon, chanje valè `data-ht="..."` a
(oswa `data-fr="..."`) — pa bezwen touche rès kòd la.

## Kontak ak lyen WhatsApp

Menm kote yo te ye a — chèche `wa.me/50935245951` (CEO), `wa.me/50936343860` (Sekretè),
ak `Tradart509@gmail.com`.

## Konekte fòm lan ak yon backend (Google Sheets)

Menm apwòch la toujou aplikab: fòm lan ranmase done yo nan `TradArtState` (an memwa pou
kounye a — li reyinisyalize si moun nan rafrechi paj la). Pou anvwaye done yo vre nan yon
Google Sheet, ajoute yon apèl `fetch(...)` nan fonksyon `initPaymentPage()` la (kote li
fè `TradArtState.set({...})` anvan `goToView('view-confirmation')`), ki voye
`TradArtState.get()` bay yon URL Google Apps Script deplwaye kòm Web App — menm jan ak
enstriksyon nan vèsyon anvan an.

**Enpòtan** : pa janm mete kle API oswa idantifyan sekrè dirèkteman nan fichye HTML sa a
piske li piblik yon fwa li sou GitHub Pages.
