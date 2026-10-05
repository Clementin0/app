# Neon Dash

Runner sparatutto **3D** in stile synthwave per Android. Il mondo 3D è disegnato con **Three.js**, l'interfaccia con **Phaser 3**; il gioco è confezionato con **Capacitor 8** e monetizzato con **Google AdMob** (`@capacitor-community/admob`).
Modelli 3D, texture, effetti sonori e colonna sonora sono generati proceduralmente (geometrie Three.js, Canvas 2D e Web Audio): il gioco non dipende da alcun file di asset esterno.

| Menu | Gioco | Boss |
| --- | --- | --- |
| ![Menu](docs/screenshots/menu.png) | ![Gioco](docs/screenshots/gameplay.png) | ![Boss](docs/screenshots/boss.png) |
| **Negozio** | **Game Over** | **Impostazioni** |
| ![Negozio](docs/screenshots/shop.png) | ![Game over](docs/screenshots/game-over.png) | ![Impostazioni](docs/screenshots/settings.png) |

## Scelte di progetto

| Parametro | Valore |
| --- | --- |
| Genere | Runner 3D a 3 corsie con combattimento |
| Meccanica | Il personaggio corre da solo; cambi corsia, salti e scivoli per evitare gli ostacoli e spari ai nemici; ogni zona finisce con un boss |
| Orientamento | **Landscape** (bloccato in `AndroidManifest.xml` con `sensorLandscape`) |
| Nome app | Neon Dash |
| App ID | `com.clementin0.neondash` (modificabile in `capacitor.config.json`) |
| Lingue | Italiano e inglese (in base al dispositivo, modificabile nelle impostazioni) |

## Gameplay

**Comandi**

| Gesto | Azione |
| --- | --- |
| Swipe ← / → | cambia corsia |
| Swipe ↑ | salta (si atterra anche sopra le piattaforme) |
| Swipe ↓ | scivola sotto le travi (in aria: picchiata) |
| Tocco | spara un colpo |
| Tieni premuto | fuoco automatico (puoi cambiare corsia mentre spari) |

Un solo dito può concatenare direzioni diverse (es. sinistra e poi su). Nel browser: frecce o WASD, SPAZIO per sparare, P o ESC per la pausa.

**Nemici e ostacoli**

- **Robot** che camminano verso di te, **casse** da distruggere, **droni** che si fermano davanti a te, sparano plasma e cambiano corsia. I colpi di plasma si possono abbattere.
- Ostacoli: barriere da saltare, travi laser da passare scivolando, muri che bloccano la corsia e piattaforme su cui correre.
- Ogni nemico abbattuto dà punti e lascia cadere monete. Le uccisioni ravvicinate creano una **combo** (fino a ×8).
- **Boss**: dopo 700 m di ogni zona arriva un'astronave madre con barra della vita. Spara raffiche che lasciano una corsia libera, oppure colpi mirati. Se lo abbatti prendi +40 monete, +3 gemme e un grosso bonus. Se resisti 45 secondi se ne va.
- **4 zone** a tema con colori, musica e scenario diversi: Città Neon, Deserto al tramonto, Griglia di ghiaccio, Inferno. La difficoltà sale a ogni zona.
- Hai **3 cuori** (5 con i potenziamenti). Nemici e plasma tolgono un cuore; schiantarsi contro un ostacolo è fatale.
- Power-up: **scudo**, **magnete**, **fuoco rapido**, **punti doppi**, **cuore extra**.

**Personalizzazione e progressione**

- **Negozio** con anteprima 3D del personaggio. Tocchi un oggetto per provarlo, poi lo compri o lo equipaggi. Cinque schede:
  - **Skin**: 8 colori.
  - **Cappelli**: 7 cappelli più "nessuno".
  - **Armi**: blaster, doppietta, ventaglio a 3 colpi e laser perforante, ognuna con un modo diverso di sparare.
  - **Scie**: 6 scie di particelle.
  - **Potenziamenti**: danno, cadenza di fuoco, durata del magnete, cuori extra, scudo iniziale.
