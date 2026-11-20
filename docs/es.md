# Prix du fioul

El precio medio nacional semanal del **gasóleo de calefacción en Francia** en
Gladys, publicado por el ministerio francés de Transición Ecológica (DGEC,
_Direction générale de l'énergie et du climat_), para saber cuándo llenar su
depósito.

El servicio es francés: son medias nacionales francesas, en euros por litro,
con todos los impuestos, para entregas de 2000 a 4999 litros. **No es el
precio de su proveedor**: muestran la tendencia y el nivel que cabe esperar.

Sin relación con el ministerio francés. Desarrollada sin depósito ni cuenta
de proveedor, a partir de los datos públicos: sus comentarios son
bienvenidos.

## Lo que obtiene

- Un dispositivo **Precio del gasóleo de calefacción**: el precio en €/l, su
  variación en una semana en %, la media del mes anterior, el coste estimado
  del llenado (con el volumen que suele pedir) y la semana del registro.
- Como opción, un segundo dispositivo con los **carburantes** del mismo
  archivo (diésel, SP95-E10, SP95-E5, SP98, E85, GLP, gasóleo B): precio y
  variación semanal de cada uno.
- Un disparador de escena **Nuevo precio del gasóleo C**, una vez por semana,
  filtrable por tendencia (a la baja, estable, al alza), con un resumen listo
  para un mensaje.
- Un widget del panel: el precio, su tendencia, el coste del llenado, la
  curva de los últimos seis meses y la media del mes anterior.

## Requisitos

- Gladys 5.3.0 o posterior.
- Acceso a Internet desde Gladys (`www.ecologie.gouv.fr`).
- Ninguna cuenta ni clave.

## Instalación

En Gladys, abra **Integraciones → Instalar desde GitHub** e introduzca la
dirección del repositorio: `https://github.com/guim31/gladys-fioul`.

## Configuración

| Campo                           | Función                                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Litros de un llenado (opcional) | El volumen que suele pedir, para el coste estimado del llenado (precio × litros, en euros enteros). 0: sin función de coste.                                      |
| También carburantes (opcional)  | Las medias nacionales de los carburantes del mismo archivo, en un segundo dispositivo. Ninguno por defecto.                                                       |
| Idioma de los nombres           | Idioma de los nombres de dispositivos y funciones (fijados al añadir un dispositivo), de la fecha de la semana y del resumen del disparador. Francés por defecto. |

Abra después la pestaña **Descubrimiento** de la integración y añada los
dispositivos. Cambiar los litros o los carburantes cambia los dispositivos:
Gladys propone entonces **Actualizarlos** en la pestaña Descubrimiento.

## Dispositivos

### Precio del gasóleo de calefacción

| Función                        | Tipo               | Ejemplo (semana del 13/11/2026) |
| ------------------------------ | ------------------ | ------------------------------- |
| Precio con impuestos (€/l)     | Moneda, euros      | 1,703                           |
| Variación en 1 semana (%)      | Moneda, porcentaje | −1,7                            |
| Media del mes anterior (€/l)   | Moneda, euros      | 1,9253 (octubre)                |
| Coste estimado del llenado (€) | Moneda, euros      | 2555 (1500 litros)              |
| Semana del registro            | Texto              | Semana del 13 nov 2026          |

Gladys no tiene unidad €/l: las funciones de precio muestran el símbolo del
euro, y su nombre indica «por litro».

### Precios de carburantes – media de Francia

Para cada carburante elegido: su precio en €/l y su variación semanal en %, y
luego la semana del registro.

## Escenas

### Precio por debajo de un umbral

No hace falta ningún disparador especial: en una escena, elija **Valor de un
dispositivo** en la función de precio, por ejemplo «Precio con impuestos
(€/l) menor que 1,20».

### Una bajada de N %

Lo mismo con la variación: «Variación en 1 semana (%) menor que −3» inicia la
escena cuando el precio bajó más de un 3 % en la semana.

### Nuevo precio del gasóleo C

Se activa una vez por semana, cuando el ministerio publica una nueva semana
(nunca para la semana ya conocida al iniciar la integración). Filtro: la
tendencia de la semana (a la baja, estable, al alza; vacío para todas).
Variables: `price` (€/l), `change` (%), `trend` (`down`, `stable` o `up`),
`fill_cost` (€, 0 sin litros), `week_date` (`AAAA-MM-DD`, el viernes de la
semana) y `summary`, por ejemplo «Gasóleo C 1,6519 €/l (−3,0 %), Llenado de
1500 l: 2478 €, Semana del 20 nov 2026», listo para un mensaje.

## Panel

### Widget Precio del gasóleo C

El precio medio nacional, en verde cuando bajó en la semana, en naranja
cuando subió; la variación semanal; el coste del llenado (con litros fijados
en la configuración); la curva de las últimas 26 semanas; la media del mes
anterior; la semana del registro. Un ajuste oculta cada bloque salvo el
precio. El widget no necesita ningún dispositivo.

## Acciones

**Probar la descarga** (pestaña Configuración) descarga en el acto el archivo
del ministerio y responde con el último precio del gasóleo de calefacción.

## Datos y límites

- La fuente es la página
  https://www.ecologie.gouv.fr/politiques-publiques/prix-produits-petroliers
  y su libro «Prix HTT et TTC depuis janvier 2020» (DGEC). Las semanas llevan
  la fecha de su viernes; el ministerio suele publicar el lunes siguiente.
- La integración lee la página y el libro una vez al día, y cada 2 horas
  desde el lunes a las 10:00 UTC hasta que sale la nueva semana. Un archivo
  sin cambios no se vuelve a descargar (ETag). Son unas pocas solicitudes
  pequeñas al día.
- El nombre del archivo cambia de vez en cuando: la integración busca el
  enlace en la página en cada lectura y, si no, usa el último enlace que
  funcionó.
- Una semana de más de 35 días no se muestra: mejor ningún valor que uno
  antiguo.
- La media del mes anterior es la media de las semanas de ese mes, como en la
  tabla mensual del ministerio.
- Precios de carburantes en gasolineras: las integraciones de «precios de
  carburantes» del store los leen gasolinera por gasolinera, pero sin el
  gasóleo de calefacción. Un sensor de nivel del depósito (OilFox…) indica
  cuándo pedir; esta integración indica a qué precio.

## Solución de problemas

- **«No se pueden descargar los precios del ministerio»**: Gladys no tiene
  acceso a Internet, o el sitio del ministerio no está disponible; la
  integración vuelve a intentarlo cada hora.
- **«El archivo de precios del ministerio no se puede leer»**: el ministerio
  cambió el formato de su libro; abra una incidencia en el repositorio.
- **«Ningún precio desde hace más de un mes»**: el ministerio dejó de
  publicar.
- **Ningún valor**: añada primero los dispositivos en la pestaña
  Descubrimiento; los valores llegan en un minuto.
- Más detalles en los registros de la integración (`LOG_LEVEL=debug`).

## Créditos

Datos: ministerio francés de Transición Ecológica, DGEC, precios semanales de
los productos petrolíferos, datos públicos. Integración de guim31 bajo la
licencia Apache 2.0.
