# GameMakerJS – Plan rozbudowy

## Stan obecny
- Edytor sceny (Phaser.js) – dodawanie sprite'ów i tekstów, inspektor X/Y
- Edytor węzłów (custom DOM) – pan/zoom, łączenie portów, węzły logiki
- Węzły: Na Start, Na Update, Na Dotyk/Klik, Rusz Sprite, Ustaw Prędkość, Log, Liczba, Tekst
- PWA – działa offline, instalowalne na telefonie
- Zarządzanie projektami – wiele projektów w localStorage
- Obsługa dotyku – pan/pinch-zoom na mobile

---

## Faza 1 – Fundamenty (brakujące podstawy)

- [x] Usuń obiekt ze sceny – przycisk 🗑 w inspektorze lub klawisz Delete
- [x] Usuń węzeł z grafu – przycisk ✕ na headerze węzła, usuwa też połączenia
- [x] Przesuwanie kamery nad sceną – środkowy przycisk myszy / spacja+drag / 2 palce / scroll zoom
- [x] Zmień nazwę obiektu – edytowalne pole "Nazwa" w inspektorze, aktualizuje label w scenie
- [x] Duplikuj obiekt – kopiuj/wklej sprite ze sceną
- [ ] Undo / Redo – Ctrl+Z / Ctrl+Y, historia zmian
- [ ] Snap do siatki – obiekty przyciągają się co 32px

---

## Faza 2 – Więcej węzłów logiki

- [ ] If / Warunek – rozgałęzienie: jeśli A > B → exec A, else → exec B
- [ ] Zmienna – przechowuj i czytaj wartości (punkty, życia, flagi)
- [ ] Matematyka – dodaj / odejmij / pomnóż / porównaj liczby
- [ ] Losowa liczba – random między min a max
- [ ] Timer / Czekaj – opóźnienie wykonania o N sekund
- [ ] Zmień scenę – przeskocz do innego ekranu gry
- [ ] Wyświetl tekst – zaktualizuj napis na ekranie (HUD, wynik)

---

## Faza 3 – System zasobów (Assets)

- [ ] Upload PNG – FileReader API → Phaser texture
- [ ] Sprite sheet – podziel obraz na klatki animacji
- [ ] Animacje – węzeł "Odtwórz animację" z klatkami
- [ ] Dźwięki – upload MP3/OGG + węzeł "Zagraj dźwięk"
- [ ] Panel zasobów – zakładka Assets z miniaturami

---

## Faza 4 – Fizyka i gameplay

- [ ] Phaser Arcade Physics – grawitacja, prędkość, odbicie
- [ ] Kolizja – węzeł "Gdy A uderzy B → exec"
- [ ] Platforma – sprite jako podłoga/ściana (statyczne ciało)
- [ ] Kamera śledząca – kamera podąża za wybranym obiektem
- [ ] Granice świata – obiekty odbijają się od krawędzi
- [ ] Szablony gier – Platformer / Top-down / Endless runner starter

---

## Faza 5 – Mobile UX

- [ ] Joystick on-screen – wirtualny pad dla gracza podczas gry
- [ ] Przyciski akcji – konfigurowalne buttony (skok, strzał)
- [ ] Pełny ekran – tryb fullscreen podczas gry
- [ ] PWA install prompt – baner "Zainstaluj GameMakerJS"
- [ ] Orientacja ekranu – lock do landscape/portrait per gra

---

## Faza 6 – Eksport i udostępnianie

- [ ] Export HTML – pobierz grę jako `game.html` (standalone, bez serwera)
- [ ] QR kod – zeskanuj telefonem → otwiera grę
- [ ] GitHub Pages deploy – automatyczny deploy przez GitHub Actions
- [ ] Import/Export projektu – pobierz/wgraj projekt jako `.gmjs` (JSON)
- [ ] Link do gry – udostępnij URL z grą (przez GitHub Pages)

---

## Faza 7 – Zaawansowane

- [ ] Wiele scen – Menu → Poziom 1 → Poziom 2 → Game Over
- [ ] Tilemap editor – maluj poziomy kafelkami jak w Tiled
- [ ] Particle system – efekty: ogień, wybuchy, iskry
- [ ] Hybrid kod – węzeł "JS Script" z własnym kodem TypeScript
- [ ] Multiplayer – WebSocket, dwie osoby grają razem
- [ ] AI NPC – węzeł "Patrol" / "Gonij gracza"

---

## Kolejność realizacji

```
Faza 1 → Faza 2 → Faza 3 → Faza 4 → Faza 6 → Faza 5 → Faza 7
```

Każda faza jest commitowana osobno i śledzona przez ten plik.
Po ukończeniu zadania zaznaczamy je jako `[x]`.
