# CT Schädel, Röntgen-Skelett und Breischluck

Die drei Untersuchungen sind in Radnotes vorhandenes **Baukasten-Dropdown** integriert. Sie verwenden die bestehenden `ExamComponents`, Theme-Variablen, Formularstile, Editorfelder, Makros, Kopierfunktionen, Fixierungen und die gemeinsame Entwurfsspeicherung. Es gibt keine zweite Anwendung, neue Laufzeitabhängigkeit oder externe KI-Anfrage.

## Dateien und gemeinsame Komponenten

| Datei | Verantwortung |
| --- | --- |
| `schema.js` | Auswahl-, Seiten-, Schweregrad-, Lokalisation-, Messwert-, Verlaufs- und wiederholbare Eingabedefinitionen |
| `registry.js` | Gemeinsame Auswahl aller fünf Baukästen sowie Definitionen und Ausgabeformen der drei neuen Untersuchungen |
| `preview.js` | Gemeinsame Vorschau-Synchronisierung für Thorax, MR-Angiographie und die drei neuen Module |
| `head-definition.js` | CCT-Kategorien, Modi, ASPECTS-Regionen, Parameter und Schnellwahlen |
| `skeleton-definition.js` | 21 Regionen, regionsabhängige Projektionen/Knochen/Befunde, Frakturmasken und Segmente |
| `esophagram-definition.js` | Routine, Achalasie und fünf postoperative Modi, einschließlich Operationsanatomie |
| `state.js` | Schema-basierte Wiederherstellung, Status, Regionswechsel, strukturierte Schnellwahlen und Favoritenauswahl |
| `validation.js` | Gemeinsame und untersuchungsspezifische medizinische Plausibilität, Messwerte und ASPECTS |
| `text.js` | Gemeinsame Sprachhelfer, Seiten, Ausprägung, Aufzählungen und Verlauf |
| `head-generator.js` | Deterministische CCT-Formulierungen und Prioritäten |
| `skeleton-generator.js` | Deterministische regionale Skelettformulierungen und Klassifikationen |
| `esophagram-generator.js` | Deterministische Passage-, Morphologie- und postoperative Formulierungen |
| `generator.js` | Ausgabeform, Stil, Qualitäts-/Vergleichsangaben, Gruppierung, Vorschau und Versionsschutz |
| `ui.js` | Gemeinsame Befundauswahl links, bearbeitbare Vorschau rechts, Favoriten und Übernahmedialog |
| `persistence.js` | Validierte persönliche Favoriten, Konfigurationsimport und Konfliktkopien |
| `types.d.ts` | Typverträge für Status, Messwerte, Vorschau und Untersuchungszustände |
| `styles.css` | Kleine Ergänzungen zu den wiederverwendeten Thorax-Stilen |

`chest/generator.js` und `mra/engine.js` verwenden ebenfalls die gemeinsame Vorschau-Synchronisierung; die bestehenden klinischen Generatoren bleiben erhalten. `src/editor.html` enthält die Adapter für Dropdown, Rückgängig, Entwurf, Einstellungen und die geschützte Übernahme. `writeReportFields` wird gemeinsam von Thorax, MR-Angiographie und den neuen Modulen verwendet. `scripts/build.cjs` bettet sämtliche Quellen in die eigenständig nutzbare `index.html` ein. `settings/config.js` erweitert den bisherigen Konfigurationsexport um Favoriten und Einstellungen aller drei Untersuchungen.

## Datenmodell

Ein Untersuchungszustand enthält `version`, `examinationId`, `mode`, `reportStructure`, `style`, `context`, `findings`, `comparison`, `regionCache`, `preview` und `lastTransfer`.

