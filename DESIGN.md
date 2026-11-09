---
name: Praktikumsportal GCLS Kassel
description: Das Praktikumsheft der Klasse – kariertes Heftpapier, Heftumschlag in Klassenfarbe, roter Korrekturrand für Fehlendes.
colors:
  cover-blue: "#2a5fd0"
  cover-green: "#17804b"
  cover-orange: "#c25510"
  cover-violet: "#9b2c8f"
  ink-band: "#1d2633"
  paper: "#f5f7fa"
  sheet: "#ffffff"
  sheet-tint: "#f1f4f8"
  line: "#e0e5ec"
  line-strong: "#c6cfdb"
  ink: "#17202b"
  ink-secondary: "#465163"
  ink-muted: "#5f6a7b"
  correction-red: "#b3132b"
  margin-red: "#e0475c"
  correction-soft: "#fdeef0"
  done-green: "#146c42"
  done-soft: "#e4f3ea"
  attention-amber: "#855000"
  attention-soft: "#fff2d6"
  calendar-red: "#c8322a"
typography:
  display:
    fontFamily: "Lexend, system-ui, sans-serif"
    fontSize: "clamp(1.9rem, 8.4vw, 4.25rem)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Lexend, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 1.2rem + 2.2vw, 2.75rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Lexend, system-ui, sans-serif"
    fontSize: "1.12rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.012em"
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.93rem"
    fontWeight: 600
    lineHeight: 1.4
  numeral:
    fontFamily: "Lexend, system-ui, sans-serif"
    fontSize: "6rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontFeature: "\"tnum\""
rounded:
  sm: "6px"
  label: "9px"
  md: "10px"
  pill: "999px"
spacing:
  xs: "0.35rem"
  sm: "0.6rem"
  md: "1rem"
  lg: "1.25rem"
  xl: "1.75rem"
components:
  button-primary:
    backgroundColor: "{colors.cover-blue}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.sm}"
    padding: "0.62rem 1rem"
    height: "2.75rem"
  button-secondary:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.62rem 1rem"
    height: "2.75rem"
  button-on-band:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink-band}"
    rounded: "{rounded.sm}"
    padding: "0.62rem 1rem"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.62rem 0.75rem"
    height: "2.75rem"
  sheet:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "1.25rem 1.35rem"
  etikett:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.label}"
    padding: "0.7rem 1rem 0.55rem"
  tag:
    backgroundColor: "{colors.sheet-tint}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.pill}"
    padding: "0.2rem 0.55rem"
---

# Design System: Praktikumsportal GCLS Kassel

## Overview

**Creative North Star: "Das Praktikumsheft"**

Das Portal ist das Heft, das jede Klasse für ihr Betriebspraktikum führt. Der Grund ist kühles, fein kariertes Heftpapier; oben liegt der Heftumschlag in der Farbe der Klasse, und auf ihm klebt ein weißes Etikett mit Name, Klasse und Fach. Wo etwas fehlt, steht – wie bei einer Korrektur – der rote Rand. Sobald alles eingetragen ist, verschwindet er.

Es ist eine Arbeitsoberfläche (Schüler pflegen Daten und lesen Termine, Lehrkräfte koordinieren Klassen), deshalb bleiben Navigation, Tabellen, Formulare und Buttons die gewohnten Web-Bedienelemente. Die Welt „Schulheft“ wirkt nur über Farbe (Umschläge, Papier, Korrektur-Rot), Schrift (Lexend für Überschriften und Etiketten), Dichte und das eine Signaturmerkmal, den Korrekturrand. Smartphone, iPad und PC sind gleichwertig; Hell- und Dunkelmodus folgen dem Gerät.

**Key Characteristics:**
- Kopfband in der Umschlagfarbe der Klasse (Lehrkräfte-Übersicht: dunkles Band), Inhalt auf kariertem Papier.
- Weiße Blätter mit sanftem Schatten; Identitätsdaten auf Etiketten mit Schreiblinien.
- Roter Korrekturrand ausschließlich für fehlende Angaben, immer zusammen mit Text („fehlt noch“).
- Großes Abreiß-Kalenderblatt für feste Termine.
- Eigenes, einheitliches SVG-Icon-Set (24er-Raster, Strichstärke 1,75).

