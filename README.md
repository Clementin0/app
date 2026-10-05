# Neon Dash

Endless runner 2D in stile synthwave per Android, scritto in **HTML5/JavaScript con Phaser 3**, confezionato con **Capacitor 8** e monetizzato con **Google AdMob** (`@capacitor-community/admob`).
Grafica, effetti sonori e colonna sonora sono generati proceduralmente (Canvas 2D e Web Audio): il gioco non dipende da alcun file di asset esterno.

| Menu | Gioco | Game Over |
| --- | --- | --- |
| ![Menu](docs/screenshots/menu.png) | ![Gioco](docs/screenshots/gameplay.png) | ![Game over](docs/screenshots/game-over.png) |
| **Negozio** | **Record in pista** | **Impostazioni** |
| ![Negozio](docs/screenshots/shop.png) | ![Record](docs/screenshots/record.png) | ![Impostazioni](docs/screenshots/settings.png) |

## Scelte di progetto

| Parametro | Valore |
| --- | --- |
| Genere | Endless Runner |
| Meccanica | Il personaggio corre da solo; si salta ostacoli (spine, blocchi, seghe, burroni) raccogliendo monete e gemme; la velocità aumenta col tempo |
| Orientamento | **Landscape** (bloccato in `AndroidManifest.xml` con `sensorLandscape`) |
| Nome app | Neon Dash |
| App ID | `com.clementin0.neondash` (modificabile in `capacitor.config.json`) |
| Lingue | Italiano e inglese (in base al dispositivo, modificabile nelle impostazioni) |

## Gameplay

