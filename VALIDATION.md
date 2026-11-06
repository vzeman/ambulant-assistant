# Overenie MVP (6. 11. 2026)

- Syntax servera a klienta: `npm run check` prešlo.
- Štyri automatické testy: vetvenie kašľa, validácia protokolu, kontrola doslovných citácií, HTTP autentifikácia/ochrana pôvodu a perzistencia protokolu.
- Skutočné volanie Codex CLI s existujúcim ChatGPT prihlásením: úspešné.
- Ručne v lokálnom prehliadači: súhlas → úvod so znalosťou astmy z histórie → voľný opis príznakov → doplňujúce otázky → odborný protokol → potvrdenie → uložený záznam dostupný po PIN-e v časti lekára.
- Výstup odlíšil historickú dokumentáciu od dnešných tvrdení a uviedol neoverené údaje (napr. cetirizín a sila inhalátora).
- Overené, že `data/` vrátane PIN-u, relácií a protokolov je ignorované Gitom.
- Hlasový vstup, systémové hlasy a hands-free správanie závisia od konkrétneho prehliadača a povolenia mikrofónu. Skutočný zvukový rozhovor s mikrofónom nebol pri tomto overení otestovaný. Pri nefunkčnom rozpoznávaní sa dá použiť text alebo diktovanie systému.

Overenie je funkčný test prototypu; nejde o klinickú validáciu ani bezpečnostný audit.
