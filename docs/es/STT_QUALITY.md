# Mejoras de calidad de STT

La puerta de captura ahora reenvía inmediatamente las frases cortas y conserva
300 ms de audio silencioso previo al inicio de la voz. La configuración
`minChunkMs` existente ya no suprime respuestas breves en directo. La medición RMS
sigue siendo una heurística de ruido, no un detector de voz entrenado.

Las cargas a Fish y ElevenLabs prefieren una pausa de 900 ms después de al menos
600 ms de audio, con un máximo de 12 segundos durante el habla continua. El VAD
por fotogramas de la carga conserva los fragmentos breves de voz rodeados de
silencio. Las cargas siguen siendo secuenciales; los retrasos prolongados del
proveedor pueden aumentar el búfer y la latencia. Al detenerse, se envía el audio
restante. El audio no se duplica entre solicitudes.

STT solicita explícitamente Fish `transcribe-1-pro` mediante el adaptador ASR
compartido. Los demás consumidores del adaptador mantienen `transcribe-1` salvo
que soliciten Pro. Pro puede tener otra tarifa; se puede cambiar con
`asr.fishaudioModel='transcribe-1'`.

El modo automático de Deepgram Nova-3 sigue usando `language=multi` para alternar
entre alemán e inglés. La página de ajustes permite indicar nombres y vocabulario
separados por comas; se envían como `keyterm` tanto en solicitudes en directo como
en cargas. No se cambia de proveedor automáticamente ni se modifican credenciales
guardadas.

ElevenLabs sigue utilizando Scribe v2 por lotes. Se corrigió la etiqueta del
modelo, se respetan las indicaciones de idioma fijas, se desactivan las etiquetas
de eventos de audio para los subtítulos y se normalizan correctamente los códigos
de idioma devueltos `eng`/`deu`. ElevenLabs en tiempo real y un VAD entrenado son
integraciones futuras, fuera de este cambio.

Usa Node 22, el runtime del proyecto, para las pruebas (el complemento SQLite usa
ABI 127). Sigue siendo necesaria una grabación real con micrófono y dos idiomas
para medir errores de palabras, precisión al alternar idiomas, retraso de
subtítulos y costes del proveedor. Las pruebas unitarias validan el transporte,
las opciones y la conservación del audio, pero no la calidad de reconocimiento de
una voz.

## Verificación del 3 de octubre de 2026

Las 23 suites de STT/Fish pasaron con el runtime Node 22 incluido (127 pruebas).
Después se comprobaron una prueba adicional de regresión de términos clave en
directo y una validación de entrada de audio con las dos suites afectadas
(18 pruebas superadas).

Un WAV sintético de 15,31 segundos combinó alemán, inglés y la frase mixta
«Ich brauche einen new follower alert und danach geht es weiter». Las solicitudes
multilingües reales de Deepgram Nova-3, por lotes y en directo, con términos clave,
transcribieron todas las palabras pronunciadas. Hubo variaciones de mayúsculas y
puntuación. La clave API solo se proporcionó en la memoria del proceso y no se
guardó en el repositorio ni en la configuración. Fue una comprobación sintética
de integración con la API, no una prueba comparativa de micrófono o acentos.
