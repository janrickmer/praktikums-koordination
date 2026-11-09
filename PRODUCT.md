# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Schülerinnen und Schüler** der Georg-Christoph-Lichtenberg-Schule Kassel in Jg. 9 und Jg. 11 (E-Phase),
  kurz vor und während ihres Betriebspraktikums. Sie registrieren sich, treten mit einem Code ihrer Klasse bei,
  hinterlegen ihren Betriebssteckbrief und schauen während des Praktikums regelmäßig ins Praktikums-Dashboard,
  um Informationen zu ihrem Praktikumsbesuch bzw. Videocall zu erhalten.
- **Lehrkräfte für Politik und Wirtschaft (PoWi)**, die das Praktikum ihrer Klassen koordinieren: Klassen anlegen,
  Schülerdaten einsehen, Praktikumsbesuche (selbst oder durch andere Lehrkräfte) und Videocalls planen,
  Nachrichten hinterlegen, Termine festlegen und exportieren, Passwort-Anfragen beantworten.
- **Besuchende Lehrkräfte** (andere Kolleginnen/Kollegen) nutzen das Portal nicht selbst; sie erhalten eine PDF
  mit den Schülerdaten und dem Gesprächsleitfaden.

## Product Purpose

Das Portal bündelt die Organisation des Schülerbetriebspraktikums an einem Ort: Schüler liefern ihre Praktikumsdaten
selbst, Lehrkräfte sehen alles gesammelt und können Besuche/Gespräche planen und kommunizieren.
Erfolg heißt: vollständige Angaben aller Schüler, jede Schülerin/jeder Schüler weiß rechtzeitig, wie und wann der
Praktikumsbesuch bzw. das Praktikumsgespräch stattfindet, und im Notfall sind alle Kontakte griffbereit.

## Operating Context

- Genutzt auf **Smartphone, iPad und PC** – von Schülern wie von Lehrkräften; keine Gerätegruppe ist nachrangig.
- Schüler öffnen das Dashboard während des Praktikums unterwegs bzw. im Betrieb (häufig am Handy), Lehrkräfte
  arbeiten mit Klassenlisten, Kalender und PDF-Export.
- Zugang über ein gemeinsames Seitenpasswort; Lehrkräfte-Registrierung zusätzlich mit Lehrkräfte-Code.
- Ergebnisse wandern in andere Werkzeuge: PDF für besuchende Lehrkräfte (inkl. Gesprächsleitfaden `assets/gespraechsleitfaden.pdf`),
  .ics-Dateien für digitale Kalender.

## Capabilities and Constraints

- Statische Seite auf GitHub Pages (`https://praktikums-koordination.janrickmer.de`), Daten in Supabase (EU, Frankfurt).
- Vanilla HTML/CSS/JavaScript ohne Build-Schritt; keine externen CDNs, Schriftarten oder Tracker (Datenschutz an Schulen).
- Fachbegriffe, die im Portal genau so heißen: „Betriebssteckbrief“, „Unterkunft während des Praktikums“, „Klassenteam“,
  „Praktikums-Dashboard“, „Praktikumsbesuch / Praktikumsgespräch“, „Verfahren bei Krankheit“,
  „Kontaktinformationen für Notfälle“, „Praktikumsbesuche durch mich“, „Praktikumsgespräche mit Videocall“,
  „Informationen für die besuchende Lehrkraft“.
- Vorgegebene Texte (Hinweis im Praktikumsbesuch-Fenster, Standardtext, Handy-Hinweis in Rot, PDF-Anschreiben) sind
  inhaltlich festgelegt.
- Pflicht-Signale: rote Hinweise für fehlende Angaben (Schüler) bzw. fehlende Informationen (Lehrkraft);
  Koffer-Symbol in der ersten Spalte für Schüler mit abweichender Unterkunft; Kürzel-Größe nach Häufigkeit.

## Brand Commitments

- Keine verbindlichen Vorgaben zu Logo oder Schulfarben (Stand: Entscheidung der koordinierenden Lehrkraft).
- Name: „Praktikumsportal“ der Georg-Christoph-Lichtenberg-Schule Kassel.
- Anrede: Schülerinnen und Schüler werden **durchgehend geduzt**; Lehrkräfte untereinander ebenfalls per „du“
  (siehe PDF-Anschreiben „Liebe Kollegin, lieber Kollege …“).

## Evidence on Hand

- Gesprächsleitfaden/Protokollbogen als PDF (`assets/gespraechsleitfaden.pdf`).
- Keine Fotos, Logos oder Testimonials vorhanden – nicht erfinden.

## Product Principles

1. **Klarheit vor Ausdruck:** Jede Seite beantwortet sofort „Was muss ich als Nächstes tun?“.
2. **Nichts geht verloren:** Fehlende Angaben und fehlende Informationen sind unübersehbar markiert.
3. **Vertrauenswürdig und schulisch seriös:** sensible Schülerdaten, ruhiges und verlässliches Auftreten.
4. **Überall gleich gut:** Handy, iPad und PC sind gleichwertige Arbeitsumgebungen.
5. **Datensparsam:** keine Drittanbieter-Ressourcen, nur nötige Daten.

## Accessibility & Inclusion

- Nutzbar für alle Schülerinnen und Schüler: gut lesbare Schriftgrößen, ausreichender Kontrast, Bedienung per Tastatur
  und Touch; Namen mit Sonderzeichen (z. B. türkisch, polnisch) müssen korrekt dargestellt werden.
- Rot als Signalfarbe darf nie die einzige Information sein (immer mit Text).
