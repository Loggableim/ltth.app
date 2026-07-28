# Operaciones de enrutamiento estable de overlays

El manual operativo autoritativo se mantiene en inglés en
[`../stable-overlay-routing-operations.md`](../stable-overlay-routing-operations.md).
Ese documento rige la configuración local, las pruebas de staging, las
aprobaciones de producción, la migración DNS, el despliegue canario, la
reversión y la respuesta ante credenciales comprometidas.
También define las autoridades exactas de staging (sin `workers.dev`), tokens
raw-path distintos para staging y producción, confianza fija de Clerk,
enrollment preparado e idempotente, reescritura de Origin,
`Vary: Origin` neutral para proxies, excepciones POST exactas y logs crudos del
Worker desactivados.