## Colors

Kühles Papier und tiefe Tinte als ruhiger Grund; die Farbe gehört den Heftumschlägen und dem Korrektur-Rot.

### Primary
- **Umschlag Blau** (cover-blue): Standard-Umschlag und erste Klassenfarbe; Kopfband, Primär-Buttons, Fokus, Auswahl, Kalendertermine.
- **Umschlag Grün, Orange, Violett** (cover-green, cover-orange, cover-violet): weitere Klassenfarben. Die vier Farben sind paarweise auch bei Farbsehschwäche unterscheidbar geprüft (alle Paare, hell und dunkel) und tragen weiße Schrift mit mindestens 4,5:1.

### Secondary
- **Korrektur-Rot** (correction-red) für Text und **Rand-Rot** (margin-red) für die Randlinie: nur fehlende Angaben und Fehler. **Korrektur-Rosa** (correction-soft) als Fläche von Fehlermeldungen.

### Tertiary
- **Kalender-Rot** (calendar-red): ausschließlich Kopf und Uhrzeit des Kalenderblatts.
- **Erledigt-Grün** (done-green / done-soft): „vollständig“, ausgegebene Einmal-Codes.
- **Hinweis-Bernstein** (attention-amber / attention-soft): offene Passwort-Anfragen, „Lehrkraft offen“.

### Neutral
- **Heftpapier** (paper) mit 20-px-Karo in rgba(64, 98, 148, 0.12): Seitengrund.
- **Blatt** (sheet) und **Blatt getönt** (sheet-tint): Flächen, Tabellenköpfe, ruhige Kästen.
- **Linie** (line) / **Linie kräftig** (line-strong): Trennlinien, Eingabefeld-Rahmen, Etikett-Schreiblinien.
- **Tinte** (ink), **Tinte 2** (ink-secondary), **Tinte gedämpft** (ink-muted): Text in drei Stufen; gedämpft nur für Bezeichnungen und Nebeninformation.
- **Lehrkräfte-Band** (ink-band): Band der Lehrkräfte-Übersicht, des Kalenders und des Profils.

### Named Rules
**The Correction Ink Rule.** Rot bedeutet „fehlt“ oder „Fehler“ – sonst nichts. Keine roten Dekorationen, keine roten Status für Anfragen oder Hinweise.

**The Cover Rule.** Jede Klasse besitzt genau eine Umschlagfarbe; sie färbt Band, Primär-Buttons, Fokus, Auswahl und Termine dieser Klasse. Der Klassenname steht immer dabei – Farbe ist nie die einzige Information.

**The Dark Cover Rule.** Im Dunkelmodus wird das Umschlag-Band zu 28 % abgedunkelt, damit es nicht heller leuchtet als der Inhalt.

## Typography

**Display Font:** Lexend (selbst gehostet, variable Strichstärke; Fallback system-ui)
**Body Font:** System-Sans (system-ui, -apple-system, Segoe UI, Roboto)

**Character:** Lexend gibt Überschriften, Etiketten, Codes und Zahlen eine klare, schulische Lesbarkeit; der Fließtext bleibt in der vertrauten Systemschrift jedes Geräts.

### Hierarchy
- **Display** (600, clamp(1.9rem, 8.4vw, 4.25rem), 1): nur der Wortmarken-Titel auf dem Einstiegs-Umschlag.
- **Headline** (600, clamp(1.75rem, 1.2rem + 2.2vw, 2.75rem), 1.2): Seitentitel im Kopfband.
- **Title** (600, 1.12rem, 1.2): Titel der Blätter.
- **Body** (400, 16px, 1.55): Fließtext; Nachrichten auf höchstens 68ch.
- **Label** (600, 0.93rem): Feldbezeichnungen; Bezeichnungen in Datenlisten und Etiketten in Tinte gedämpft (0.8–0.9rem).
- **Numeral** (700, 6rem, Tabellenziffern): der Tag auf dem Kalenderblatt.

