# Prix du fioul

Der wöchentliche nationale Durchschnittspreis für **Heizöl in Frankreich** in
Gladys, veröffentlicht vom französischen Ministerium für ökologischen Wandel
(DGEC, _Direction générale de l'énergie et du climat_), damit du weißt, wann
du deinen Tank füllen solltest.

Der Dienst ist französisch: Es sind französische Landesdurchschnitte in Euro
pro Liter, inklusive Steuern, für Lieferungen von 2.000 bis 4.999 Litern. Es
ist **nicht der Preis deines Lieferanten**: Die Werte zeigen den Trend und das zu
erwartende Niveau.

Nicht mit dem französischen Ministerium verbunden. Entwickelt ohne Tank und
ohne Lieferantenkonto, mit den öffentlichen Daten: Rückmeldungen willkommen.

## Was du bekommst

- Ein Gerät **Heizölpreis**: der Preis in €/l, seine Änderung in einer Woche
  in %, der Mittelwert des Vormonats, die geschätzten Kosten einer Füllung
  (mit der Menge, die du gewöhnlich bestellst) und die Woche der Erhebung.
- Optional ein zweites Gerät mit den **Kraftstoffen** derselben Datei
  (Diesel, Super E10, Super E5, Super Plus 98, E85, Autogas, Agrardiesel):
  Preis und Wochenänderung von jedem.
- Ein Szenen-Auslöser **Neuer Heizölpreis**, einmal pro Woche, nach Trend
  filterbar (gesunken, stabil, gestiegen), mit einer fertigen Zusammenfassung
  für eine Nachricht.
- Ein Dashboard-Widget: der Preis, sein Trend, die Kosten einer Füllung, die
  Kurve der letzten sechs Monate und der Mittelwert des Vormonats.

## Voraussetzungen

- Gladys 5.3.0 oder neuer.
- Internetzugang von Gladys aus (`www.ecologie.gouv.fr`).
- Kein Konto und kein Schlüssel.

## Installation

Öffne in Gladys **Integrationen → Von GitHub installieren** und gib die
Adresse des Repositorys ein: `https://github.com/guim31/gladys-fioul`.

## Konfiguration

| Feld                           | Wirkung                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Liter einer Füllung (optional) | Die Menge, die du gewöhnlich bestellst, für die geschätzten Kosten einer Füllung (Preis × Liter, ganze Euro). 0: keine Kostenfunktion.                  |
| Auch Kraftstoffe (optional)    | Die Landesdurchschnitte der Kraftstoffe derselben Datei, auf einem zweiten Gerät. Standardmäßig keine.                                                  |
| Sprache der Namen              | Sprache der Geräte- und Funktionsnamen (beim Hinzufügen festgelegt), des Wochendatums und der Zusammenfassung des Auslösers. Standardmäßig Französisch. |

Öffne danach den Reiter **Entdeckung** der Integration und füge die Geräte
hinzu. Wenn du die Liter oder die Kraftstoffe änderst, ändern sich die
Geräte: Gladys bietet dann im Reiter Entdeckung an, sie zu **aktualisieren**.

## Geräte

### Heizölpreis

| Funktion                            | Typ              | Beispiel (Woche vom 13.11.2026) |
| ----------------------------------- | ---------------- | ------------------------------- |
| Preis inkl. Steuern (€/l)           | Währung, Euro    | 1,703                           |
| Änderung in 1 Woche (%)             | Währung, Prozent | −1,7                            |
| Mittel des Vormonats (€/l)          | Währung, Euro    | 1,9253 (Oktober)                |
| Geschätzte Kosten einer Füllung (€) | Währung, Euro    | 2555 (1.500 Liter)              |
| Woche der Erhebung                  | Text             | Woche vom 13.11.2026            |

Gladys hat keine Einheit €/l: Die Preisfunktionen zeigen ein Euro-Zeichen,
und ihr Name sagt „pro Liter“.

### Kraftstoffpreise – Mittel Frankreich

Für jeden gewählten Kraftstoff: sein Preis in €/l und seine Wochenänderung in
%, dann die Woche der Erhebung.

## Szenen

### Preis unter einer Schwelle

Kein besonderer Auslöser nötig: Wähle in einer Szene **Gerätewert** auf der
Preisfunktion, zum Beispiel „Preis inkl. Steuern (€/l) kleiner als 1,20“.

### Ein Rückgang um N %

Dasselbe mit der Änderung: „Änderung in 1 Woche (%) kleiner als −3“ startet
die Szene, wenn der Preis in der Woche um mehr als 3 % gesunken ist.

### Neuer Heizölpreis

Löst einmal pro Woche aus, wenn das Ministerium eine neue Woche
veröffentlicht (nie für die Woche, die beim Start der Integration schon
bekannt ist). Filter: der Trend der Woche (gesunken, stabil, gestiegen; leer
für alle). Variablen: `price` (€/l), `change` (%), `trend` (`down`, `stable`
oder `up`), `fill_cost` (€, 0 ohne Liter), `week_date` (`JJJJ-MM-TT`, der
Freitag der Woche) und `summary`, zum Beispiel „Heizöl 1,6519 €/l (−3,0 %),
Füllung 1.500 l: 2.478 €, Woche vom 20.11.2026“, fertig für eine Nachricht.

## Dashboard

### Widget Heizölpreis

Der nationale Durchschnittspreis, grün, wenn er in der Woche gesunken ist,
orange, wenn er gestiegen ist; die Wochenänderung; die Kosten einer Füllung
(mit Litern in der Konfiguration); die Kurve der letzten 26 Wochen; der
Mittelwert des Vormonats; die Woche der Erhebung. Eine Einstellung blendet
jeden Block außer dem Preis aus. Das Widget braucht kein Gerät.

## Aktionen

**Download testen** (Reiter Konfiguration) lädt die Datei des Ministeriums
sofort und antwortet mit dem letzten Heizölpreis.

## Daten und Grenzen

- Die Quelle ist die Seite
  https://www.ecologie.gouv.fr/politiques-publiques/prix-produits-petroliers
  und ihre Arbeitsmappe „Prix HTT et TTC depuis janvier 2020“ (DGEC). Die
  Wochen sind auf ihren Freitag datiert; das Ministerium veröffentlicht
  meist am folgenden Montag.
- Die Integration liest die Seite und die Arbeitsmappe einmal am Tag und alle
  2 Stunden ab Montag 10:00 UTC, bis die neue Woche da ist. Eine unveränderte
  Datei wird nicht erneut geladen (ETag). Das sind ein paar kleine Anfragen am
  Tag.
- Der Dateiname ändert sich ab und zu: Die Integration sucht den Link bei
  jedem Lesen in der Seite und nimmt sonst den letzten Link, der funktioniert
  hat.
- Eine Woche, die älter als 35 Tage ist, wird nicht angezeigt: lieber kein
  Wert als ein alter.
- Der Mittelwert des Vormonats ist der Mittelwert der Wochen dieses Monats,
  wie in der Monatstabelle des Ministeriums.
- Tankstellenpreise: Die Kraftstoffpreis-Integrationen des Stores lesen sie
  Tankstelle für Tankstelle, aber ohne Heizöl. Ein Tankfüllstandssensor
  (OilFox …) sagt, wann du bestellen solltest; diese Integration sagt, zu
  welchem Preis.

## Fehlerbehebung

- **„Die Preise des Ministeriums können gerade nicht geladen werden“**:
  Gladys hat keinen Internetzugang, oder die Seite des Ministeriums ist nicht
  erreichbar; die Integration versucht es jede Stunde erneut.
- **„Die Preisdatei des Ministeriums ist nicht lesbar“**: Das Ministerium hat
  den Aufbau seiner Arbeitsmappe geändert; eröffne bitte ein Issue im
  Repository.
- **„Seit über einem Monat kein Preis“**: Das Ministerium veröffentlicht
  nicht mehr.
- **Kein Wert**: Füge zuerst die Geräte im Reiter Entdeckung hinzu; die Werte
  kommen innerhalb einer Minute.
- Mehr Details in den Protokollen der Integration (`LOG_LEVEL=debug`).

## Danksagung

Daten: Französisches Ministerium für ökologischen Wandel, DGEC, wöchentliche
Preise der Mineralölprodukte, öffentliche Daten. Integration von guim31 unter
der Apache-2.0-Lizenz.
