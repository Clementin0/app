# Neon Dash

Runner sparatutto **3D** in stile synthwave per Android. Il mondo 3D è disegnato con **Three.js**, l'interfaccia con **Phaser 3**; il gioco è confezionato con **Capacitor 8** e monetizzato con **Google AdMob** (`@capacitor-community/admob`).
Modelli 3D, texture, effetti sonori e colonna sonora sono generati proceduralmente (geometrie Three.js, Canvas 2D e Web Audio): il gioco non dipende da alcun file di asset esterno.

| Menu | Tutorial | Gioco |
| --- | --- | --- |
| ![Menu](docs/screenshots/menu.png) | ![Tutorial](docs/screenshots/tutorial.png) | ![Gioco](docs/screenshots/gameplay.png) |
| **Pedana turbo (Inferno)** | **Rampa sopra i muri (Ghiaccio)** | **Tempesta di sabbia (Deserto)** |
| ![Turbo](docs/screenshots/turbo.png) | ![Rampa](docs/screenshots/ramp.png) | ![Tempesta](docs/screenshots/storm.png) |
| **Gravità ridotta (Orbita)** | **Pioggia di meteoriti** | **Boss (Scorpione delle dune)** |
| ![Gravità ridotta](docs/screenshots/low-gravity.png) | ![Pioggia di meteoriti](docs/screenshots/meteors.png) | ![Boss](docs/screenshots/boss.png) |
| **Scelta del potenziamento** | **Otto modalità** | **Negozio** |
| ![Potenziamenti](docs/screenshots/perks.png) | ![Modalità](docs/screenshots/modes.png) | ![Negozio](docs/screenshots/shop.png) |
| **Ricompensa giornaliera** | **Game Over** | **Impostazioni** |
| ![Ricompensa giornaliera](docs/screenshots/daily.png) | ![Game over](docs/screenshots/game-over.png) | ![Impostazioni](docs/screenshots/settings.png) |
| **Campagna: 24 livelli** | **Livello superato con 3 stelle** | **Contro il tempo** |
| ![Campagna](docs/screenshots/campaign.jpg) | ![Livello superato](docs/screenshots/level-cleared.jpg) | ![Contro il tempo](docs/screenshots/time-attack.jpg) |
| **Boss: onda sismica (salta)** | **Boss: laser (scivola)** | **Boss: plasma pesante (cambia corsia)** |
| ![Onda sismica](docs/screenshots/boss-quake.jpg) | ![Laser](docs/screenshots/boss-laser.jpg) | ![Plasma pesante](docs/screenshots/boss-heavy.jpg) |
| **Boss con lo scudo** | **Boss infuriato** | **Overdrive** |
| ![Scudo del boss](docs/screenshots/boss-shield.jpg) | ![Boss infuriato](docs/screenshots/boss-enraged.jpg) | ![Overdrive](docs/screenshots/overdrive.jpg) |
| **Recinzione laser, cecchino e guardia** | **Ora di punta** | **Blackout (Inferno)** |
| ![Nuove minacce](docs/screenshots/threats.jpg) | ![Ora di punta](docs/screenshots/traffic.jpg) | ![Blackout](docs/screenshots/blackout.jpg) |
| **Assalto: ondate di nemici** | **Caos: la mutazione Specchio** | **Parkour: catena di trick** |
| ![Assalto](docs/screenshots/assault.jpg) | ![Caos](docs/screenshots/chaos.jpg) | ![Parkour](docs/screenshots/parkour.jpg) |
| **Qualità alta: strada a specchio e raggi di sole** | **Inferno: crepe di lava (con il warp)** | **Abisso: caustiche sul fondale** |
| ![Specchio e raggi](docs/screenshots/mirror-rays.jpg) | ![Crepe di lava](docs/screenshots/lava-road.jpg) | ![Caustiche](docs/screenshots/caustics.jpg) |
| **Warp verso il Deserto** | **Portale del record** | **Scie in overdrive** |
| ![Warp](docs/screenshots/warp.jpg) | ![Portale del record](docs/screenshots/record-gate.jpg) | ![Scie](docs/screenshots/afterimages.jpg) |

## Scelte di progetto

| Parametro | Valore |
| --- | --- |
| Genere | Runner 3D a 3 corsie con combattimento |
| Meccanica | Il personaggio corre da solo; cambi corsia, salti e scivoli per evitare gli ostacoli e spari ai nemici; ogni zona finisce con un boss |
| Orientamento | **Landscape** (bloccato in `AndroidManifest.xml` con `sensorLandscape`) |
| Nome app | Neon Dash |
| App ID | `com.clementin0.neondash` (modificabile in `capacitor.config.json`) |
| Lingue | Italiano e inglese (in base al dispositivo, modificabile nelle impostazioni) |

