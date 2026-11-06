# Overenie MVP (6. 11. 2026)

- Syntax servera a klienta: `npm run check` prešlo.
- Dvadsať automatických testov vrátane štyroch testov slovenského hlasu: vetvenie kašľa, validácia protokolu, kontrola doslovných citácií, HTTP autentifikácia/ochrana pôvodu a perzistencia protokolu.
- Skutočné volanie Codex CLI s existujúcim ChatGPT prihlásením: úspešné.
- Ručne v lokálnom prehliadači: súhlas → úvod so znalosťou astmy z histórie → voľný opis príznakov → doplňujúce otázky → odborný protokol → potvrdenie → uložený záznam dostupný po PIN-e v časti lekára.
- Výstup odlíšil historickú dokumentáciu od dnešných tvrdení a uviedol neoverené údaje (napr. cetirizín a sila inhalátora).
- Overené, že `data/` vrátane PIN-u, relácií a protokolov je ignorované Gitom.
- Hlasový vstup, systémové hlasy a hands-free správanie závisia od konkrétneho prehliadača a povolenia mikrofónu. Skutočný zvukový rozhovor s mikrofónom nebol pri tomto overení otestovaný. Pri nefunkčnom rozpoznávaní sa dá použiť text alebo diktovanie systému.

Overenie je funkčný test prototypu; nejde o klinickú validáciu ani bezpečnostný audit.

## Úprava slovenčiny

Živý test Codexu s fiktívnou odpoveďou bez diakritiky vytvoril prirodzenú slovenskú otázku („Chápem, že vás kašeľ znepokojuje. Zmenil sa za tie tri dni, alebo je stále rovnaký?“) a samostatný odborný slovenský záznam. Chýbajúce údaje zostali označené ako chýbajúce a doslovné citácie prešli existujúcou kontrolou. Automatické testy overujú výber slovenského hlasu, odmietnutie českého hlasu, oneskorené načítanie aj nedostupnosť slovenského hlasu. Kvalita skutočného hlasového prednesu cez mikrofón/reproduktory zostáva závislá od nainštalovaného hlasu a nebola týmto testom posúdená.

## Odolnosť výstupu AI

Regresné testy pokrývajú zachovanie pôvodného textu pacienta vrátane chýb a negácií, odmietnutie neexistujúceho zdroja a správ asistenta, neplatné a duplicitné otázky, parsovanie JSON výstupu a automatickú opravu neplatného odkazu jedným opakovaním. Syntetický CLI adaptér pri prvom pokuse úmyselne vráti nesprávny odkaz; druhý pokus musí priniesť platné citácie. Žiadne uložené rozhovory sa v týchto testoch neposielajú poskytovateľovi AI.

Živá regresná skúška cez Codex úspešne prešla úvodom, tromi po sebe idúcimi syntetickými odpoveďami pacienta aj vytvorením odborného protokolu. Vstupy boli vytvorené osobitne na tento test; uložené pacientske rozhovory sa nepoužili.

## Dobrovoľné ukončenie rozhovoru

HTTP regresný test overuje ukončenie bez jedinej odpovede, zahrnutie rozpracovanej poslednej odpovede, označenie neúplného záznamu, zoznam chýbajúcich okruhov a potvrdené uloženie správy na disk. Používa iba syntetický CLI adaptér a dočasný adresár.

Živá skúška v prehliadači: po úvode bol do poľa napísaný nový fiktívny údaj o pravidelnej kontrole bez jeho samostatného odoslania. Tlačidlo ukončenia ho zahrnulo do správy a Codex vytvoril neúplný odborný záznam s chýbajúcimi okruhmi.

## Viditeľnosť správ lekárovi

HTTP test kontroluje, že vygenerovaná správa je dostupná autentifikovanému lekárovi už pred potvrdením pacienta a má správny stav. Po potvrdení sa zobrazí iba raz, stav sa zmení a potvrdenie sa zapíše aj do súboru rozhovoru. Samostatný test obnovuje staršie návrhy zo súborov bez ich opätovného generovania a uprednostňuje potvrdený protokol pred starším návrhom s rovnakým ID.

## Formátovanie správy

Syntetické testy overujú nadpisy, odrážky, tučné písmo, podčiarknutie a zachovanie významu negácií a dávok. Pokrývajú aj staršie čisté texty, textový export, odlíšenie nezistených údajov od urgentného upozornenia a odmietnutie vložených skriptov či HTML atribútov. Testy nevyužívajú miestne pacientske záznamy.

Živá skúška Codexu na novom výslovne fiktívnom príklade vytvorila správu s Markdown nadpismi, tučnými tvrdeniami a podčiarknutými neistotami. Vizuálne bol skontrolovaný samostatný HTML export vrátane stručného prehľadu, oddelených sekcií a zachovaných negácií. Existujúce pacientske záznamy sa na túto skúšku neposielali poskytovateľovi AI.