- `examinationId`: `ct_head_native`, `xray_skeleton` oder `esophagram`. Beim CCT wird eine kontrastmittelgestützte Untersuchung bzw. Verlaufskontrolle zusätzlich in `context.examination` dokumentiert.
- `reportStructure`: CCT und Breischluck `separate`, Skelett `combined`.
- Jede Kategorie beginnt mit `status: "pending"`. Weitere Status sind `normal`, `abnormal` und `limited`. Nicht beurteilte Kategorien erzeugen keine Normalformulierungen.
- Klinische Felder sind über ein gemeinsames Schema definiert. Wiederholbare Blutungen, Infarkte, Frakturen, Läsionen, Implantate, Stenosen und Divertikel liegen in `items`. Für sie sind unabhängige Verlaufsangaben möglich.
- Messwerte bleiben Eingabezeichenketten, bis Zahlenformat und Wertebereich geprüft wurden. Eine leere Zeichenkette bedeutet „nicht dokumentiert“; fehlende Maße werden nicht ergänzt.
- `comparison` enthält Verfügbarkeit und optionales Datum. Verlaufsangaben ohne Voruntersuchung werden blockiert. Beim Deaktivieren des Vergleichs werden die zugehörigen Verläufe entfernt.
- Skelettbefunde werden je Region in `regionCache` getrennt erhalten. Nur die aktuell ausgewählte Region wird generiert und übernommen.
- `preview` hält manuelle Texte, letzte Generierung, Änderungsstatus, automatische Aktualisierung und die vorherige Fassung getrennt.

Die JavaScript-Implementierung validiert den Zustand zur Laufzeit anhand der Definitionen und übernimmt ausschließlich bekannte Felder und Auswahlwerte. Die Typverträge ergänzen diese Prüfungen ohne einen neuen Build-Schritt oder eine TypeScript-Laufzeit einzuführen.

## CT Schädel

**Modi:** Routine, Trauma, Stroke, Verlauf. Die klinischen Fragestellungen Trauma, Ischämie und Verlauf setzen den passenden Schwerpunkt. Der Modus ordnet Kategorien, öffnet relevante Bereiche und bietet passende Schnellzugriffe. Ein Wechsel entfernt keine Befunde. Im Verlaufsmodus stehen bereits erfasste Pathologien vorn.

**Kategorien:** Hirnparenchym; Blutungen; Ischämie/Infarkte; ASPECTS; Liquorräume/Masseneffekt; Raumforderungen; Kalotte/Schädelbasis; Nasennebenhöhlen/Mastoide; extraaxiale Flüssigkeitsansammlungen; Gefäßverkalkungen.

Blutungen können unabhängig mit Typ, Seite, Lokalisation, frei eingebbarer Ausdehnung, Alter/Dichte, Masseneffekt, Ventrikelkompression, Verlagerung und Herniationszeichen beschrieben werden. Bei intrazerebralen Blutungen stehen Ödem und Ventrikeleinbruch zur Verfügung. Eine Dichteangabe ohne Blutungstyp erzeugt keine Blutungsdiagnose.

ASPECTS erfasst C, L, IC, I und M1–M6 getrennt rechts und links. Erst zehn als unauffällig oder frühischämisch bewertete Regionen einer Hemisphäre erlauben einen Zahlenwert. Nicht beurteilte oder eingeschränkt beurteilbare Regionen verhindern die numerische Ausgabe. Frühe Veränderungen und ihre Regionen werden benannt; der Wert ist `10 − betroffene Regionen`. Frühischämische Angaben verdrängen widersprechende Normalformulierungen. Ein natives CT wird nicht als sicherer Ausschluss einer Frühischämie formuliert.

Weitere Regeln verhindern widersprechende Verlagerungsrichtungen, fehlende Richtungs-/Größenangaben und Kombinationen aus fehlendem Masseneffekt mit Shift, Kompression oder Herniation. Drei Größen einer Raumforderung werden nur gemeinsam ausgegeben; aus Dichte/Verkalkungen wird keine Ätiologie abgeleitet. Ein dokumentierter altersentsprechender Volumenverlust ist eine ausdrückliche Auswahl.

## Röntgen-Skelett

**Regionen:** Schädel, HWS, BWS, LWS, Becken, Hüfte, Femur, Knie, Unterschenkel, Sprunggelenk, Fuß, Zehen, Schulter, Klavikula, Humerus, Ellenbogen, Unterarm, Handgelenk, Hand, Finger und Rippen. Das sind 21 Auswahlmöglichkeiten einschließlich der drei getrennten Wirbelsäulenregionen.

