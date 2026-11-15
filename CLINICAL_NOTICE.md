# Clinical and data notice / Hinweise zur klinischen Nutzung und zu Daten

These notices describe intended use and operational limitations. They do not add restrictions to the MIT License or limit rights in report text or other user-created content.

## Deutsch

Befundungstool ist ein Texteditor für die Erstellung radiologischer Befunde. Es interpretiert keine Bilddaten, stellt keine Diagnosen und prüft keine Befunde auf medizinische Richtigkeit. Eine regulatorische Zulassung oder Zertifizierung für die klinische Nutzung wird nicht behauptet.

Textbausteine, Baukasten-Formulierungen und KI-Vorschläge sind Hilfen. Jeder Befund einschließlich eingefügter Textbausteine, übernommener Baukastentexte, übernommener KI-Änderungen und aus vorherigen Befunden übernommener fixierter Texte muss vor der Freigabe ärztlich auf Richtigkeit, Vollständigkeit und Patientenzuordnung geprüft werden.

Ohne gewählten KI-Anbieter überträgt die Anwendung keine Befundtexte. Bei aktivierter Entwurfsspeicherung werden Befundtexte im lokalen Browserspeicher abgelegt. Textbausteine, Vorlagen, Favoriten und Einstellungen werden ebenfalls lokal gespeichert. API-Schlüssel werden nie im Klartext gespeichert, sondern nur verschlüsselt: in der Konfigurationsdatei und, sofern nicht „Vergessen“ gewählt wird, als passwortgeschützte Kopie im Browser. Browserdaten sind keine verlässliche Datensicherung und können auf gemeinsam genutzten Geräten zugänglich sein. Kopieren, Exportieren und Drucken erzeugen weitere Kopien.

**KI-Prüfung:** Erst beim Klick auf Prüfen oder Überarbeiten wird der Befund verarbeitet; Verbindung testen sendet nur einen kurzen festen Testtext. In API-Modi werden Befundtext, Abschnittsnamen und Vorlagenhinweise an den angezeigten Endpunkt gesendet; dafür gelten die Bedingungen des jeweiligen Anbieters. In Browser-Modi läuft die Verarbeitung auf diesem Gerät, Laufzeit- und Modelldateien werden jedoch aus dem Internet geladen. Nur anonymisierte Texte und institutionell freigegebene Dienste verwenden. KI-Ergebnisse können Fehler, Auslassungen oder erfundene Inhalte enthalten; die Hervorhebung von Änderungen kann wichtige Änderungen übersehen.

Bei gehosteter Nutzung kann der Hostinganbieter Verbindungsdaten verarbeiten. Nutzer und Betreiber müssen die für ihren Einsatz geltenden Datenschutz-, Sicherheits- und klinischen Anforderungen prüfen. Patientendaten dürfen nur in einer dafür geeigneten und freigegebenen Umgebung verarbeitet werden.

## English

Befundungstool is a text editor for drafting radiology reports. It does not interpret imaging, diagnose conditions, or verify reports for medical accuracy. No regulatory approval or certification for clinical use is claimed.

Macros, builder wording and AI suggestions are aids. A clinician must review every report, including inserted macros, transferred builder text, applied AI changes and frozen text carried over from previous reports, for accuracy, completeness, and the correct patient before finalizing it.

Without a selected AI provider, the application does not transmit report text. Enabling draft saving stores report text in local browser storage. Macros, templates, favorites and settings are also stored locally. API keys are never stored in plaintext, only encrypted: in the configuration file and, unless you choose Forget, as a password-protected copy in the browser. Browser storage is not a reliable backup and may be accessible on shared devices. Copying, exporting, and printing create additional copies.

**AI review:** report text is processed only when you click Review or Revise; Test connection sends only a short fixed test text. API modes send report text, section labels and template notes to the displayed endpoint, under that provider's terms. Browser modes process text on this device but download runtime and model files from the internet. Use de-identified text and institution-approved services only. AI output can contain errors, omissions or fabricated content; change highlighting can miss clinically important edits.

When hosted, the hosting provider may process connection data. Users and operators must assess the privacy, security, and clinical requirements applicable to their use. Process patient data only in an appropriate, approved environment.