## Grafica

- **Post-processing** (qualità media e alta): bloom sui neon, color grading, aberrazione cromatica, vignettatura e scanline. Lo schermo pulsa di rosso quando vieni colpito, di magenta quando arriva un boss e di ciano col turbo.
- **Uno scenario per zona**, disegnato con l'instancing (pochi draw call anche con centinaia di oggetti):
  - Città Neon: grattacieli con finestre accese, luci sui tetti e insegne al neon;
  - Deserto: piramidi con la punta luminosa e dune;
  - Ghiaccio: cristalli sfaccettati e iceberg;
  - Inferno: vulcani con crateri di lava e rocce incandescenti;
  - Abisso: alghe con anelli bioluminescenti e coralli;
  - Orbita: asteroidi che ruotano, piloni luminosi e un pianeta con gli anelli.
- **Cielo animato** (shader): sfumatura con una fascia calda sull'orizzonte, stelle che brillano, stelle cadenti, nebulose che si muovono lentamente e, su Ghiaccio e Abisso, un'aurora. Ogni zona ha il suo cielo.
- **Orizzonte synthwave**: montagne in wireframe e sole con alone. Lungo la strada ci sono archi al neon e lampioni, che si scuriscono vicino alla camera per non abbagliare.
- **Luce al neon sui contorni**: personaggio, nemici, ostacoli e boss hanno un bordo luminoso nel colore della zona, che li stacca dallo sfondo anche ad alta velocità.
- **Raggi di sole** (qualità media e alta): fasci di luce che i grattacieli e le montagne tagliano, una striscia anamorfica sul sole e riflessi da lente. Si attenuano quando il sole è coperto, nella tempesta e nel blackout.
- **Strada bagnata**: il sole si riflette al centro della carreggiata con un riflesso che ondeggia. In qualità alta la strada è un vero **specchio**: la scena (archi al neon, nemici, insegne, sole) viene ridisegnata dal basso a un terzo della risoluzione e si riflette sull'asfalto, increspata dall'acqua.
- **Superficie animata della strada** in ogni zona:
  - Città: gocce di pioggia che increspano le pozzanghere;
  - Deserto: sabbia che scorre col vento;
  - Ghiaccio: brina che scintilla;
  - Inferno: crepe con la lava che pulsa sotto;
  - Abisso: caustiche di luce sul fondale;
  - Orbita: impulsi olografici e una griglia di punti.
- **Tunnel di warp** al cambio di zona: anelli di luce del colore della nuova zona sfrecciano verso la camera, con campo visivo più largo e sfocatura radiale.
- **Scie del personaggio**: copie luminose che lo inseguono in turbo, in overdrive e col jetpack.
- **Portale del record**: nella corsa classica un arco dorato con la linea a scacchi segna la tua distanza migliore; superarlo fa esplodere i coriandoli.
- **Ombre morbide** sotto il personaggio, i nemici, gli ostacoli e i pickup; si rimpiccioliscono quando salti o voli.
- **Scia di luce** che il personaggio lascia sulla strada, come nelle moto di luce.
- **Blackout**: le luci della città si spengono e resta solo il faro del personaggio, che illumina la strada davanti a te.
- **Meteo per zona**: pioggia, sabbia, neve, braci, bolle, polvere di stelle.
- **Camera viva**: il campo visivo si allarga con la velocità (molto col turbo), la camera si inclina leggermente nei cambi di corsia, e ad alta velocità compaiono le linee di velocità.
- **Effetti**:
  - esplosioni con lampo, onda d'urto e frammenti luminosi che rimbalzano sulla strada;
  - bolla dello scudo del boss, aura rossa quando è infuriato e scintille quando è danneggiato;
  - mirino rosso del cecchino sulla corsia e raggio quando spara;
  - onde sismiche e raggi laser del boss che corrono verso di te;
  - **overdrive**: colori più saturi, alone magenta e campo visivo più largo;
  - scia di fumo dei razzi;
  - scia del turbo;
  - lampi durante la tempesta.
- **Personaggio**: braccia animate, suole luminose, profili al neon e un nucleo di energia pulsante sulla schiena.

## Gameplay

**Comandi**

| Gesto | Azione |
| --- | --- |
| Swipe ← / → | cambia corsia |
| Swipe ↑ | salta (si atterra anche sopra le piattaforme) |
| Swipe ↓ | scivola sotto le travi (in aria: picchiata) |
| Tocco | spara un colpo |
| Tieni premuto | fuoco automatico (puoi cambiare corsia mentre spari) |
| Pulsante ⚡ (in basso a destra) | attiva l'**overdrive** quando l'anello è pieno |

