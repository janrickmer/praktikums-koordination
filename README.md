# Praktikumsportal – Georg-Christoph-Lichtenberg-Schule Kassel

Webanwendung zur Koordination der Betriebspraktika in Jg. 9 und Jg. 11 (E-Phase):
Schülerinnen und Schüler hinterlegen ihren Betriebssteckbrief, Lehrkräfte verwalten
Klassen, Praktikumsbesuche, Videocalls und Termine.

* **Webseite (statisch):** GitHub Pages – HTML, CSS, JavaScript, keine Build-Schritte
* **Datenbank:** [Supabase](https://supabase.com) (PostgreSQL), angesprochen direkt aus dem Browser

> GitHub Pages kann nur feste Dateien ausliefern und selbst keine Daten speichern.
> Damit Lehrkräfte die Eingaben ihrer Schüler sehen können, braucht es eine
> gemeinsame Datenbank – dafür wird Supabase verwendet.

---

## Funktionen im Überblick

**Zugang**
* Die gesamte Seite ist nur mit dem Seitenpasswort nutzbar (Groß-/Kleinschreibung egal).
* In der Fußleiste führt ein Link zur **Lehrkräfte-Ansicht**.
* Lehrkräfte registrieren sich mit Vorname, Nachname, dienstlicher E-Mail, Passwort (+ Bestätigung)
  und dem **Lehrkräfte-Code**.
* Schüler registrieren sich mit Vorname, Nachname, schulischer E-Mail und Passwort.
* Alle Passwörter werden ausschließlich als **bcrypt-Hash** gespeichert (nicht entschlüsselbar).
* **Passwort vergessen:** Die Anfrage erscheint bei der Lehrkraft der Klasse. Diese erzeugt einen
  Einmal-Code (2 Stunden gültig, nur einmal nutzbar). Bei der Anmeldung damit muss sofort ein neues
  Passwort festgelegt werden.

**Schüleransicht**
1. Klasse mit dem Code der Lehrkraft beitreten
2. Betriebssteckbrief + „Unterkunft während des Praktikums“ (Zusatzfragen erscheinen bei „Ja“)
3. Klassenteam (Kürzel der Lehrkräfte)
4. **Praktikums-Dashboard** mit Betriebssteckbrief, Unterkunft, Klassenteam,
   „Praktikumsbesuch / Praktikumsgespräch“ (inkl. großem Kalenderblatt bei festem Termin und
   .ics-Download), „Verfahren bei Krankheit“ und „Kontaktinformationen für Notfälle“.
   Fehlende Angaben werden oben rot mit Link zum Nachtragen angezeigt.

**Lehrkräfte-Ansicht**
* Klassen anlegen (erst Jahrgang, dann Name → Beitrittscode wird erzeugt)
* Schülerliste je Klasse, sortierbar nach Nachname, Entfernung und Betrieb; Koffer-Symbol in der
  ersten Spalte bei abweichender Unterkunft
* Klassenteam als „Wortwolke“: häufiger genannte Kürzel sind größer; Klick zeigt die Schüler
* Pro Schüler: Präsenz (durch mich / durch andere Lehrkraft) oder Videocall, individuelle Nachricht, Termin
* Buttons **„Praktikumsbesuche durch mich“** und **„Praktikumsgespräche mit Videocall“**:
  Sammelnachricht für alle + Übersicht, wer welche Nachricht sieht; roter Hinweis für Schüler ohne Information
* Button **„Informationen für die besuchende Lehrkraft“** (bei Besuch durch andere Lehrkraft):
  PDF mit Schülerdaten + ab Seite 2 der Gesprächsleitfaden (`assets/gespraechsleitfaden.pdf`)
* **Kalender** mit Wochenansicht, Navigation zwischen Wochen und **ICS-Export**
* Profil mit Notfallkontakt (Name und E-Mail Pflicht, Telefon freiwillig)
* Administration (Reiter „Lehrkräfte“, nur mit Admin-Rechten): Übersicht aller Lehrkräfte und
  Einmal-Codes für Lehrkräfte, die ihr Passwort vergessen haben
* Klasse löschen (inkl. aller Schülerkonten der Klasse, z. B. am Schuljahresende)

---

## Einrichtung (einmalig, ca. 15 Minuten)

### 1. Supabase-Projekt anlegen

1. Auf <https://supabase.com> ein kostenloses Konto anlegen und ein **neues Projekt** erstellen.
2. Als Region **Central EU (Frankfurt)** wählen (Datenhaltung in der EU).
3. Ein sicheres Datenbank-Passwort vergeben (wird für das Portal nicht benötigt, aber gut aufbewahren).

### 2. Datenbank einrichten

1. Im Supabase-Dashboard links **SQL Editor** öffnen → „New query“.
2. Den kompletten Inhalt von [`supabase/schema.sql`](supabase/schema.sql) einfügen und auf **Run** klicken.
3. In einer neuen Abfrage **Seitenpasswort und Lehrkräfte-Code** festlegen
   (diese Werte stehen absichtlich nicht im öffentlichen Repository):

   ```sql
   select app.set_access_codes('SEITENPASSWORT', 'LEHRKRAEFTE-CODE');
   ```

   Derselbe Befehl ändert die Werte später auch wieder.

### 3. Webseite mit der Datenbank verbinden

1. Im Supabase-Dashboard die **Projekt-URL** (`https://….supabase.co`) und den
   **Publishable key** (beginnt mit `sb_publishable_`; bei älteren Projekten der „anon public“-Schlüssel)
   heraussuchen – zu finden über den Button „Connect“ bzw. unter „Project Settings“ → „API Keys“.
2. Beide Werte in [`js/config.js`](js/config.js) eintragen und committen.

> Diese beiden Werte sind für die Verwendung im Browser gedacht und dürfen öffentlich sein.
> **Niemals** den „secret“- bzw. „service_role“-Schlüssel eintragen!

### 4. GitHub Pages aktivieren

1. Im Repository: **Settings → Pages**.
2. „Build and deployment“ → Source: **Deploy from a branch**, Branch: den Branch mit diesem Code
   (z. B. `main`), Ordner: **/ (root)** → Save.
3. **Eigene Domain:** Unter „Custom domain“ die Domain eintragen (z. B. `praktikum.beispiel.de`)
   und speichern. Bei Strato für diese (Sub-)Domain einen **CNAME-Eintrag** auf
   `janrickmer.github.io` setzen. Nach der DNS-Prüfung „Enforce HTTPS“ aktivieren.
   GitHub legt dabei automatisch eine Datei `CNAME` im Repository an.

---

## Betrieb & Wartung

| Aufgabe | So geht's |
| --- | --- |
| Seitenpasswort / Lehrkräfte-Code ändern | SQL Editor: `select app.set_access_codes('NEU', 'NEU');` |
| Admin-Rechte vergeben | SQL Editor: `select app.set_admin('dienstliche@adresse.de');` (entziehen: `…, false`) |
| Lehrkraft hat Passwort vergessen | „Passwort vergessen?“ auf der Lehrkräfte-Anmeldung → Admin erzeugt im Reiter „Lehrkräfte“ einen Einmal-Code |
| Admin selbst hat Passwort vergessen | SQL Editor: `select app.admin_reset_teacher_password('mail@schule.de', 'NeuesPasswort123');` |
| Schüler hat Passwort vergessen | „Passwort vergessen“ → Lehrkraft erzeugt Einmal-Code |
| Daten am Schuljahresende löschen | In der Lehrkräfte-Ansicht die Klasse öffnen → „Klasse löschen“ |
| Update der Datenbankfunktionen | `supabase/schema.sql` erneut komplett im SQL Editor ausführen (Daten bleiben erhalten) – nötig z. B. seit den Umschlagfarben der Klassen |

**Hinweis zum kostenlosen Supabase-Tarif:** Laut Supabase-Dokumentation werden kostenlose Projekte
nach etwa einer Woche ohne Aktivität pausiert und können im Dashboard wieder gestartet werden
(siehe [Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)).
Während der Praktikumsphase ist das kein Problem; vor einem neuen Praktikumsdurchgang ggf.
einmal im Dashboard prüfen.

## Datenschutz – bitte beachten

Das Portal verarbeitet personenbezogene Daten von Schülerinnen und Schülern (Namen, E-Mail-Adressen,
Praktikumsbetriebe, ggf. private Handynummern und Notfallkontakte). Vor dem Einsatz sollte die
Nutzung mit der **Schulleitung und dem/der Datenschutzbeauftragten** abgestimmt werden
(u. a. Verzeichnis der Verarbeitungstätigkeiten, Auftragsverarbeitungsvertrag mit Supabase,
Information der Schüler/Eltern, Impressum und Datenschutzerklärung der Webseite).

Technische Maßnahmen im Portal:
* Datenhaltung in der EU-Region, keine externen Schriftarten, CDNs oder Tracking
* Passwörter, Codes und Seitenpasswort nur als bcrypt-Hash
* Tabellen sind über die öffentliche Schnittstelle nicht erreichbar; jede Funktion prüft die Berechtigung
  (Lehrkräfte sehen nur ihre eigenen Klassen, Schüler nur ihre eigenen Daten)
* Sperre nach 10 Fehlversuchen bei der Anmeldung, Drosselung beim Lehrkräfte-Code
* `noindex` – Suchmaschinen sollen die Seite nicht aufnehmen
* PDFs und Kalenderdateien werden vollständig im Browser erzeugt

**Grenze von GitHub Pages:** Die Dateien der Webseite selbst (HTML/JavaScript) sind öffentlich abrufbar –
das Seitenpasswort schützt die *Daten* (es wird bei jeder Registrierung serverseitig geprüft),
nicht den Programmcode.

---

## Projektstruktur

```
index.html                Einstiegsseite
css/style.css             Gestaltung „Schulheft“ (inkl. Dunkelmodus), siehe DESIGN.md
PRODUCT.md, DESIGN.md     Produkt- und Gestaltungsgrundlagen für spätere Änderungen
js/icons.js               eigenes Icon-Set (SVG)
js/config.js              Supabase-Zugangsdaten (öffentlich)
js/app.js                 Seitenpasswort, Navigation
js/student.js             Schüleransicht
js/teacher.js             Lehrkräfte-Ansicht
js/calendar.js            Kalender (Wochenansicht)
js/pdf.js                 PDF für besuchende Lehrkräfte
js/ics.js                 Kalenderexport (.ics)
js/common.js, ui.js, api.js  gemeinsame Bausteine
assets/                   Gesprächsleitfaden (PDF), Schriften (Lexend für die Seite, Liberation Sans für die PDF)
vendor/                   pdf-lib + fontkit (lokal, kein CDN)
supabase/schema.sql       Datenbankschema + alle Serverfunktionen
dev/                      lokaler Testserver + automatisierter Browsertest (nicht für den Betrieb nötig)
```

## Lokale Entwicklung & Tests (optional)

Voraussetzungen: Node.js ≥ 18, PostgreSQL ≥ 14, Playwright.

```bash
createdb praktikum
psql -d praktikum -c "create role anon nologin; create role authenticated nologin;"
psql -d praktikum -f supabase/schema.sql
psql -d praktikum -c "select app.set_access_codes('test-seite', 'Test-Code');"
cd dev && npm install
DATABASE_URL=postgres://localhost/praktikum node server.mjs   # http://localhost:8080
DATABASE_URL=postgres://localhost/praktikum node e2e.mjs   # zweites Terminal; Werte ggf. über SITE_PASSWORD / TEACHER_CODE
```

Der Entwicklungsserver bildet die Supabase-Schnittstelle (`/rest/v1/rpc/…`) nach und ruft die
Funktionen als Rolle `anon` auf – genau wie Supabase.

## Lizenzen der eingebundenen Bibliotheken

* [pdf-lib](https://github.com/Hopding/pdf-lib) 1.17.1 – MIT (`vendor/pdf-lib.LICENSE.md`)
* [@pdf-lib/fontkit](https://github.com/Hopding/fontkit) 1.1.1 – MIT
* Liberation Sans – SIL Open Font License 1.1 (`assets/fonts/LICENSE-OFL.txt`)
* Lexend 5.3.0 (über @fontsource-variable/lexend) – SIL Open Font License 1.1 (`assets/fonts/LICENSE-Lexend-OFL.txt`)
