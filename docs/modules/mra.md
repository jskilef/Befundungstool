# Arterielles MR-Angiographie-Modul

## Architektur

- `anatomy.js`: unabhängige Definitionen der 12 Regionen und 101 Gefäßabschnitte. Jeder Abschnitt hat eine stabile ID, eine Basis-ID, Seite, Regionszuordnungen und eine explizite Genitivform. `selectedVessels` arbeitet ausschließlich mit den ausgewählten Regionen; `groups` verhindert doppelte Zeilen und stellt bei beidseitiger Auswahl die oberen Extremitäten gemeinsam dar.
- `engine.js`: untersuchungsspezifische Konfiguration (`arterial-mra`), versioniertes Zustandsmodell, Validierung und reine deutsche Textgenerierung. Kein DOM, keine Speicherung und keine Netzwerkanfragen. Die Anatomiedaten sind für spätere CTA-/Venographie-Module wiederverwendbar; Befundoptionen und Textregeln müssen dafür gesondert konfiguriert werden.
- `ui.js`: Regionsauswahl, Gefäßmatrix, Status, Läsionsdetails und bearbeitbare Vorschau. Der Adapter erhält vom Editor Funktionen für Zustandszugriff, Aktualisierung, Kopieren und Textübernahme.
- `styles.css`: kompakte Oberfläche mit Rechts-links-Matrix und responsiven Detailfeldern.
- `theme.css`: gemeinsame Variablen für Hell/Dunkel/System, einschließlich des bestehenden Editors.
- `../src/editor.html`: vorhandener Editor mit schmaler MRA-Integration. `reportState`, lokale Entwürfe und Rückgängig enthalten auch `mraState`.
- `../scripts/build.cjs`: bettet die Module in `index.html` ein. Die veröffentlichte Datei bleibt vollständig eigenständig und ohne Laufzeitabhängigkeiten.

Änderungen am Editor in `src/editor.html` vornehmen; `index.html` anschließend mit `npm run build` erzeugen. Nicht ausschließlich die generierte Datei bearbeiten.

## Dokumentationsregeln

Die Auswahl einer Region bietet ihre Gefäße an und setzt keine Normalbefunde. Jeder Gefäßabschnitt beginnt mit `pending`. `normal`, `abnormal` und `unassessable` werden nur ausdrücklich gesetzt. Der Textgenerator filtert immer erneut nach der aktuellen Regionsauswahl; abgewählte Gefäße bleiben zum späteren Wiederaufnehmen im Entwurf, erscheinen aber nicht im Text.

Optionale Abschnitte (z. B. Aortenwurzel und akzessorische Nierenarterien) müssen zunächst einzeln beurteilt werden und werden bei einer pauschalen Normalmarkierung nicht automatisch eingeschlossen.

Läsionen werden als Liste pro Gefäß gespeichert. Stenosegrade, pathologische Morphologie, Lokalisation, Maße, Ausdehnung, Kollateralen, Rekonstitution und Abstrom sind voneinander unabhängige, ausdrücklich dokumentierte Angaben. Eine nicht gewählte Zusatzangabe wird nicht ergänzt. Grad-/Prozentkonflikte, unvollständige Läsionen und ungültige Maße sperren die Übernahme, bis die Eingabe korrigiert wurde.

Eine Abstromzahl wird nur ausgegeben, wenn für A. tibialis anterior, A. tibialis posterior und A. fibularis derselben Seite jeweils explizit ein durchgängiger oder fehlender distaler Abstrom dokumentiert wurde. Eine Normalmarkierung oder ein Verschluss allein wird nicht zu einer Abstromzahl umgedeutet. Bei dokumentiertem distalem Abstrom trotz proximalem Verschluss zählt die explizite distale Durchgängigkeit. Widersprüchliche Abstromangaben desselben Gefäßes sperren die Übernahme bis zum Abgleich; aus reduzierten oder nicht beurteilbaren Abstromangaben wird keine Gefäßzahl abgeleitet.

Die Beurteilung priorisiert Dissektion, vollständigen/subtotalen Verschluss, Thrombose, Aneurysma und höhergradige Stenosen. Diese feste Reihenfolge ist eine Sortierregel; sie nimmt keine undokumentierte Akuität an.

## Manuelle Texte und Übernahme

Die Live-Vorschau aktualisiert sich automatisch, solange sie nicht manuell verändert wurde. Nach manueller Bearbeitung bleiben die Texte erhalten. Weitere Strukturänderungen zeigen einen Hinweis; die Übernahme ist bis zur bestätigten Neugenerierung gesperrt. Dies verhindert, dass ein veralteter Vorschautext unbemerkt als aktueller strukturierter Befund übernommen wird.

Der Übernahmedialog bietet Anhängen (Standard) oder Ersetzen in den bestehenden Feldern Befund und Beurteilung an. Leere Vorschautexte löschen keine bestehenden Texte. Ersetzen bei vorhandenen Fixierungen wird vor jeglicher Änderung abgelehnt. Nach der Übernahme bleiben die Editor-Texte frei bearbeitbar und werden durch Strukturänderungen nicht berührt.

Die vorhandene optionale Entwurfsspeicherung speichert Regionen, Gefäßbefunde, Vorschautexte und die übrigen Editorfelder gemeinsam im Browser. Ein neuer Bericht setzt die MRA-Untersuchung zurück. Rückgängig stellt sowohl Editorwerte als auch die strukturierte Untersuchung wieder her. Es gibt keine serverseitige Patientendatenspeicherung.

## Tests

`tests/mra-engine.cjs` prüft Anatomie, Regionsgrenzen, Deduplication, Seiten, Normalbefunde, optionale Abschnitte, Mehrfachläsionen, Verschlüsse, Einschränkungen, nicht untersuchte Abschnitte, Grammatik, Maße, Priorisierung, Abstromregeln, Validierung und Zustandssicherung.

`tests/mra-ui.cjs` prüft Regionsauswahl, Detailerfassung, Entwurf/Wiederherstellung, manuelle Texte, Übernahme, Fixierungen, Rückgängig, Reset, Dark Mode und mobile Darstellung. Die bisherigen vier Browser-Suiten bleiben Bestandteil von `npm test`.