Un solo dito può concatenare direzioni diverse (es. sinistra e poi su), ma uno swipe lungo nella stessa direzione conta una volta sola. Anche gli swipe molto veloci vengono riconosciuti. Nel browser: frecce o WASD, SPAZIO per sparare, E o SHIFT per l'overdrive, P o ESC per la pausa.

**Tutorial interattivo**: alla prima partita arrivano, uno alla volta, un muro, delle barriere, delle travi laser e un robot. Quando l'ostacolo si avvicina il tempo rallenta fino a fermarsi e compare il gesto da fare (con una freccia animata); la mossa giusta fa ripartire il gioco. Durante il tutorial non si può perdere, e c'è un pulsante per saltarlo. Chi aveva già giocato con una versione precedente non lo rivede.

**Nemici e ostacoli**

- **Robot** che camminano verso di te, **casse** da distruggere, **droni** che si fermano davanti a te, sparano plasma e cambiano corsia. I colpi di plasma si possono abbattere.
- **Arieti**: si fermano davanti a te, lampeggiano e poi caricano lungo la loro corsia. Abbattili prima o spostati.
- **Torrette** piazzate sulla strada, che sparano plasma lungo la loro corsia.
- **Bombardieri**: volano davanti a te, cambiano corsia e sganciano mine.
- **Cecchini**: restano sospesi lontano, puntano la tua corsia con un mirino rosso e dopo un attimo sparano un raggio lungo tutta la corsia. Cambia corsia appena vedi il mirino, o abbattili prima.
- **Guardie con lo scudo**: avanzano a piedi dietro uno scudo che assorbe i colpi frontali. Bisogna romperlo prima di colpirle (i razzi lo scavalcano), oppure evitarle.
- Ostacoli: barriere da saltare, travi laser da passare scivolando, muri che bloccano la corsia, piattaforme su cui correre, **barriere mobili** che scorrono da un lato all'altro della strada, **voragini** da saltare (cadere è fatale) e **recinzioni laser** che si accendono e si spengono a ritmo: passa quando sono spente (se sono accese costano un cuore).
- **Pedane turbo**: passaci sopra e per 2,6 secondi corri al 165% della velocità e sei invincibile. Sfondi muri, casse e nemici (+20 punti per ostacolo) e voli sopra le voragini. Dopo la pedana la corsia è piena di cose da sfondare: senza turbo conviene cambiare corsia.
- **Rampe**: ti lanciano a più di 4 m d'altezza sopra un muro, attraverso una scia di monete nel cielo. Le altre corsie restano percorribili.
- Ogni nemico abbattuto dà punti (che compaiono sopra di lui) e lascia cadere monete. Le uccisioni ravvicinate creano una **combo** (fino a ×8).
- **Schivate al pelo**: se un ostacolo o un nemico passa nella corsia che hai appena lasciato, prendi +25 punti e carichi l'overdrive.
- **Overdrive**: l'anello attorno al pulsante ⚡ si riempie con monete, uccisioni, schivate al pelo, ostacoli sfondati e boss. Quando è pieno lo attivi: per 6 secondi il mondo rallenta (bullet time), fai il 60% di danni in più, spari molto più in fretta e i punti valgono doppio. Va usato al momento giusto, ad esempio contro un boss o in mezzo a un'ondata di nemici.
- **Eventi** durante la corsa: due per zona, a 280 m e a 600 m, mai lo stesso due volte di fila.
  - **Corsa all'oro**: monete su tutte le corsie e strada più veloce.
  - **Imboscata**: la strada rallenta e arrivano tre ondate di nemici; se li abbatti tutti, +30 monete.
  - **Pioggia di meteoriti** (dalla zona 2): un cerchio rosso segna dove cadrà ogni meteorite; esci dalla corsia prima dell'impatto.
  - **Tempesta** (Deserto, Ghiaccio e Città dal secondo giro): sabbia, neve o pioggia fitta, nebbia vicina e lampi. I punti valgono doppio e gli ostacoli arrivano un po' più distanziati.
  - **Gravità ridotta** (Abisso e Orbita): salti altissimi e lunghissimi e monete sospese in aria. Un salto iniziato in bassa gravità resta lento fino all'atterraggio.
  - **Ora di punta** (Città, Deserto, Ghiaccio e Orbita, dalla zona 2): auto lanciate contro di te, su una o due corsie (mai tutte e tre). Un clacson le annuncia; le altre righe di ostacoli si fermano.
  - **Blackout** (Città, Inferno e Abisso, dalla zona 2): le luci si spengono e vedi solo quello che illumina il tuo faro. I punti valgono ×1,5 e gli ostacoli arrivano un po' più distanziati.