- Si paga in monete; gli oggetti rari costano gemme. Un video con ricompensa dà **+50 monete** ogni 3 minuti.
- **Missioni**: 3 obiettivi attivi alla volta (abbattere droni o boss, combo, distanza, monete...). Danno monete o gemme e, una volta completati, vengono sostituiti da missioni più difficili.
- **Punteggio** = distanza + monete e gemme + bonus di uccisioni e boss. High score, distanza migliore, monete, gemme, oggetti, potenziamenti, missioni, statistiche e impostazioni sono salvati in **LocalStorage**.

**Interfaccia e sistema**

- Gameloop completo:
  - **Menu**, con una corsa demo 3D giocata dall'IA e il pannello delle missioni;
  - **Gioco**, con HUD per punti, cuori, monete, avanzamento della zona, power-up, combo, barra del boss e pausa;
  - **Pausa**: riprendi con conto alla rovescia, ricomincia, menu, impostazioni;
  - **Game Over**: riepilogo con uccisioni e zona raggiunta, missioni completate, **Continua**, **Rigioca**, **Menu**.
- **Impostazioni**: musica, effetti sonori, vibrazione, lingua, **qualità grafica** (bassa, media, alta: risoluzione, antialiasing, densità dello scenario, particelle) e, se richiesto dal GDPR, consenso privacy.
- **Audio** sintetizzato in tempo reale: ogni zona ha la sua progressione di accordi e la musica si intensifica durante il boss. **Vibrazione** (Capacitor Haptics) su colpi, danni, boss e acquisti.
- Tasto indietro di Android: chiude le impostazioni, mette in pausa / riprende, torna al menu, esce dall'app. Il gioco va in pausa da solo quando l'app passa in background.

## Monetizzazione (AdMob)

Tutti gli ID sono in un unico file: [`src/config/admob.config.js`](src/config/admob.config.js). In sviluppo si usano gli **ID di test ufficiali di Google**:

| Formato | Dove | Ad Unit ID di test |
| --- | --- | --- |
| App ID | `AndroidManifest.xml` (scritto dallo script) | `ca-app-pub-3940256099942544~3347511713` |
| Banner adattivo | in basso nel **Menu** (e nel Negozio) e nel **Game Over**; nascosto durante il gioco | `ca-app-pub-3940256099942544/9214589741` |
| Interstitial | ogni **3 partite completate** | `ca-app-pub-3940256099942544/1033173712` |
| Rewarded | **Continua** nel Game Over (un revive per partita) e **+50 monete** nel Negozio (ogni 3 minuti) | `ca-app-pub-3940256099942544/5224354917` |

Dettagli di implementazione ([`src/services/AdService.js`](src/services/AdService.js)):

- **Consenso GDPR (UMP)**: prima di inizializzare l'SDK viene raccolto il consenso. Il modulo privacy resta raggiungibile dalle impostazioni.
- **Interstitial**: una partita conta come "completata" quando il giocatore lascia il Game Over (Rigioca o Menu), così l'annuncio non interrompe mai l'offerta di Continua. Se alla terza partita l'annuncio non è ancora caricato, viene mostrato alla partita successiva.
- **Rewarded**: su Android `showRewardVideoAd()` si risolve solo quando la ricompensa viene ottenuta. Per questo il servizio usa gli eventi `Rewarded` e `Dismissed` (con un breve margine per una ricompensa che arriva in ritardo) e un timeout di sicurezza. La ricompensa viene concessa solo se il video è stato visto davvero. Il revive rimuove ostacoli, nemici e colpi vicini, ripristina tutti i cuori, dà 3 s di invulnerabilità e fa partire un conto alla rovescia.
- Il layout di Menu, Negozio, Impostazioni e Game Over lascia libero lo spazio del banner, usando l'altezza reale comunicata dall'evento `bannerAdSizeChanged`.
- Durante gli annunci a schermo intero musica ed effetti vanno in pausa. Ogni errore dell'SDK viene intercettato e non blocca mai il gioco.
- Nel browser (`npm run dev`) un **mock** ([`MockAdMob.js`](src/services/MockAdMob.js)) simula banner, interstitial e video con ricompensa, così si può provare l'intero flusso senza dispositivo.

