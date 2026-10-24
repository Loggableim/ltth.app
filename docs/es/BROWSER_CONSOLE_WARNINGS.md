# Advertencias de la consola del navegador – notas técnicas

## Alcance

Esta guía ayuda a clasificar las advertencias de la consola del navegador en la versión actual de LTTH. Los mensajes varían según el navegador, la versión y los recursos cargados. Un ejemplo no demuestra que una integración concreta esté cargada actualmente.

## Errores de medios y audio

Mensajes como «Media resource could not be decoded» pueden afectar a la reproducción. Primero revisa la URL exacta y el archivo de origen indicados por la consola. En esta versión del código, el panel usa una fuente WAV breve y válida para desbloquear la reproducción de audio. Si vuelve a aparecer la advertencia, reprodúcela con la versión actual e inspecciona el recurso de audio cargado.

## Prefijos CSS

Los navegadores pueden avisar sobre propiedades como -webkit- o -moz-. Pueden ser alternativas intencionadas para mantener la compatibilidad. Comprueba el archivo y la línea indicados; elimina un prefijo solo después de confirmar que no afectará a los navegadores compatibles.

## Selectores y reglas desconocidos

Ante una pseudoclase o regla at desconocida, la consola suele indicar la hoja de estilos afectada. Usa esa fuente para determinar si procede de LTTH, de un complemento o de una dependencia empaquetada. Corrige las reglas obsoletas cuando pertenezcan al código activo del proyecto.

## Pasos de diagnóstico

1. Anota el navegador y su versión, el mensaje exacto, el archivo y la línea.
2. Recarga el panel en una sesión nueva y comprueba si se reproduce.
3. Identifica el recurso indicado en la pestaña Red de la sesión actual.
4. Investiga los errores y las solicitudes fallidas de LTTH; filtra advertencias solo después de comprobar su origen real.

No apliques filtros generales por nombres de archivo antiguos o integraciones anteriores. Usa la fuente que muestra la consola actual.