### Named Rules
**The Tabular Rule.** Zahlen, Uhrzeiten, Entfernungen und Codes stehen in Tabellenziffern; Codes zusätzlich gesperrt (0.12–0.14em) in Lexend.

**The One Display Voice Rule.** Lexend nur für Überschriften, Etikett-Werte, Kürzel, Codes und Zahlen – nie für Fließtext.

## Layout

Inhalte stehen in einer zentrierten Spalte von höchstens 1180 px mit seitlichem Abstand clamp(16px, 4vw, 32px). Jede Seite beginnt mit dem Kopfband (Seitentitel, optional Reiter-Navigation, Brotkrumen und rechts Etikett oder Aktionen); bei Einzelformularen ragt das Formularblatt in das Band hinein. Darunter folgen Blätter im Abstand von 1.25rem.

Das Schüler-Dashboard nutzt oben zwei Spalten (7 : 5 – Betriebssteckbrief | Unterkunft + Klassenteam), dann „Praktikumsbesuch / Praktikumsgespräch“ in voller Breite mit Kalenderblatt rechts, dann zwei Spalten (Krankheit | Notfallkontakt). Unter 860 px wird alles einspaltig in derselben Reihenfolge. Die Lehrkräfte-Schülerliste ist auf dem Desktop eine Tabelle und unter 640 px eine gestapelte Liste (Name; Betrieb + km; Ort; Besuch; Termin + Status). Der Wochenkalender zeigt auf dem Handy zuerst die Terminlisten.

## Elevation & Depth

Flache Papierwelt mit zwei Höhen: Blätter liegen mit einem weichen Schatten auf dem karierten Grund; nur was wirklich schwebt (Meldungen, geöffnetes Nachrichten-Fenster, Kalenderblatt, Hefte beim Überfahren, Speicherleiste) bekommt einen tieferen Schatten.

### Shadow Vocabulary
- **Blatt** (`box-shadow: 0 1px 2px rgba(23,32,43,.05), 0 3px 10px -4px rgba(23,32,43,.08)`): alle Blätter und Hefte in Ruhe.
- **Schwebend** (`box-shadow: 0 14px 34px -10px rgba(23,32,43,.32), 0 3px 8px rgba(23,32,43,.12)`): Meldungen, Nachrichten-Fenster, Speicherleiste, Heft-Hover.
- **Etikett** (`box-shadow: 0 1px 0 rgba(0,0,0,.12), 0 8px 22px -12px rgba(0,0,0,.45)`): Etiketten auf dem Umschlag.

## Shapes

Sanfte Ecken: Bedienelemente 6 px, Etiketten 9 px, Blätter 10 px, Kalenderblatt 14 px, Tags und Kürzel-Auswahl voll gerundet. Hefte haben eine dunklere Bindung links (14 px, 70 % Umschlagfarbe) und asymmetrische Ecken (8 px am Rücken, 12 px vorne); die Einstiegsseite wiederholt die Bindung am linken Bildschirmrand.

## Components

### Buttons
- **Shape:** sanft gerundet (6px), Mindesthöhe 2.75rem (klein 2.25rem).
- **Primary:** Umschlagfarbe mit weißer Schrift; Hover 14 % dunkler.
- **Secondary:** weißes Blatt mit kräftiger Linie; Hover getönt.
- **Ghost:** transparent, Text in der Umschlag-Tinte; Hover mit zartem Umschlag-Ton.
- **Im Band:** halbtransparent weiß (12 %) bzw. massiv weiß für die Hauptaktion.
- **Press:** scale(0.97) in 160 ms; Hover-Effekte nur bei Maus/Trackpad.
- **Auf dem Handy (< 600 px):** Buttons in Kopfzeile und Blattköpfen zeigen nur ihr Icon; die Beschriftung bleibt unsichtbar für Screenreader erhalten.

