# Betrieb des stabilen Overlay-Routings

Der verbindliche Betriebsleitfaden wird auf Englisch unter
[`../stable-overlay-routing-operations.md`](../stable-overlay-routing-operations.md)
gepflegt. Dieses Dokument gilt für die lokale Einrichtung, Staging-Nachweise,
Produktionsfreigaben, DNS-Migration, Canary-Rollout, Rollback und den Umgang mit
kompromittierten Zugangsdaten.
Er legt außerdem die exakten Staging-Authorities (ohne `workers.dev`),
getrennte Raw-Path-Tokens für Staging und Produktion, feste Clerk-
Vertrauensquellen, gestuftes idempotentes Enrollment, Origin-Rewriting,
proxy-neutrales `Vary: Origin`, exakte POST-Ausnahmen und deaktivierte rohe
Worker-Logs fest.