## Struttura

```
src/
  config/admob.config.js    ID AdMob (test/produzione) e regole di frequenza
  config/game3d.config.js   corsie, fisica, velocità, armi, nemici, boss, punteggi, power-up
  config/zones.js           temi delle 4 zone (colori, scenario, musica)
  config/cosmetics.js       catalogo del negozio: skin, cappelli, armi, scie
  config/upgrades.js        potenziamenti e loadout della partita
  i18n.js                   testi in italiano e inglese
  logic3d/                  simulazione pura (testabile in Node, senza Phaser né Three.js)
    LaneWorld.js            corsie, salto/scivolata, spari, nemici, boss, zone, danni, pickup, revive
    LaneSpawner.js          pattern di ostacoli, nemici e monete
    Autopilot3D.js          IA per la demo del menu e i test
    Missions.js             missioni con ricompense e livelli crescenti
  logic/ScoreManager.js     punteggio della partita
  three/                    rendering 3D: Stage (renderer e qualità), Environment (strada, città, cielo),
                            models (ostacoli, nemici, boss, pickup), Character, Particles,
                            GameView (partita e demo), PreviewView (anteprima del negozio)
  services/                 AdService, MockAdMob, SaveData (LocalStorage), Sfx e Music (Web Audio),
                            Haptics, Platform (tasto indietro, background)
  scenes/                   Boot, Menu, Shop, Game, Pause, GameOver, Settings (interfaccia Phaser)
  ui/                       texture procedurali dell'interfaccia, bottoni, interruttori, HUD
tests/                      test unitari Vitest
scripts/
  verify-runtime.mjs        test end-to-end nel browser headless
  configure-android.mjs     patch idempotenti del progetto Android
  generate-android-assets.mjs  icone, splash e grafiche per il Play Store
  check-release.mjs         blocca una release con ID di test o versione sbagliata
android/                    progetto nativo generato da `npx cap add android`
store/                      icona 512×512 e feature graphic 1024×500 per il Play Store
```

## Comandi

```bash
npm install            # dipendenze
npm run dev            # gioco nel browser con hot reload (annunci simulati)
npm test               # 77 test unitari (mondo 3D, armi, boss, missioni, salvataggi, negozio, lingue, annunci)
npm run build          # bundle web di produzione in dist/
npm run verify         # gioca la build in Chromium headless e verifica tutto il flusso
npm run cap:sync       # build + npx cap sync android + configurazione Android
npm run cap:open       # apre il progetto in Android Studio
npm run release:check  # controlla che la release non usi gli ID AdMob di test
```

`npm run verify` emula un telefono in landscape con touch e gioca davvero, con swipe e tocchi. Controlla 40 punti, tra cui:
- avvio dei due renderer (Three.js e Phaser) e demo 3D nel menu;
- banner nel menu, nascosto in gioco;
- cambio corsia, salto e scivolata con gli swipe; sparo con tocco e fuoco automatico; uccisione di un nemico;
- arrivo del boss, sua sconfitta con ricompensa e passaggio alla zona 2;
- pausa e ripresa;
- high score, missioni e statistiche in LocalStorage;
- revive con video, una sola seconda possibilità per partita, interstitial alla terza partita completata;
- impostazioni: vibrazione, qualità grafica, lingua;
- negozio: anteprima 3D, acquisto di skin e potenziamento, +50 monete con video, skin e danno applicati in partita;
- musica attiva e assenza di errori in console.

Gli screenshot finiscono in `verify-output/`.

## Build Android

Requisiti: Node 22+, JDK 21, Android SDK con platform 36 (Android Studio).