- **Jetpack** (power-up raro): voli sopra tutto per 7 secondi raccogliendo monete in cielo, e i colpi scendono a colpire i nemici a terra.
- **Boss**: dopo 900 m di ogni zona arriva un boss con nome e barra della vita colorata. Ogni zona ha il suo, con aspetto e attacchi propri:

  | Zona | Boss | Attacchi |
  | --- | --- | --- |
  | 1 | Nave madre | raffiche su due corsie (una resta libera), colpi mirati, **plasma pesante** |
  | 2 | Scorpione delle dune | sgancia **mine** su una o due corsie (da abbattere o saltare), **onde sismiche**, raffiche |
  | 3 | Portaerei glaciale | lancia **droni**, spazzate di colpi corsia dopo corsia, **laser** |
  | 4 | Signore infernale | spazzate, onde sismiche, mine, plasma pesante, droni, laser |
  | 5 | Kraken meccanico | spazzate, laser, mine, plasma pesante, onde sismiche (tentacoli animati) |
  | 6 | Nucleo IA | **meteoriti**, laser, droni, onde sismiche, spazzate, plasma pesante, mine: il più completo |

  Gli attacchi che non si possono fermare sparando vanno schivati:
  - **plasma pesante**: grosse sfere su due corsie che assorbono i colpi; spostati in quella libera;
  - **onda sismica**: un'onda che corre sulla strada; saltala;
  - **laser**: un raggio all'altezza del petto che si carica e poi parte; passaci sotto scivolando.

  A metà vita il boss alza uno **scudo** per 4,5 secondi: i colpi rimbalzano e lancia una raffica di attacchi da schivare. Dalla zona 4 lo scudo si alza due volte (a 2/3 e a 1/3) e gli attacchi arrivano a coppie, sempre con una via d'uscita. La prima volta che compare un attacco, un breve suggerimento dice come evitarlo.

  Se lo abbatti (con un attimo di rallentatore) prendi +40 monete, +3 gemme e un grosso bonus. Se resisti 45 secondi se ne va. Dopo la sesta zona il ciclo ricomincia, più difficile.
- **Potenziamenti a scelta**: dopo ogni boss il gioco si ferma e propone **3 carte a caso** tra 13: cuore extra, calibro (+danno), raffica, colpi perforanti, tripla canna, calamita, scudo rigenerante, fortuna, esplosivi, combo infinita, tempo dilatato, vampiro, portafortuna. Valgono fino alla fine della corsa e alcuni si sommano (ad esempio calibro fino a 4 livelli), quindi ogni partita prende una strada diversa. Quelli attivi compaiono in basso a sinistra.
- **6 zone** a tema con colori, musica e scenario diversi: Città Neon, Deserto al tramonto, Griglia di ghiaccio, Inferno, Abisso, Orbita. La difficoltà sale a ogni zona.
- Hai **3 cuori** (5 con i potenziamenti). Nemici e plasma tolgono un cuore; schiantarsi contro un ostacolo è fatale.
- Power-up: **scudo**, **magnete**, **fuoco rapido**, **punti doppi**, **cuore extra**, **jetpack** e **razzi a ricerca**. I razzi durano 8 secondi: partono dalle spalle, inseguono il nemico più vicino (anche il boss) e la loro esplosione colpisce chi sta intorno.

**Modalità** (pulsante "MODALITÀ" nel menu: otto schede)

- **Infinita**: la corsa classica (pulsante GIOCA).
- **Sfida giornaliera**: stesso percorso per tutti per tutto il giorno, con una regola diversa ogni giorno tra sette: turbo (+20% velocità, punti ×1,5), cristallo (un solo cuore, punti ×2), solo laser, tempesta di meteoriti, febbre dell'oro, caccia ai boss (arrivano prima), agguati. Sconfiggere il primo boss vale **+150 monete e +5 gemme**, una volta al giorno; resta il record del giorno.
- **Campagna**: 24 livelli, 4 per ognuna delle 6 zone, su una mappa. Ogni livello ha un obiettivo (percorrere una distanza, raccogliere monete, eliminare nemici, sconfiggere il boss, superare un evento, fare schivate al pelo, sfondare ostacoli col turbo, volare dalle rampe). Molti hanno anche una regola speciale: senza sparare, un cuore solo, velocità +20%, solo ventaglio, ora di punta, blackout, gravità ridotta... Ogni livello dà **3 stelle**:
  1. completare l'obiettivo;
  2. raccogliere abbastanza monete (nei livelli di monete: finire entro un tempo limite);
  3. finire senza perdere cuori.

  Il primo completamento sblocca il livello successivo e vale monete (da 75 a 420), ogni stella nuova vale una gemma, e le stelle guadagnate non si perdono. Alla fine si può rigiocare il livello, tornare alla mappa o passare al successivo. I boss della campagna non scappano: dopo 45 secondi si infuriano.