### Chips
- **Kürzel-Chips:** Lexend 600, Umschlag-Ton als Fläche, Umschlag-Tinte als Schrift, 6 px Ecken.
- **Tags:** voll gerundet, mit Icon; neutral, Umschlag-Ton, Bernstein (Hinweis) oder gedämpft.

### Cards / Containers
- **Blatt:** weiß, 1 px Linie, 10 px Ecken, Polsterung 1.25rem 1.35rem (Handy 1.1rem), Schatten „Blatt“.
- **Heft (Klasse):** Fläche in Umschlagfarbe mit Bindung, darauf Etikett mit Klassenname (Lexend 1.6rem), Jahrgang und Code; Zähler mit Icons in Weiß; Hinweis-Pille weiß mit roter Schrift nur bei fehlenden Informationen.

### Inputs / Fields
- **Style:** weiß, 1 px kräftige Linie, 6 px Ecken, Höhe 2.75rem.
- **Focus:** Rahmen in Umschlagfarbe plus 3 px Ring (22 % Umschlagfarbe).
- **Error:** Meldung als Korrektur-Rosa-Fläche mit Korrektur-Rot-Text unter dem Formular.
- **Auswahl:** Radio-Karten mit Umschlag-Ton im gewählten Zustand.

### Navigation
- Kopfzeile in Bandfarbe: Heft-Wortmarke links, Benutzer und Aktionen rechts (auf dem Handy nur Icons, Beschriftung bleibt für Screenreader erhalten).
- Lehrkräfte: Reiter im Band („Meine Klassen“, „Kalender“, „Profil & Notfallkontakt“), aktiver Reiter mit weißer Unterstreichung; Brotkrumen darunter.

### Etikett (Signatur)
Weißes Etikett mit Schreiblinien (Bezeichnung in Tinte gedämpft 0.8rem, Wert in Lexend 500) – für Name/Klasse/Fach im Dashboard, für den Beitrittscode in der Klasse, für das Passwortfeld auf dem Umschlag.

### Korrekturrand (Signatur)
Dashboard-Blätter tragen einen blassen gedruckten Rand (1 px, 38 % Rand-Rot) in 2.6rem Abstand (Handy 2rem). Fehlt etwas, liegt darüber die rote Korrekturlinie (2 px) mit Warn-Icon in der Randspalte je fehlender Zeile und „fehlt noch“ im Wertfeld. Wird ein Bereich vollständig, zieht sich die rote Linie einmalig zurück (900 ms, ease-in-out) und „vollständig“ erscheint. In der Schülertabelle ist die Icon-Spalte der Heftrand.

### Kalenderblatt
Abreißkalender mit Kalender-Rot-Kopf (Monat/Jahr), Ringen, Wochentag, großem Tag (Numeral), roter Uhrzeit und Detailliste; Button „In meinen Kalender übernehmen (.ics)“.

## Do's and Don'ts

### Do:
- **Do** gib jeder Klasse eine der vier Umschlagfarben und setze den Klassennamen immer daneben.
- **Do** markiere fehlende Angaben mit Korrekturrand **und** Text („fehlt noch“, „n fehlen“).
- **Do** setze Identitätsdaten (Name, Klasse, Code) auf ein Etikett mit Schreiblinien.
- **Do** verwende für neue Icons das eigene Set (24er-Raster, Strichstärke 1,75, currentColor).
- **Do** halte Animationen kurz und selten: Buttons 160 ms, Meldungen 240 ms, nur der Korrekturrand hat einen längeren, einmaligen Moment; reduzierte Bewegung respektieren.

### Don't:
- **Don't** verwende Rot für irgendetwas anderes als Fehlendes oder Fehler.
- **Don't** setze kleine Überschriften-Labels („Eyebrows“) über Seiten- oder Blatt-Titel; Zusatzinfos gehören ins Etikett oder in die Unterzeile.
- **Don't** nutze Unicode-Zeichen oder Emoji als Icons.
- **Don't** lade Schriften, Bilder oder Skripte von fremden Servern.
- **Don't** ersetze Tabellen oder Formulare durch Heft-Linien-Kostüme – die Welt wirkt nur über Farbe, Schrift, Dichte und den Korrekturrand.
