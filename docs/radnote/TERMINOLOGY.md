# Fachliche Terminologie der Befundbaukästen

Stand: 16.10.2026 · Überarbeitung in Radnote 1.7.2

Die Eingabebegriffe und regelbasierten deutschen Befundtexte orientieren sich an den unten genannten radiologischen Quellen. Die Umsetzung ist eine eigene redaktionelle und technische Bearbeitung. Sie ist keine von der DRG freigegebene oder zertifizierte Befundvorlage. Eine klinische Validierung oder vollständige DIN-Konformität wird damit nicht behauptet.

## Quellen und Zuordnung

| Bereich | Fachliche Grundlage | Anwendung in Radnote |
| --- | --- | --- |
| Struktur und Terminologie | [DRG / AG Informationstechnologie: Strukturierte Befundung](https://agit.drg.de/fachinformationen/strukturierte-befundung/), einschließlich des dort beschriebenen deutschen RadLex | Einheitliche Begriffe, explizite strukturierte Angaben, Trennung von Beschreibung und Beurteilung. Keine Behauptung einer vollständigen RadLex-Kodierung. |
| Natives CCT | DRG/AGIT, konsentierte Vorlage [CT Stroke nativ](https://github.com/DRGagit/ak_befundung/blob/master/templates_final/041807.2.2104072101-ct_stroke_nativ.html) | Hyperdenses Arterienzeichen, Infarktfrühzeichen, chronische postischämische Defekte, mikroangiopathische Marklagerveränderungen; anatomische Erläuterung der zehn ASPECTS-Regionen. |
| Gefäße | DRG/AGIT, konsentierte Vorlage [CT Stroke CTA](https://github.com/DRGagit/ak_befundung/blob/master/templates_final/041807.2.21060911112-ct_stroke_cta.html) | Orientierung an gefäß-, segment- und seitengenauer Beschreibung von Stenose, Verschluss, Dissektion und Aneurysma. CTA-spezifische Aussagen werden nicht automatisch auf die MR-Angiographie übertragen. |
| Röntgen-Thorax | [Fleischner Society: Glossary of Terms for Thoracic Imaging, 2024](https://pubs.rsna.org/doi/10.1148/radiol.232558), DOI 10.1148/radiol.232558; ergänzend [DRG AG Thoraxdiagnostik: Empfehlungen](https://ag-thorax.drg.de/fachinformationen/stellungnahmen-empfehlungen/) und der dort verzeichnete [deutsche Glossarartikel von Wormanns/Hamer, 2015](https://pubmed.ncbi.nlm.nih.gov/26218473/) | Morphologische Beschreibung als Verdichtung, Konsolidierung, retikuläre Zeichnungsvermehrung oder Atelektase. Unspezifisches „Infiltrat“ wird in den generierten Texten vermieden. „Lineare Atelektase“ ersetzt „Plattenatelektase“. Eine Verdichtung allein begründet keine Pneumoniediagnose. |
| Röntgen-Skelett | [AO Surgery Reference: Extraarticular fracture, simple – Definition](https://surgeryreference.aofoundation.org/orthopedic-trauma/adult-trauma/distal-femur/extraarticular-fracture-simple/definition) und die anatomische Gliederung der [AO Surgery Reference](https://surgeryreference.aofoundation.org/) | Frakturlokalisation, Verlauf, Gelenkbeteiligung, Dislokation, Angulation und Konsolidierung werden getrennt beschrieben. Keine zusätzliche automatische AO-Klassifikation. |
| Ösophagographie | [ACR Appropriateness Criteria: Dysphagia](https://acsearch.acr.org/docs/69471/narrative/) zur Untersuchungsabgrenzung; Norton-Gregory et al., [CT Esophagography for Evaluation of Esophageal Perforation, RadioGraphics 2021](https://pubs.rsna.org/doi/10.1148/rg.2021200132), insbesondere die öffentlich zugänglichen Vergleichsbeispiele zur Durchleuchtung | Kontrastmittelpassage, Stenosemorphologie und extraluminaler Kontrastmittelaustritt werden beschrieben. Ein negativer Austrittsbefund wird auf die konkrete Untersuchung begrenzt; daraus wird kein sicherer Ausschluss einer Leckage abgeleitet. Keine Übernahme von CT-Protokollen in den Durchleuchtungsbaukasten. |

Die Quellen bieten unterschiedliche Arten von Orientierung: Begriffsdefinitionen, strukturierte Vorlagen oder Untersuchungsprinzipien. Sie schreiben nicht jeden hier erzeugten deutschen Satz vor. Der Thorax-Entwurf im Entwicklungsordner des DRG-Repositories wurde nicht als konsentierte DRG-Vorlage behandelt.

## Konkrete Änderungen

| Vorher | Jetzt / Regel |
| --- | --- |
| „Fleckige Verschattungen“, „Kein Hinweis auf fokale Infiltrate“ | „Fleckige Verdichtungen“, „Keine fokalen pulmonalen Verdichtungen“. Bei dokumentierter Atelektase wird das übrige beurteilte Parenchym ausdrücklich abgegrenzt. |
| „Plattenatelektase“, „Dystelektase“ | „Lineare Atelektase“, „Subsegmentale Atelektase“. Eine streifige Verdichtung wird nicht automatisch zur Atelektase umgedeutet. |
| „Hyperdenses Mediazeichen“ unabhängig vom ausgewählten Gefäßterritorium | „Hyperdenses Arterienzeichen der A. cerebri …“ mit der ausgewählten Arterie und Seite; andere Gefäße können im Freitext lokalisiert werden. |
| „Alte Infarktnarbe“, „Sulcusverstrich“ | „Chronischer postischämischer Defekt“, „Verstrichene kortikale Sulci“. |
| ASPECTS nur als Kürzel | Kürzel plus anatomische Bezeichnung. Die ASPECTS-Region M1 ist nicht das M1-Segment der A. cerebri media. |
| „Ausdrücklich als altersentsprechend beurteilte Hirnvolumenminderung“ | „Altersentsprechende Hirnvolumenminderung“ nur bei entsprechendem Eintrag. Ein allgemeiner Normalstatus erzeugt keine altersbezogene Liquorraumaussage. |
| „Fraktur am Knochen Radius“, „Frische Pertrochantäre Fraktur“ | „Fraktur des Radius“, „Frische pertrochantäre Fraktur“. Fraktur und Konsolidierungsstadium bleiben getrennt. |
| „Wirbelkörper-Kompressionsfraktur“ als allgemeine Auswahl | „Wirbelkörperfraktur“; Kompression wird nur bei entsprechender morphologischer Angabe ergänzt. |
| Gelenkspaltverschmälerung auch an der Wirbelsäule | Kontextabhängig „Bandscheibenfachverschmälerung“. |
| „Diabetische Osteoarthropathie“ | „Neuropathische Osteoarthropathie (Charcot-Arthropathie)“ ohne automatische Zuschreibung eines Diabetes. |
| „Dichtigkeit beurteilen“ | „Kontrastmittelaustritt beurteilen“. Negativ: „In dieser Untersuchung kein extraluminaler Kontrastmittelaustritt nachweisbar.“ |
| „Konduit“, nicht belegter „Magenkonduit“ | „Ersatzösophagus“; „Mageninterponat“ nur bei ausdrücklich erfasstem Magenhochzug. |
| „Gefäßwandunregelmäßigkeiten“, „Abstrom an A. …“ | „Lumenkonturunregelmäßigkeiten“, „Abstrom im Bereich der A. …“. |
| „Im Vergleich unveränderter Befund: …“ | „Im Vergleich unverändert: …“. Resorbierte bzw. nicht mehr nachweisbare Befunde bleiben als Verlaufsaussage gekennzeichnet. |

## Aussagen und Kompatibilität

- Nicht beurteilte oder nicht ausgewählte Strukturen erhalten keine Normalformulierungen. Aussagen zur begrenzten Beurteilbarkeit und Verdachtsbefunde bleiben ausdrücklich erkennbar.
- MR-angiographische Prozentangaben bleiben geschätzte Lumeneinengungen. Ohne gesonderte Erfassung werden weder NASCET/WASID-Messmethoden noch hämodynamische Relevanz behauptet. Distale Abstromzahlen benötigen weiterhin explizite, konsistente Angaben zu allen drei Unterschenkelarterien.
- Modell-IDs, Favoriten- und Entwurfsformate bleiben kompatibel. Die früheren Schlüssel `noInfiltrate`, `dystelectasis`, `plate`, `hyperdense` und `old` bleiben lesbar, erzeugen aber den überarbeiteten Wortlaut.
- Für das hyperdense Arterienzeichen und Kalottenbefunde werden passende Lokalisationen angeboten. Anatomisch ungeeignete Altwerte bleiben sichtbar, werden markiert und verhindern die direkte Übernahme bis zur Korrektur.
- Freitexte, eigene Textbausteine und manuell bearbeitete Vorschauen werden nicht automatisch sprachlich umgeschrieben. Bei abweichender manueller Vorschau wird die erforderliche Aktualisierung angezeigt.

## Prüfung

`tests/terminology.cjs` enthält 26 gezielte Referenzprüfungen zu Terminologie, Grammatik, anatomischer Zuordnung, Aussagegrenzen und Erhalt manueller Texte. `tests/terminology-ui.cjs` prüft die tatsächlichen Auswahllisten, einen ungültigen Altwert, Übernahme, Versionsanzeige, Neuladen und mobile Darstellung. Hinzu kommen die vollständigen vorhandenen Regel-, Konfigurations- und Browserregressionen über `npm test`.

## Quellenattribution und Lizenz

Die konsentierten Vorlagen des Arbeitskreises Strukturierte Befundung der Deutschen Röntgengesellschaft / AG Informationstechnologie werden im [offiziellen Repository](https://github.com/DRGagit/ak_befundung) unter [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) bereitgestellt; siehe dessen [Lizenz](https://github.com/DRGagit/ak_befundung/blob/master/LICENSE). Die hier darauf gestützte fachliche Anpassung verändert Auswahlbegriffe, Zuordnung und Satzgenerierung und ist als Bearbeitung gekennzeichnet. Die Zuschreibung bedeutet keine Unterstützung oder Freigabe durch die DRG.

Der eigenständige Programmcode von Radnote bleibt unter der MIT-Lizenz. Die genannten Publikationen sind fachliche Referenzen; ihre Abbildungen, vollständigen Tabellen und Artikeltexte werden nicht mitgeliefert.