- **Boss Rush**: solo boss, uno dopo l'altro e sempre più forti, con un potenziamento dopo ognuno. Non basta tenere premuto il fuoco:
  - la vita dei boss cresce a ogni boss e in proporzione alla potenza di fuoco ottenuta con i potenziamenti;
  - ogni boss alza lo scudo due volte e, dal terzo, attacca a coppie;
  - gli attacchi accelerano a ogni boss e, dopo 35 secondi, il boss si **infuria** (attacchi molto più rapidi) invece di andarsene;
  - niente potenziamenti che curano o fanno solo monete (vampiro, portafortuna, fortuna, calamita).

  Si conserva il record di boss sconfitti.
- **Contro il tempo**: si parte con 60 secondi e la strada accelera più in fretta. Gli **orologi** sulla strada danno +4 secondi, ogni uccisione e schivata al pelo +0,5, ogni boss +10. La corsa finisce quando il tempo scade; si conserva il record.
- **Assalto**: niente ostacoli, solo **ondate di nemici** sempre più numerose e varie (da 3 a 12, i più duri arrivano dopo; mai tre a terra nello stesso gruppo, una corsia resta libera). L'HUD conta i nemici rimasti. Ogni ondata vale monete, e abbatterli tutti dà un bonus. Ogni 5 ondate arriva un **boss** che non scappa (dopo 45 secondi si infuria), poi un potenziamento e una nuova zona. Il record è il numero di ondate.
- **Caos**: ogni 20 secondi una **mutazione** cambia le regole per 14 secondi, e ognuna superata alza il moltiplicatore dei punti di 0,25 fino a ×3. Le mutazioni sono 12 e arrivano tutte prima di ripetersi:
  - **Specchio**: comandi invertiti;
  - **Mini**: il personaggio (e la sua sagoma) si rimpicciolisce;
  - **Ipervelocità**: strada al 130%;
  - **Sciame**: droni, bombardieri e cecchini ovunque;
  - **Fortezza**: muri, laser e voragini;
  - **Pioggia di razzi**: razzi a ricerca infiniti;
  - **Calamita d'oro**: calamita e punti doppi;
  - gravità ridotta, blackout, tempesta, meteoriti e ora di punta in qualunque zona.
- **Parkour**: niente armi, solo percorsi di ostacoli (rampe, piattaforme, voragini, recinzioni, pedane turbo) e una nuova zona ogni chilometro, senza boss. Saltare un ostacolo nella tua corsia, scivolarci sotto, volare da una rampa, sfondare col turbo e schivare al pelo sono **trick**: in catena moltiplicano i punti ("STILE ×N"), un colpo subìto spezza la catena.
- **Estremo**: un solo cuore, strada più veloce del 15%, punti ×3, nessuna seconda possibilità e nessun potenziamento che dà vite.

**Personalizzazione e progressione**

- **Negozio** con anteprima 3D del personaggio. Tocchi un oggetto per provarlo, poi lo compri o lo equipaggi. Cinque schede:
  - **Skin**: 8 colori.
  - **Cappelli**: 7 cappelli più "nessuno".
  - **Armi**: blaster, doppietta, ventaglio a 3 colpi e laser perforante, ognuna con un modo diverso di sparare.
  - **Scie**: 6 scie di particelle.
  - **Potenziamenti**: danno, cadenza di fuoco, durata del magnete, cuori extra, scudo iniziale.
- Si paga in monete; gli oggetti rari costano gemme. Un video con ricompensa dà **+50 monete** ogni 3 minuti.
- **Ricompensa giornaliera**: al primo accesso di ogni giorno una scala di 7 giorni (da 50 a 250 monete, gemme al 4° e al 7° giorno). Saltare un giorno fa ripartire la serie. Il premio si può **raddoppiare** guardando un video; se il video non arriva alla fine si riceve comunque il premio normale.
- **Livello del giocatore**: ogni corsa dà esperienza (distanza, nemici, boss, eventi, potenziamenti). Ogni livello regala monete, ogni 5 livelli anche gemme. Il livello con la sua barra è nel menu e nel Game Over.
- **Missioni**: 3 obiettivi attivi alla volta (abbattere droni, arieti o boss, superare eventi, prendere pedane turbo, volare dalle rampe, sfondare ostacoli col turbo, combo, distanza, monete...). Danno monete o gemme e, una volta completati, vengono sostituiti da missioni più difficili.
- **Punteggio** = distanza + monete e gemme + bonus di uccisioni e boss. High score, distanza migliore, monete, gemme, oggetti, potenziamenti, missioni, statistiche e impostazioni sono salvati in **LocalStorage**.