**Grundkategorien:** Knochenstruktur, Frakturen, Stellung, Gelenkspalt, Degeneration, Weichteile, regionale Besonderheiten, Wirbelsäulensegmente sowie Implantate. Gelenkspaltformulierungen werden auf passende Regionen begrenzt; die normale Hüftartikulation und Wirbelkörperstellung haben eigene Formulierungen.

**Regionale Masken:** distaler Radius mit Abkippung, Verkürzung, Gelenkbeteiligung und Ulnastyloid; proximaler Humerus mit betroffenen Anteilen; Schenkelhals; pertrochantäre Fraktur; Patella/Tibiakopf/distales Femur; Knöchelfrakturen; Wirbelkörper mit Plattenimpression, Keilform, Höhe und Hinterkante. Mehrere Frakturen und Implantate sind möglich.

Anatomiespezifische Befunde umfassen die geforderten Arthrosen, Luxationen, Patellastellungen, Chondrokalzinose, Fußdeformitäten, Erosionen, Amputationen und degenerativen Wirbelsäulenveränderungen. Bei Amputation sind Strahl und Höhe erforderlich. HWS-, BWS- und LWS-Segmente werden regionsabhängig angeboten; L5/S1 gehört zur LWS.

**Klassifikationen:** Garden wird nur bei sicher beurteilbarer Schenkelhalsfraktur und passender Vollständigkeit, Impaktion/Stellung bzw. Dislokation/Fragmentkontakt ausgegeben. Weber verlangt eine passende Fibulafrakturhöhe relativ zur Syndesmose und bestätigte Beurteilbarkeit. Meyerding verlangt sicher beurteiltes ventrales Gleiten und die passende dokumentierte prozentuale Gleitstrecke. Keine Klasse wird allein aus Region oder Frakturvorhandensein errechnet.

Frakturausschluss und periprothetische Fraktur werden als Konflikt erkannt. Pathologische Stellung, Fraktur, Gelenkspaltverschmälerung oder Degeneration verdrängen die entsprechenden Normaltexte. Materiallage behauptet keine mechanische Stabilität; Konsolidierung wird nur im dokumentierten Umfang beschrieben. Osteomyelitisverdächtige Merkmale ergeben keine gesicherte infektiöse Diagnose.

## Breischluck / Ösophaguspassage

**Modi:** Routine, Achalasie, POEM, Z-POEM, Fundoplikatio, Ösophagektomie und sonstige postoperative Kontrolle. Die Moduswahl setzt keine Pathologien voraus; sie ordnet Kategorien und zeigt passende postoperative Felder. Die Merkmale anderer Modi bleiben gespeichert.

**Kategorien:** Morphologie, Motilität/Passage, Stenosen, Divertikel, Hernien, Reflux, Achalasie-Merkmale, postoperative Anatomie und Extravasation. Kontrastmittel, Position und Aufnahmetechnik können optional beschrieben werden.

POEM betont den gastroösophagealen, Z-POEM den pharyngoösophagealen Übergang und residuelle Divertikel. Nach Fundoplikatio ist die Manschettenkonfiguration verfügbar. Nach Ösophagektomie stehen Anastomose, Konduit, Pyloruspassage und Entleerung zur Verfügung. Ein Magenhochzug wird nur nach ausdrücklicher Dokumentation beschrieben.

Eine Achalasieinterpretation wird erst nach Bestätigung und dokumentierter Kombination aus Dilatation, distaler spitzer Einengung und verzögertem Übertritt ausgegeben. Eine isolierte Passagestörung genügt nicht. Fehlender beobachteter Reflux gilt ausschließlich für die durchgeführte Untersuchung. Extravasation ist nachweisbar, fraglich, nicht sicher beurteilbar oder ausdrücklich nicht nachweisbar; fehlender Nachweis wird nicht aus einem Operationsmodus abgeleitet. Gegensätzliche Passageangaben oder Stenoseformen werden blockiert bzw. Normalformulierungen angepasst.

## Vorschau, Favoriten und Übernahme

