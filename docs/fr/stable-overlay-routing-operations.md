# Exploitation du routage stable des overlays

Le guide d'exploitation de référence est maintenu en anglais dans
[`../stable-overlay-routing-operations.md`](../stable-overlay-routing-operations.md).
Ce document régit la configuration locale, les preuves de staging, les
autorisations de production, la migration DNS, le déploiement canari, le retour
arrière et la réponse aux compromissions d'identifiants.
Il définit aussi les autorités exactes de staging (sans `workers.dev`), des
jetons raw-path distincts pour staging et production, une confiance Clerk
fixe, un enrollment préparé et idempotent, la réécriture d'Origin,
`Vary: Origin` neutre pour les proxies, des exceptions POST exactes et les
logs Worker bruts désactivés.
