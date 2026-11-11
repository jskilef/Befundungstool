# Fluency Direct und Radnote

Stand: 11.11.2026 · Radnote 1.8.0

## Einrichtung am Arbeitsplatz

1. Die von der Einrichtung freigegebene Fluency-Direct-Desktopinstallation starten. In Chrome den **Solventum Fluency Direct Web Connector** installieren bzw. aktivieren und dessen Zugriff auf die Radnote-Seite prüfen. Bei verwalteten Browsern erfolgt dies gegebenenfalls durch die IT.
2. Radnote vorzugsweise über https://jskilef.github.io/radnote/ öffnen. Bei lokal geöffneten HTML-Dateien prüfen, ob der Browser den Dateizugriff für die Erweiterung erlaubt; Radnote kann diese Berechtigung nicht selbst erteilen.
3. Einen Bericht bzw. eine Vorlage wählen. Für Baukastenberichte zunächst die generierten Texte in die eigentlichen Editorfelder übernehmen.
4. Neben dem gewünschten Editorfeld **Diktieren** anklicken. Der Rahmen und der Hinweis zeigen den aktivierten Diktiermodus. Der Modus gilt auch für Freitext-, kombinierte und eigene Vorlagenfelder.
5. Jetzt das Feld mit der Funktion zum Festlegen des Diktierziels **in Fluency Direct** fixieren. Die konkrete Belegung des Mikrofons bzw. die Befehlsbezeichnung hängt von der installierten Version und Arbeitsplatzkonfiguration ab. Der Radnote-Knopf schaltet ausschließlich den Kompatibilitätsmodus ein; er setzt kein natives Fluency-Direct-Ziel.
6. Mit einem kurzen Testtext in Radnote diktieren, ein anderes Fenster bedienen und erneut diktieren. Das in Fluency Direct angezeigte Ziel prüfen. Anschließend Korrektur, Rückgängig und gegebenenfalls Entwurfsspeicherung testen.
7. Zum Feldwechsel zuerst das native Diktierziel in Fluency Direct lösen, dann das neue Feld wählen und erneut dort festlegen. Radnote beendet den eigenen Modus, wenn das Feld durch einen Vorlagenwechsel ausgeblendet oder entfernt wird. Auch dann muss ein etwaiges natives Ziel in Fluency Direct gelöst werden.

**Diktieren** und **Auswahl fixieren** haben unterschiedliche Aufgaben: Letzteres schützt Text gegen Änderungen und erhält ihn bei einem neuen Bericht. Geschützte Textteile können auch im Diktiermodus nicht überschrieben werden; vor Diktatkorrekturen gegebenenfalls gezielt entsperren.

## Wenn das direkte Diktierziel nicht erkannt wird

Den von Solventum dokumentierten **Speech-Box**-Weg verwenden. Text dort diktieren und in das gewünschte Radnote-Feld übertragen. Im Floating-Modus wird bei der Übertragung das zu diesem Zeitpunkt fokussierte Zielfeld verwendet; deshalb vor der Übertragung in Radnote in das richtige Feld klicken. Alternativ den Text kopieren und einfügen. Welche Sprachbefehle lokal verfügbar sind, bitte in der installierten Fluency-Direct-Hilfe prüfen.

Falls der Connector Radnote nicht erkennt, benötigt die IT/der Hersteller Browser- und Fluency-Direct-Version, Connector-Version, Seitenadresse (HTTPS oder lokale Datei) und die Information, ob freies Diktieren funktioniert und nur das Fixieren scheitert. Die Integration behauptet weder die Erkennung einer installierten Erweiterung noch eine erfolgreiche native Verbindung.

## Implementierte Unterstützung

- Native, benannte `textarea`-Elemente mit stabilen IDs und zugänglichen Feldnamen; keine Ersetzung der Berichtsfelder bei normalen Baukastenaktualisierungen.
- Ein optionaler, nur für die Sitzung aktivierter Modus pro ausgewähltem Editorfeld. Er aktiviert keine eigene Spracherkennung und überträgt keine Audiodaten.
- Automatische Space- und Tab-Makros sind im aktivierten Feld pausiert, damit Diktat-/Korrektursequenzen nicht durch eine zweite Expansion verändert werden. Explizit angeklickte Textbausteine bleiben bedienbar.
- Synchronisation über `input`, `change`, `blur` und Abschluss von Kompositionen. Während der Modus aktiv ist, erkennt eine Abfrage alle 300 ms zusätzliche `.value`-Änderungen ohne Ereignis. Hintergrund-Timer können vom Browser verzögert werden; Fenster-/Sichtbarkeitswechsel und Bedienaktionen lösen zusätzlich einen Abgleich aus. Es wird kein wiederholter Fokus erzwungen.
- Bestehende Entwurfsspeicherung, Undo und Schutz fixierter Textteile werden verwendet. Ein abgewiesener externer Schreibversuch holt den Fokus nicht aus anderen Fenstern zurück.
- Der Modus wird nicht als dauerhaftes natives Diktierziel gespeichert. Bei jedem Start ist das Ziel erneut in Fluency Direct festzulegen.

Es wurde keine öffentlich dokumentierte Fluency-Direct-Web-API zum Setzen des nativen Diktierziels gefunden. Daher werden keine erfundenen SDK-Attribute, proprietären Ereignisse oder unbestätigten Browserprotokolle verwendet. Die Browseranpassungen können die Erkennung unterstützen, garantieren aber keine native Zielbindung.

## Quellen

- [Solventum/M*Modal: Install Web Extension](https://docs.mmodal.com/direct/webextension/install-web-extension.html): Herstellerhinweis auf die Web-Erweiterung.
- [Solventum Fluency Direct Web Connector, offizieller Chrome-Web-Store-Eintrag](https://chromewebstore.google.com/detail/solventum-fluency-direct/phgddhgfnjjaobkeekohieahfingldac): Beschreibung der erweiterten Unterstützung von Webanwendungen. Die Angabe „many web applications“ ist keine Zusage für jede Webanwendung.
- [Solventum: Speech Box](https://hisccapps.solventum.com/docs/ClinicianSolutions/FluencyDirect/en/speech-box.html): alternativer Diktat-/Transferworkflow und Fokusverhalten im Floating-Modus.

Die implementierte Ereignisbehandlung ist eine eigene Browser-Kompatibilitätsmaßnahme, keine vom Hersteller bestätigte SDK-Integration. Getestet werden simulierte externe Textänderungen, Paste, Komposition, Speicherung, Undo, Textschutz und stabile Felder in Chromium. Ein End-to-End-Test mit Fluency Direct unter Windows steht aus.
