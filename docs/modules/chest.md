# Röntgen-Thorax-Befundbaukasten

## Integration und Architektur

Der Baukasten ist Bestandteil von Radnote. Er erzeugt ausschließlich `text` mit `reportStructure: "combined"`. Es gibt keine getrennte Beurteilung. Die MR-Angiographie verwendet weiterhin getrennte Abschnitte (`reportStructure: "separate"`).

- `definition.js`: Untersuchungsdefinition, Kategorien, Feldbeschreibungen, Wertelisten und strukturierte Schnellwahlen.
- `state.js`: versioniertes Datenmodell, sichere Wiederherstellung, bewusste Normalmarkierung, Statusableitung und Transformationen für Schnellwahlen.
- `validation.js`: medizinische Plausibilitätsregeln und Bedingungen für aktivierbare Interpretationsvorschläge.
- `generator.js`: reine, deterministische deutsche Textgenerierung. Kein DOM, keine externe KI und keine Netzwerkanfragen.
- `components.js`: wiederverwendbare Formularbausteine ohne Framework.
- `ui.js`: kompakte Befundauswahl links, genau ein Vorschautextfeld rechts, Schnellwahlen, Favoriten und geschützte Übernahme.
- `persistence.js`: persönliche strukturierte Favoriten. Die Speicherung des aktuellen Patientenbefunds erfolgt durch die bestehende Entwurfsspeicherung des Editors.
- `styles.css`: responsive Oberfläche unter Verwendung der vorhandenen Theme-Variablen.
- `../src/editor.html`: schmaler Adapter für Speicherung, Rückgängig, Kopieren, vorhandene Makroverwaltung und Ein-Feld-Übernahme.

`npm run build` bettet die Quellen in `index.html` ein. Die veröffentlichte HTML-Datei ist ohne Server oder zusätzliche Laufzeitabhängigkeiten nutzbar.

## Datenmodell und Bedienung

Alle Kategorien starten als nicht beurteilt. Der ausdrücklich gewählte Normalbefund setzt bewertete Normalmerkmale, aber keine Aussagen über nicht erfasste Devices. Pathologische Auswahlen verdrängen die entsprechenden Normalformulierungen. Eine Seitenauswahl ohne Befund wird nicht als Normalbeurteilung interpretiert.

Erfasst werden Herz, Mediastinum/Aorta, pulmonale Gefäße/Stauung, Lungenparenchym, Atelektasen, Pleura, Überblähung/Emphysem, Bronchien, Hilusregionen, Zwerchfell, Skelett, Weichteile und Devices. Lungenbefunde, Atelektasen, Frakturen und Devices sind wiederholbare Einträge. Pleuraergüsse und Pneumothoraces werden für rechts und links unabhängig dokumentiert.

Technik, Projektion und Beurteilbarkeit wirken auf die Formulierungen. Insbesondere wird eine verbreiterte Herzsilhouette in a.p.-Projektion nicht zur sicheren Kardiomegaliediagnose. Technik wird nur auf Wunsch oder bei relevanten Einschränkungen genannt. Für Device-Lagen werden ausschließlich dokumentierte sichtbare Anteile und Angaben beschrieben.

Voraufnahmen erlauben Verlaufsangaben je Eintrag bzw. je ausgewähltem Merkmal. Ohne Voraufnahme werden keine Verläufe generiert. Das Abschalten des Vergleichs entfernt zuvor gesetzte Verlaufsangaben. Ein nicht mehr nachweisbarer Befund wird als solcher beschrieben, nicht zusätzlich als aktuell vorhanden.

Die drei Stile verwenden dieselben Daten. Nicht beurteilte Strukturen werden auch im ausführlichen Stil nicht als unauffällig ergänzt. Gleichartige beidseitige Befunde werden zusammengefasst, unterschiedliche Grade oder Verläufe bleiben getrennt. Relevante Pathologien stehen vor Normalbefunden; dringliche Merkmale werden priorisiert. Klinische Interpretationen erscheinen nur nach Bestätigung eines aktuell gestützten Vorschlags. Fällt dessen Grundlage weg, verfällt die Bestätigung.

## Eigene Favoriten und Textbausteine

Persönliche Favoriten speichern strukturierte Befundmerkmale und Verweise auf verwendete Textbausteine. Sie speichern keine Patientenzuordnung, keine Voraufnahmedaten oder Verlaufsangaben und keine bestätigten Diagnosen. Projektion, Stil und aktueller Vergleich werden beim Anwenden nicht überschrieben.

Textbausteine existieren ausschließlich in der bisherigen Radnote-Makroverwaltung. Die optionalen Metadaten `category: "chest:<category>"` und `favorite: true` ordnen Einträge zu und machen sie schnell erreichbar. Der Baukasten hält lediglich die ausgewählten Kürzel in `customMacroCodes`; er speichert keine zweite Textbausteinsammlung. Kategorien und Favoriten werden auch im bestehenden JSON-Makroexport erhalten. Alte Makrodateien bleiben kompatibel.

Bekannte widersprüchliche Pleura-Negativa aus Textbausteinen werden zusätzlich geprüft. Beliebiger benutzerdefinierter Freitext wird damit nicht vollständig medizinisch semantisch validiert.

## Manuelle Texte, Übernahme und Speicherung

Die Vorschau besitzt eine generierte Ausgangsversion und eine manuelle Fassung. Änderungen an strukturierten Merkmalen überschreiben eine abweichende manuelle Fassung nicht. Ein Hinweis und eine Übernahmesperre verlangen dann den ausdrücklichen Abgleich durch Neugenerierung. Vor dem Ersetzen wird die manuelle Fassung gesichert; sie lässt sich wiederherstellen. Automatische Aktualisierung kann ausgeschaltet werden.

Die Übernahme schreibt ausschließlich in das bestehende Feld `findings` und öffnet die Thorax-Vorlage mit genau diesem Feld. `impression` wird weder befüllt noch verändert. Bei vorhandenem Zieltext stehen Anhängen, Ersetzen oder Abbrechen zur Wahl. Ohne Zielinhalt erfolgt die Übernahme direkt. Fixierte Textstellen sperren Ersetzen vor jeder Änderung.

Die vorhandene optionale Entwurfsspeicherung speichert Technik, Merkmale, Vergleich, Vorschau und die übrigen Editorwerte gemeinsam lokal im Browser. Rückgängig enthält auch Baukastenänderungen. Ein neuer Bericht setzt die patientenbezogene Auswahl zurück; persönliche Favoriten und Makros bleiben erhalten. Die Anwendung sendet diese Befunddaten nicht an einen Anwendungsserver.

## Validierung

`tests/chest-engine.cjs` prüft Normalbefunde, Seiten, Gruppierung, Grammatik, Projektion, Interpretationsbestätigung, Devices, Verläufe, Plausibilitätskonflikte, Stile, manuelle Texte, Favoriten und Textbausteinverweise.

`tests/chest-ui.cjs` prüft die tatsächlichen Bedienabläufe einschließlich genau eines Vorschautextfelds, Makroverwaltung und Dateiaustausch, Favoriten, Wiederherstellung, Übernahme ohne Änderung der Beurteilung, Fixierungen, Rückgängig und mobiler Dunkeldarstellung. `tests/chest-macros.cjs` prüft außerdem, dass Kürzeländerungen und Löschungen aus der gemeinsamen Makroverwaltung die aktive Auswahl und gespeicherte Favoriten aktualisieren. Die bestehenden MRA- und Editor-Tests bleiben Teil von `npm test`.