- **Tocca** per saltare, **tieni premuto** per saltare più in alto, **tocca in aria** per il doppio salto (con coyote time e buffer dell'input per comandi reattivi).
- Ostacoli: spine, blocchi (puoi atterrarci sopra, ma colpirli di lato è fatale), seghe rotanti basse e alte (per quelle alte resta a terra) e burroni.
- I pattern si sbloccano livello dopo livello (uno ogni 15 s) e la velocità sale con una rampa esponenziale da 430 a 1050 px/s. La distanza tra gli ostacoli è calcolata sulla fisica del salto, quindi ogni sequenza è superabile: nei test un bot sopravvive 3 minuti su 8 seed diversi.
- Collezionabili: **monete** (+10), **gemme** (+50, raggiungibili col doppio salto), **scudo** (assorbe un colpo) e **magnete** (attira le monete per 8 s).
- **Punteggio** = metri percorsi + bonus di monete e gemme. In pista una bandiera verde **RECORD** segna la tua distanza migliore.
- **Negozio**: 8 skin per il personaggio, acquistabili con monete (da 150 a 1.200) o gemme (25 e 60). Un badge nel menu avvisa quando puoi permetterti una skin nuova. La skin scelta si vede in gioco e nella corsa demo del menu.
- **Impostazioni**: musica, effetti sonori, vibrazione, lingua e (se richiesto dal GDPR) modifica del consenso privacy. Si aprono dal menu e dalla pausa.
- **Audio**: colonna sonora synthwave generata in tempo reale (più tranquilla nei menu, con batteria in gioco, abbassata in pausa) ed effetti sintetizzati.
- **Vibrazione** (Capacitor Haptics) su morte, scudo, power-up e acquisti.
- Salvataggio in **LocalStorage**: high score, distanza migliore, monete e gemme, partite giocate, skin, impostazioni.
- Gameloop completo: Menu (con corsa demo giocata dall'IA) → Gioco (HUD con punti, record, monete, gemme, power-up e pausa) → Pausa (riprendi con conto alla rovescia, ricomincia, menu, impostazioni) → Game Over (riepilogo, **Continua**, **Rigioca**, **Menu**).
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
- **Rewarded**: su Android `showRewardVideoAd()` si risolve solo quando la ricompensa viene ottenuta. Per questo il servizio usa gli eventi `Rewarded` e `Dismissed` (con un breve margine per una ricompensa che arriva in ritardo) e un timeout di sicurezza. La ricompensa viene concessa solo se il video è stato visto davvero. Il revive rimuove gli ostacoli vicini, ripristina il terreno, dà 2,5 s di invulnerabilità e fa partire un conto alla rovescia.
- Il layout di Menu, Negozio, Impostazioni e Game Over lascia libero lo spazio del banner, usando l'altezza reale comunicata dall'evento `bannerAdSizeChanged`.
- Durante gli annunci a schermo intero musica ed effetti vanno in pausa. Ogni errore dell'SDK viene intercettato e non blocca mai il gioco.
- Nel browser (`npm run dev`) un **mock** ([`MockAdMob.js`](src/services/MockAdMob.js)) simula banner, interstitial e video con ricompensa, così si può provare l'intero flusso senza dispositivo.

## Struttura

```
src/
  config/admob.config.js    ID AdMob (test/produzione) e regole di frequenza
  config/game.config.js     fisica, velocità, punteggi, power-up
  config/skins.js           skin del negozio e monete gratuite
  i18n.js                   testi in italiano e inglese
  logic/                    simulazione pura (testabile in Node, senza Phaser)
    RunnerWorld.js          scorrimento, fisica, collisioni, pickup, revive
    Spawner.js              pattern di ostacoli e monete
    Difficulty.js           rampa di velocità, livelli, distanze sicure
    ScoreManager.js         punteggio della partita
    Autopilot.js            IA per la demo del menu e i test
  services/                 AdService, MockAdMob, SaveData (LocalStorage), Sfx e Music (Web Audio),
                            Haptics, Platform (tasto indietro, background)
  scenes/                   Boot, Menu, Shop, Game, Pause, GameOver, Settings
  ui/                       texture procedurali, bottoni, interruttori, HUD, sfondo parallax, renderer del mondo
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
npm test               # 77 test unitari (logica, punteggio, salvataggi, negozio, lingue, trigger degli annunci)
npm run build          # bundle web di produzione in dist/
npm run verify         # gioca la build in Chromium headless e verifica tutto il flusso
npm run cap:sync       # build + npx cap sync android + configurazione Android
npm run cap:open       # apre il progetto in Android Studio
npm run release:check  # controlla che la release non usi gli ID AdMob di test
```

`npm run verify` emula un telefono in landscape con touch e controlla 27 punti. Tra questi:
- avvio e banner nel menu, banner nascosto in gioco;
- salto, punteggio, pausa e ripresa;
- high score in LocalStorage;
- revive con video, una sola seconda possibilità per partita, interstitial alla terza partita completata;
- impostazioni e cambio lingua;
- acquisto di una skin e +50 monete con video;
- musica attiva in gioco e assenza di errori in console.

Gli screenshot finiscono in `verify-output/`.

## Build Android

Requisiti: Node 22+, JDK 21, Android SDK con platform 36 (Android Studio).

```bash
npm run cap:sync
cd android && ./gradlew assembleDebug     # APK in android/app/build/outputs/apk/debug/
```

`versionName` e `versionCode` vengono dal campo `version` di `package.json` (1.1.0 → versionCode 10100).

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

- Risoluzione base 1280×720 con `Phaser.Scale.EXPAND`: il canvas riempie qualsiasi rapporto d'aspetto (18:9, 20:9, tablet) senza bande nere e l'interfaccia si ancora ai bordi.
- Schermo intero immersivo (barre di sistema nascoste, riapplicato dopo gli annunci) in `MainActivity.java`. Sfondo scuro su splash e finestra, per evitare il flash bianco all'avvio.
- La logica di gioco (`src/logic`) non dipende da Phaser: le scene si limitano a disegnarne lo stato. Per questo fisica, collisioni, punteggio e revive sono coperti da test deterministici in Node.
- Le scene Phaser vengono riutilizzate tra una visita e l'altra: lo stato di ogni scena viene azzerato in `init()` e i listener vengono rimossi allo `shutdown`.