**Interfaccia e sistema**

- Gameloop completo:
  - **Menu**, con una corsa demo 3D giocata dall'IA e il pannello delle missioni;
  - **Gioco**, con HUD per punti, cuori, monete, avanzamento della zona (o tempo dell'evento), power-up, potenziamenti attivi, combo, barra del boss e pausa;
  - **Pausa**: riprendi con conto alla rovescia, ricomincia, menu, impostazioni;
  - **Game Over**: riepilogo con uccisioni, zona raggiunta (o boss sconfitti), esperienza guadagnata e barra del livello, avvisi per livelli, missioni e sfide completate, **Continua**, **Rigioca** (nella stessa modalità), **Menu**. Nella campagna mostra le stelle (o quanto mancava all'obiettivo) e i pulsanti **Mappa** e **Avanti**.
- **Impostazioni**: musica, effetti sonori, vibrazione, lingua, consenso privacy (se richiesto dal GDPR) e **qualità grafica**:
  - bassa: niente post-processing;
  - media: bloom e grading;
  - alta: anche il multisampling e la risoluzione piena.

  La qualità regola anche la densità dello scenario, il meteo e le particelle.
- **Grafica automatica**: finché il giocatore non sceglie un livello, il gioco misura i frame al secondo durante la partita e, se il telefono scende sotto i 42 fps, abbassa da solo la qualità di un livello. Nelle impostazioni compare la scritta "AUTOMATICA".
- **Audio** sintetizzato in tempo reale: ogni zona ha la sua progressione di accordi e la musica si intensifica durante il boss. **Vibrazione** (Capacitor Haptics) su colpi, danni, boss e acquisti.
- Tasto indietro di Android: chiude le impostazioni, mette in pausa / riprende, torna al menu, esce dall'app. Il gioco va in pausa da solo quando l'app passa in background.

## Monetizzazione (AdMob)

Tutti gli ID sono in un unico file: [`src/config/admob.config.js`](src/config/admob.config.js). In sviluppo si usano gli **ID di test ufficiali di Google**:

| Formato | Dove | Ad Unit ID di test |
| --- | --- | --- |
| App ID | `AndroidManifest.xml` (scritto dallo script) | `ca-app-pub-3940256099942544~3347511713` |
| Banner adattivo | in basso nel **Menu** (e nel Negozio) e nel **Game Over**; nascosto durante il gioco | `ca-app-pub-3940256099942544/9214589741` |
| Interstitial | ogni **3 partite completate** | `ca-app-pub-3940256099942544/1033173712` |
| Rewarded | **Continua** nel Game Over (un revive per partita), **+50 monete** nel Negozio (ogni 3 minuti) e **×2** sulla ricompensa giornaliera | `ca-app-pub-3940256099942544/5224354917` |

Dettagli di implementazione ([`src/services/AdService.js`](src/services/AdService.js)):

- **Consenso GDPR (UMP)**: prima di inizializzare l'SDK viene raccolto il consenso. Il modulo privacy resta raggiungibile dalle impostazioni.
- **Interstitial**: una partita conta come "completata" quando il giocatore lascia il Game Over (Rigioca o Menu), così l'annuncio non interrompe mai l'offerta di Continua. Se alla terza partita l'annuncio non è ancora caricato, viene mostrato alla partita successiva.
- **Rewarded**: su Android `showRewardVideoAd()` si risolve solo quando la ricompensa viene ottenuta. Per questo il servizio usa gli eventi `Rewarded` e `Dismissed` (con un breve margine per una ricompensa che arriva in ritardo) e un timeout di sicurezza, che si allunga a 20 minuti appena l'annuncio è sullo schermo (chi esce dall'app a metà video e poi lo finisce riceve comunque il premio). La ricompensa viene concessa solo se il video è stato visto davvero. Il revive rimuove ostacoli, nemici e colpi vicini, ripristina tutti i cuori, dà 3 s di invulnerabilità e fa partire un conto alla rovescia.
- Il layout di Menu, Negozio, Impostazioni e Game Over lascia libero lo spazio del banner, usando l'altezza reale comunicata dall'evento `bannerAdSizeChanged`.
- Durante gli annunci a schermo intero musica ed effetti vanno in pausa. Ogni errore dell'SDK viene intercettato e non blocca mai il gioco.
- Nel browser (`npm run dev`) un **mock** ([`MockAdMob.js`](src/services/MockAdMob.js)) simula banner, interstitial e video con ricompensa, così si può provare l'intero flusso senza dispositivo.

## Struttura

```
src/
  config/admob.config.js    ID AdMob (test/produzione) e regole di frequenza
  config/game3d.config.js   corsie, fisica, velocità, armi, nemici, ostacoli, boss, eventi, jetpack,
                            turbo, rampe, razzi, punteggi
  config/zones.js           temi delle 6 zone (colori, scenario, meteo, musica)
  config/perks.js           i 13 potenziamenti a scelta dopo i boss
  config/campaign.js        i 24 livelli della campagna: obiettivi, regole, stelle, premi
  config/cosmetics.js       catalogo del negozio: skin, cappelli, armi, scie
  config/upgrades.js        potenziamenti e loadout della partita
  i18n.js                   testi in italiano e inglese
  logic3d/                  simulazione pura (testabile in Node, senza Phaser né Three.js)
    LaneWorld.js            corsie, salto/scivolata, spari, nemici, boss, zone, eventi, jetpack,
                            turbo, rampe, razzi, potenziamenti, modalità, danni, pickup, revive
    LaneSpawner.js          pattern di ostacoli, nemici e monete
    Autopilot3D.js          IA per la demo del menu e i test
    Missions.js             missioni con ricompense e livelli crescenti
    Tutorial.js             tutorial interattivo della prima partita (tempo che si ferma, gesti)
  logic/ScoreManager.js     punteggio della partita
  logic/Progression.js      esperienza e livelli del giocatore
  three/                    rendering 3D: Stage (renderer, post-processing e qualità), GradeShader,
                            Environment (strada, luci, montagne, archi, nebbia, lampi, faro),
                            Sky (cielo in shader), shading (luce sui contorni, strada bagnata),
                            Effects (ombre, scia di luce, frammenti, lampi, warp, scie del personaggio,
                            portale del record), Mirror (riflesso della strada in qualità alta),
                            Scenery (scenari instanziati delle zone), Weather (meteo, linee di velocità),
                            models (ostacoli, nemici, boss, pickup, pedane, rampe, razzi), Character,
                            Particles, GameView (partita e demo), PreviewView (anteprima del negozio)
  services/                 AdService, MockAdMob, SaveData (LocalStorage), Sfx e Music (Web Audio),
                            Haptics, Platform (tasto indietro, background), DailyReward,
                            AutoQuality (qualità grafica adattiva), DailyChallenge (sfida del giorno)
  scenes/                   Boot, Menu, Daily, Modes, Campaign, Shop, Game, Perk, Pause, GameOver, Settings
                            (interfaccia Phaser)
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
npm test               # 210 test unitari (mondo 3D, armi, nemici, ostacoli, eventi, jetpack, turbo, rampe, razzi, tempesta, gravità ridotta, 6 boss con scudi e attacchi da schivare, difficoltà del Boss Rush, overdrive, schivate al pelo, cecchini, guardie, recinzioni, traffico, blackout, campagna, contro il tempo, assalto, caos e le sue 12 mutazioni, parkour e trick, estremo, record per modalità, potenziamenti, modalità, livelli, tutorial, missioni, ricompensa giornaliera, grafica adattiva, salvataggi, negozio, lingue, annunci)
npm run build          # bundle web di produzione in dist/
npm run verify         # gioca la build in Chromium headless e verifica tutto il flusso
npm run cap:sync       # build + npx cap sync android + configurazione Android
npm run cap:open       # apre il progetto in Android Studio
npm run release:check  # controlla che la release non usi gli ID AdMob di test
```

`npm run verify` emula un telefono in landscape con touch e gioca davvero, con swipe e tocchi. Controlla 70 punti, tra cui:
- avvio dei due renderer (Three.js e Phaser) e demo 3D nel menu;
- ricompensa giornaliera riscossa una volta sola;
- banner nel menu, nascosto in gioco;
- tutorial completo: il tempo si ferma davanti al muro, poi cambio corsia, salto e scivolata con gli swipe, robot abbattuto tenendo premuto;
- uno swipe lungo sposta di una sola corsia; sparo con tocco e fuoco automatico; uccisione di un nemico;
- arrivo del boss, sua sconfitta con ricompensa, scelta di un potenziamento (la corsa aspetta) e passaggio alla zona 2;
- pausa e ripresa;
- high score, missioni, esperienza e statistiche in LocalStorage;
- sfida giornaliera (percorso fisso e regola del giorno, record salvato) e Boss Rush (boss subito, niente ostacoli);
- revive con video, una sola seconda possibilità per partita, interstitial alla terza partita completata;
- impostazioni: vibrazione, qualità grafica, lingua;
- negozio: anteprima 3D, acquisto di skin e potenziamento, +50 monete con video, skin e danno applicati in partita;
- novità della 4.0: pedana turbo (velocità, muro sfondato, campo visivo più largo), lancio dalla rampa, razzi a ricerca che colpiscono un nemico in un'altra corsia, tempesta (nebbia, meteo più fitto, punti doppi) e salto in gravità ridotta;
- novità della 5.0: overdrive attivato dal pulsante dell'HUD, onda sismica e plasma pesante del boss disegnati, quattro modalità, livello 1 della campagna completato con le stelle salvate e il pulsante per il successivo, timer di "Contro il tempo" che scorre;
- novità della 6.0: otto modalità; in Assalto la prima ondata arriva ed è contata sull'HUD; in Caos la mutazione Specchio trasforma uno swipe a sinistra in un passo a destra; in Parkour il tocco non spara e saltare una barriera è un trick; in Estremo un cuore, punti ×3 e niente "Continua"; il portale del record; il tunnel di warp; le scie in overdrive; raggi di sole e specchio della strada in qualità alta;
- musica attiva e assenza di errori in console.

Gli screenshot finiscono in `verify-output/`.

## Build Android

Requisiti: Node 22+, JDK 21, Android SDK con platform 36 (Android Studio).

```bash
npm run cap:sync
cd android && ./gradlew assembleDebug     # APK in android/app/build/outputs/apk/debug/
```

`versionName` e `versionCode` vengono dal campo `version` di `package.json` (6.0.0 → versionCode 60000).

Le build di debug sono firmate con `android/debug.keystore`, una chiave di debug inclusa nel repository (come quella che Android Studio crea in locale, non è un segreto). Così tutti gli APK prodotti dalla GitHub Action hanno la stessa firma: una nuova versione si installa sopra la precedente e **i salvataggi restano**. Le release usano invece la chiave privata di `keystore.properties`.

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
- La logica di gioco (`src/logic3d`) non dipende né da Phaser né da Three.js: le viste ne leggono lo stato e reagiscono a una coda di eventi (colpi, uccisioni, boss...). Per questo fisica, collisioni, armi, nemici, eventi, boss, potenziamenti, modalità, tutorial, missioni e revive sono coperti da test deterministici in Node. Un'IA gioca 3 minuti di partita su 12 seed diversi attraversando zone, affronta ognuno dei 6 boss su più seed e gioca Boss Rush, sfide giornaliere e livelli della campagna, per verificare che pattern, eventi e attacchi siano sempre superabili. Un test controlla anche il contrario: tenendo premuto il fuoco senza muoversi, il Boss Rush finisce al primo boss. La stessa IA gioca due minuti in Assalto, Caos (anche con i comandi invertiti), Parkour ed Estremo.
- Nella sfida giornaliera il percorso (righe di ostacoli, power-up, eventi) ha un seme separato dal resto, quindi è lo stesso per tutti qualunque cosa si colpisca.
- Prestazioni su mobile:
  - materiali e geometrie condivisi, mesh riutilizzate in pool, edifici in `InstancedMesh`;
  - circa 80 draw call per frame;
  - nessuna allocazione per frame nei percorsi caldi (sincronizzazione delle mesh, particelle, colpi), per evitare scatti del garbage collector;
  - risoluzione, antialiasing e numero di edifici regolabili con la qualità grafica, che scende da sola sui telefoni lenti;
  - al cambio di renderer il vecchio contesto WebGL viene rilasciato, e l'anteprima del negozio libera la sua memoria GPU.
- Risoluzione base dell'interfaccia 1280×720 con `Phaser.Scale.EXPAND`: si adatta a qualsiasi rapporto d'aspetto (18:9, 20:9, tablet) senza bande nere.
- Schermo intero immersivo (barre di sistema nascoste, riapplicato dopo gli annunci) in `MainActivity.java`. Sfondo scuro su splash e finestra, per evitare il flash bianco all'avvio.
- Le scene Phaser vengono riutilizzate tra una visita e l'altra: lo stato di ogni scena viene azzerato in `init()` e i listener vengono rimossi allo `shutdown`.
- I salvataggi delle versioni 1.x (record, monete, skin, impostazioni) vengono migrati automaticamente.
