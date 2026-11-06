# Ambulant

Lokálne slovenské MVP asistenta pred návštevou ambulantného špecialistu. Priateľský AI rozhovor vychádza z fiktívnej anamnézy a upraviteľného protokolu. Výstupom je návrh odborného záznamu na kontrolu lekárom.

## Spustenie na Macu

1. Potrebujete Node.js 22+ a [Codex CLI](https://learn.chatgpt.com/docs/cli). Nie sú potrebné ďalšie npm balíky.
2. V Termináli vykonajte `codex login` a prihláste sa cez ChatGPT. Existujúce prihlásenie sa použije automaticky.
3. Dvakrát kliknite na **Spustit.command**, alebo v adresári projektu spustite `npm start`.
4. Otvorte **http://localhost:4317**. Pre hlasový vstup odporúčame Chrome; dostupnosť reči závisí od prehliadača, siete, povolení a nainštalovaných hlasov systému.
5. Prvý náhodný šesťmiestny PIN nájdete v **data/FIRST-RUN-PIN.txt**. Zadajte ho cez „Vstup pre lekára“. PIN môžete zmeniť v záložke Prístup. Uchováva sa scrypt hash so soľou.

`Ctrl+C` v Termináli zastaví server. Server počúva iba na 127.0.0.1. Tablet cez Wi-Fi sa k nemu v tejto verzii nepripája; responzívne UI je pripravené pre tablet, jeho pripojenie potrebuje ďalšie nasadenie s HTTPS a prístupovou kontrolou. MVP aktuálne podporuje jedného predvoleného ukážkového pacienta a jedného lekára na počítači.

## Ako predviesť aplikáciu

- Vstúpte ako lekár a prezrite si ukážkového Martina Ukážkového, históriu astmy, liečbu a alergie.
- V „Otázky a protokol“ upravte texty, možnosti, sekcie výstupu a podmienky. Napríklad `cough_type` sa aktivuje po kladnej odpovedi na `cough`.
- Prejdite do režimu pacienta. Prístup lekára sa na serveri okamžite zruší.
- Potvrďte spracovanie fiktívnych údajov. Každú odpoveď vyhodnocuje skutočný Codex, žiadna predskriptovaná napodobenina AI.
- Skúste napríklad: „Posledné tri dni mám suchý kašeľ, hlavne večer. Pri chôdzi do kopca sa viac zadýcham.“
- Hlas: povoľte voliteľné hlasové funkcie pod chatom, zapnite hlas a použite mikrofón. Bežne sa prepis pred odoslaním dá skontrolovať. Vo voľbe „Hlasový rozhovor“ asistent po dohovorení začne počúvať a rozpoznanú reč odošle automaticky. Prehliadač môže automatické počúvanie zablokovať; potom použite tlačidlo mikrofónu. V nepodporovanom prehliadači môžete použiť systémové diktovanie macOS do textového poľa.
- Hlasové príkazy „Pripraviť záznam“, v náhľade „Uložiť záznam“ alebo „Doplniť odpovede“ umožnia dokončiť rozhovor aj bez písania.
- Ukončite rozhovor a pripravte záznam. Prečítajte si náhľad, prípadne doplňte odpovede a potvrďte uloženie.
- Lekár po zadaní PIN-u nájde text v Záznamoch; môže ho skopírovať alebo stiahnuť ako `.txt`. E-mail sa v tomto MVP neodosiela.

## Kde sú dáta

Pri prvom spustení sa vytvorí ignorovaný adresár `data/` s oprávneniami 0700; dátové súbory sa zapisujú s oprávneniami 0600:

- `patient.json` – lokálna kópia fiktívnej anamnézy.
- `protocol.json` – lekárom upraviteľný protokol, otázky a vetvy.
- `sessions/*.json` – rozpracované rozhovory a ich snapshot protokolu/anamnézy.
- `reports/*.json` – potvrdené záznamy, doslovné citácie odpovedí, nezodpovedané okruhy.
- `config.json` – hash PIN-u; `FIRST-RUN-PIN.txt` obsahuje počiatočný PIN do jeho prvej zmeny.
- `runtime/` – schéma odpovede pre Codex; neobsahuje API kľúč.

**Do GitHubu patria iba zdrojové súbory a jasne označené fiktívne príklady v `examples/`. Adresár `data/` nikdy necommitujte.** Lokálne súbory nie sú šifrované aplikáciou. Prehliadač má iba nepriehľadné HttpOnly cookies; lekárska časť sa overuje na serveri. PIN nie je náhradou za systémový kiosk režim. Po odchode od zariadenia uzamknite pracovisko. Lekárska relácia má limit 30 minút, pacientská dve hodiny. Obnovenie stránky pokračuje v rovnakej relácii, pokiaľ beží server; po reštarte servera sú rozpracované relácie len na disku a nový rozhovor sa začína odznova. Potvrdené záznamy zostávajú dostupné.

## AI a súkromie

Záznamy sa ukladajú lokálne, **spracovanie AI nie je offline**. Text rozhovoru, fiktívna história a protokol sa posielajú OpenAI cez Codex CLI a existujúce ChatGPT prihlásenie. Použitie závisí od oprávnení a limitov vášho účtu; MVP nie je zárukou neobmedzeného ani bezplatného používania. Pozrite [oficiálny neinteraktívny režim](https://learn.chatgpt.com/docs/non-interactive-mode).

Backend spúšťa `codex exec` bez shell interpolácie; prompt ide cez stdin. Ignoruje používateľský config a execpolicy pravidlá, nenačítava používateľské MCP servery, má read-only sandbox, zakázaný shell a web search, dočasné relácie (`--ephemeral`) a JSON schému. API key premenné sa do procesu neposielajú. Pri neplatnom výstupe či výpadku sa zobrazí chyba a odpoveď pacienta zostane v poli; aplikácia nepredstiera úspech. Citácie každého zachyteného okruhu sa kontrolujú oproti správam pacienta. Samotná správnosť klinického zhrnutia zostáva predmetom kontroly lekárom.

Rozpoznávanie reči používa Web Speech API a môže posielať zvuk poskytovateľovi prehliadača; aplikácia nenahráva a neukladá zvuk. Čítanie používa `speechSynthesis` a dostupný slovenský alebo český hlas. Hlasové funkcie nie sú garantované na každom prehliadači. Nie je použitá platená hlasová API služba.

**Iba demonštrácia s vymyslenými údajmi.** Nie je to zdravotnícka pomôcka ani hotové riešenie na spracovanie skutočných zdravotných údajov. Neurčuje diagnózu, liečbu, triedenie pacientov ani bezpečnosť čakania. Detekcia výstrah AI nemusí zachytiť všetky urgentné stavy. Pri závažných ťažkostiach treba okamžite privolať zdravotnícky personál; pri ohrození života 155/112. Ukážkový protokol musí pred reálnym použitím schváliť lekár.

## Vývoj a overenie

```sh
npm run check
npm test
npm start
```

Premenné `PORT` (predvolene 4317), `CODEX_BIN` (predvolene `codex`) a voliteľne `CODEX_MODEL` umožnia lokálnu konfiguráciu. Kód je bez externých runtime závislostí. Pri viacerých inštaláciách Codexu adaptér automaticky vyberie kompatibilnú verziu z Node/NVM alebo PATH; explicitná cesta má prednosť cez CODEX_BIN. Testy overujú vetvenie, validáciu protokolu, priradenie odpovedí k doslovným citáciám pacienta a HTTP ochranu lekárskeho prístupu, pôvodu požiadaviek a uloženia protokolu. HTTP test používa samostatný dočasný adresár, nie vaše lokálne záznamy.

Architektúra: `server.mjs` (HTTP, relácie, autorizácia, disk), `core.mjs` (Codex adaptér, schéma, validácia), `public/` (responzívny klient), `examples/` (fiktívne dáta). Názvy okruhov a odborné sekcie sú definované v protokole; žiadny email ani analytika sa neposielajú na pozadí.

## Ďalšie kroky

Klinická validácia protokolu, produkčné riadenie zdravotných údajov a súhlasov, šifrovanie a retencia, viac pacientov, systémový kiosk, kvalitnejší lokálny hlasový vstup/výstup a explicitne nakonfigurovaný e-mailový export sú nad rámec MVP.
