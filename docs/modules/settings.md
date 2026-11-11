# Persönliche Konfiguration

In der Seitenleiste unter **Konfiguration** eine JSON-Datei speichern oder laden. Das Format ist unabhängig von der App-Version versioniert (`format: "radnote-settings"`, `version: 2`). `appVersion` dokumentiert die exportierende Version.

Version 1 bleibt lesbar; der Export schreibt Version 2. Die Datei enthält:

- `macros`: Tab- und Wortmakros, Kürzel, Texte, Kategorien und Favoritenmarkierung.
- `templates`: alle eigenen Vorlagendefinitionen samt IDs, Feldreihenfolge, Beschriftungen und Standardtexten. Die eingebauten Vorlagen gehören zur Anwendung und stehen auf jedem Gerät bereit.
- `chestFavorites`: wiederverwendbare strukturierte Befundauswahlen und Makroverweise, im bestehenden Format von `ChestPersistence`.
- `builderFavorites`: strukturierte Favoriten für CT Schädel, Röntgen-Skelett und Breischluck.
- `settings`: Sprache, Theme, ausgewählter Baukasten, ausgewählte Vorlage, Entwurfsspeicherung, Öffnungszustand von Textbausteinen/Tastenkürzeln/Konfiguration, Thorax-Befundstil und automatische Vorschau sowie `builderPreferences` mit Stil/Automatik pro neuem Modul.

Aktuelle Befundtexte, Referenz/Patient, Untersuchungsdatum, Fixierungen und strukturierte Untersuchungsergebnisse sind keine Konfiguration. Sie bleiben in der separaten optionalen lokalen Entwurfsspeicherung. Ein Import verändert vorhandene Editorwerte und Fixierungen nicht. Der Import einer Vorlage kann neue Felder mit den importierten Standardtexten anlegen. Änderungen am Befundstil können die generierte Vorschau aktualisieren; manuelle Vorschauen bleiben durch die vorhandenen Regeln geschützt.

## Importregeln

`config.js` validiert und berechnet den gesamten Import vor Änderungen an der Anwendung. Makros werden nach Kürzel zusammengeführt; importierte Einträge ersetzen dieselben Kürzel. Identische Vorlagen werden wiederverwendet. Abweichende Definitionen mit überlappenden IDs erhalten neue IDs und bei Namenskonflikten einen Importzusatz. Bestehende Vorlagen und eingegebene Texte bleiben erhalten. Die importierte Vorlagenauswahl wird gegebenenfalls auf die neue ID abgebildet. Favoriten werden nach ID zusammengeführt; bei Abweichungen entsteht eine zusätzliche Kopie. Danach werden die importierten Einstellungen angewandt.

Bisherige reine Makrodateien (Array oder Objekt mit `macros`, v1/v2) importieren ausschließlich Makros und ändern keine Vorlagen oder Einstellungen. Unbekannte Konfigurationsversionen, ungültige IDs, doppelte Kürzel, ungültige Felddefinitionen oder Einstellungen werden abgewiesen. Maximale Dateigröße: 50 MB; maximal 1.000 Makros, 100 eigene Vorlagen mit jeweils 30 Feldern und 100 Favoriten je Baukasten nach dem Zusammenführen.

Die Konfiguration wird über die vorhandenen Bibliotheksschlüssel und `radnote-preferences-v1` lokal gespeichert. Bibliotheken und Favoriten bleiben bei gesperrtem Browserspeicher in der laufenden Sitzung nutzbar und exportierbar; der Import weist dann auf die Sitzungsspeicherung hin. Einstellungen benötigen keinen gespeicherten Befundentwurf.

## Baukastenauswahl

`#builder` steuert ausschließlich die Sichtbarkeit der bestehenden Module. Beide bleiben montiert und behalten ihren Zustand. Standard ist `none`; `chest`, `mra`, `head`, `skeleton` und `esophagram` öffnen nur das jeweilige Modul. Die aufklappbaren anatomischen Detailbereiche bleiben erhalten. Die Auswahl wird unabhängig von Patiententexten gespeichert.

## Prüfung

`tests/config.cjs` prüft Format, Altdaten, Zusammenführung, Konfliktkopien, ID-Kollisionen und Grenzen. `tests/config-ui.cjs` prüft vollständigen Datei-Rundlauf in einem frischen Browser, Vorlagen und Favoriten, Einstellungen, Erhalt vorhandener Texte, fehlerhafte Dateien ohne Teiländerungen, Neuladen, Sichtbarkeit und Zustand der Baukästen, Sprachwechsel sowie die mobile Darstellung.