```bash
npm run cap:sync
cd android && ./gradlew assembleDebug     # APK in android/app/build/outputs/apk/debug/
```

`versionName` e `versionCode` vengono dal campo `version` di `package.json` (2.0.0 → versionCode 20000).

La GitHub Action [`.github/workflows/android.yml`](.github/workflows/android.yml) ha tre job:

| Job | Quando | Cosa fa |
| --- | --- | --- |
| `web` | a ogni push | test, build e verifica runtime |
| `android` | a ogni push | `cap sync` + `assembleDebug`, pubblica l'APK di debug come artifact |
| `release` | push di un tag `v*` | AAB firmato per il Play Store |

## Pubblicazione sul Play Store

1. Nella console AdMob crea l'app e i tre blocchi di annunci, poi incolla gli ID in `PRODUCTION_IDS` e imposta `USE_TEST_ADS = false` in `src/config/admob.config.js`. Finché gli ID sono segnaposto, il gioco continua a usare quelli di test, e `npm run android:configure` e `npm run release:check` si rifiutano di procedere.
2. Configura il messaggio GDPR in AdMob (Privacy e messaggi) e pubblica `app-ads.txt` sul sito dello sviluppatore.
3. Crea la chiave di firma: `keytool -genkey -v -keystore android/neondash-release.jks -alias neondash -keyalg RSA -keysize 2048 -validity 10000`. Poi copia `android/keystore.properties.example` in `android/keystore.properties` (ignorato da git) e inserisci le password.
4. Genera il bundle: `npm run cap:sync && cd android && ./gradlew bundleRelease`. In alternativa, aggiungi su GitHub i secret `ANDROID_KEYSTORE_BASE64` (il `.jks` in base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` e `ANDROID_KEY_PASSWORD`, aggiorna `version` in `package.json` e fai push del tag `v<versione>`: il job `release` produce l'AAB firmato.
5. Nella Play Console dichiara che l'app contiene annunci, compila la sezione *Sicurezza dei dati* (l'SDK AdMob raccoglie l'Advertising ID) e indica l'URL della privacy policy. Le grafiche sono pronte in `store/`; per rigenerare icone e splash usa `node scripts/generate-android-assets.mjs`.

## Note tecniche

- Due canvas sovrapposti: sotto il `WebGLRenderer` di Three.js (`#stage`), sopra il canvas trasparente di Phaser (`#game`) con interfaccia e input. Il rendering 3D avviene a ogni passo del gameloop di Phaser, così i due livelli restano sincronizzati.
- La logica di gioco (`src/logic3d`) non dipende né da Phaser né da Three.js: le viste ne leggono lo stato e reagiscono a una coda di eventi (colpi, uccisioni, boss...). Per questo fisica, collisioni, armi, boss, missioni e revive sono coperti da test deterministici in Node. Un'IA gioca 3 minuti di partita su 12 seed diversi, attraversando zone e battendo boss, per verificare che i pattern siano sempre superabili.
- Prestazioni su mobile:
  - materiali e geometrie condivisi, mesh riutilizzate in pool, edifici in `InstancedMesh`;
  - circa 80 draw call per frame;
  - risoluzione e antialiasing regolabili con la qualità grafica.
- Risoluzione base dell'interfaccia 1280×720 con `Phaser.Scale.EXPAND`: si adatta a qualsiasi rapporto d'aspetto (18:9, 20:9, tablet) senza bande nere.
- Schermo intero immersivo (barre di sistema nascoste, riapplicato dopo gli annunci) in `MainActivity.java`. Sfondo scuro su splash e finestra, per evitare il flash bianco all'avvio.
- Le scene Phaser vengono riutilizzate tra una visita e l'altra: lo stato di ogni scena viene azzerato in `init()` e i listener vengono rimossi allo `shutdown`.
- I salvataggi delle versioni 1.x (record, monete, skin, impostazioni) vengono migrati automaticamente.