Kurz, Standard und Ausführlich verwenden denselben strukturierten Zustand. Kurz lässt bei Pathologien entbehrliche Normaltexte weg und erhält relevante Negativa. Standard liefert kompakte vollständige Sätze. Ausführlich ordnet alle tatsächlich beurteilten Inhalte ihren anatomischen Kategorien zu. Kein Stil ergänzt nicht erfasste Befunde.

Unveränderte automatische Vorschauen folgen den Eingaben. Sobald der Anwender einen Vorschautext bearbeitet, bleibt er bei Strukturänderungen bestehen; eine Änderungsanzeige sperrt die Übernahme bis zum Abgleich. **Neu generieren** sichert die bisherige Fassung, die anschließend wiederherstellbar ist. Bereits übernommene Editor-Texte werden nie live überschrieben.

**In RadNote übernehmen** verwendet bei vorhandenen Zieltexten einen Dialog mit Anhängen, Ersetzen und Abbrechen. Fixierungen werden vor Änderungen sämtlicher Zielfelder geprüft. CCT und Breischluck befüllen Befund und Beurteilung; Skelett befüllt nur Befund und wählt die Ein-Textfeld-Vorlage. Eine bestehende separate Beurteilung bleibt dabei erhalten und wird in der Skelettvorlage ausgeblendet.

Persönliche Favoriten speichern strukturierte Merkmale, Region und Modus. Sie enthalten keine Editor-Patientenzuordnung, keine manuelle Vorschau und keine Vergleichsdaten oder Verläufe. Erfasste strukturierte Freitexte sind Bestandteil der Merkmalsauswahl. Favoriten werden lokal unter `radnote-builder-favorites-v1` und gemeinsam mit den übrigen Bibliotheken im Konfigurationsformat v2 gesichert. Bestehende v1-Konfigurationsdateien und reine Makrodateien bleiben ladbar. Befundstil und automatische Vorschau werden pro Modul auch ohne Befundentwurf gespeichert.

## Tests

`tests/builders-engine.cjs` prüft 43 Regel- und Modellkonstellationen: Normalbefunde, Blutungen, Mikroangiopathie, Infarkte, Hydrozephalus, Raumforderungen, Shift, ASPECTS, alle regionalen Frakturmasken, Arthrosen, Klassifikationen, Implantate, Osteomyelitisverdacht, Wirbelsäule, Reflux, Achalasie, postoperative Modi, Divertikel, Extravasation, Vergleich, Stile, manuelle Vorschau, Favoriten und Konfigurationsvalidierung.

`tests/builders-ui.cjs` prüft die tatsächliche Bedienung aller drei Module: Dropdown, Modi/Schnellzugriffe, ASPECTS, kontextabhängige Masken, manuelle Vorschau und Wiederherstellung, geschützte Übernahme/Abbruch, regionalen Zustand, Vergleich, Undo, neue Berichte, Entwürfe nach Neuladen, Favoritenübertragung in einen frischen Browser sowie mobile Dunkeldarstellung. `npm test` enthält zusätzlich sämtliche bisherigen Thorax-, MRA-, Konfigurations- und Editor-Regressionen.

## Grenzen und Erweiterung

- ASPECTS unterstützt die zehn supratentoriellen Standardregionen; pc-ASPECTS und automatische Bildauswertung sind nicht enthalten.
- Es wird jeweils eine aktive Skelettregion generiert. Andere erfasste Regionen bleiben erhalten und können getrennt angehängt werden.
- Garden, Weber und Meyerding sind dokumentierte, bedingte Ausgaben; eine automatische Frakturklassifikation oder Bildmessung findet nicht statt.
- Die regelbasierte Formulierung ersetzt keine fachliche Prüfung. Die Tests prüfen Softwareverhalten und dokumentierte Textregeln; eine klinische Validierung wird damit nicht behauptet.
- Neue Untersuchungen können Definition, Generator und Registry-Eintrag ergänzen. Felddefinitionen und regionale Erweiterungen sind von Textlogik und UI getrennt. Zusätzliche Frakturklassifikationen benötigen explizite Kriterien und entsprechende Tests.
